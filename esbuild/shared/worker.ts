/**
 * @module
 * This module contains the web worker source code used by esbuild's WASM API to
 * run the Go-based esbuild binary in a browser Worker thread — handling WASM
 * loading, stdin/stdout forwarding to the main thread, and the Go runtime
 * integration.
 *
 * The worker expects to receive the WebAssembly module via `postMessage` and
 * then acts as a bridge: Go's `fs` hooks (`read`, `writeSync`) forward I/O over
 * `postMessage` back to the main thread where the actual stdio channel lives.
 *
 * @see ../wasm.ts
 */
import { ESBUILD_VERSION } from "./common.ts";

// Load the Go WebAssembly runtime, which provides the `Go` class and `fs`
// object that the rest of this module depends on. The file is shipped with
// the package and copied there by the build script from `$GOROOT/lib/wasm/`.
const wasmExecScript = await Deno.readTextFile(
  new URL("../wasm_exec.js", import.meta.url),
);
// eslint-disable-next-line @typescript-eslint/no-implied-eval
new Function(wasmExecScript)();

// Signal the main thread that we are ready to receive the wasm URL.
// Deno's module workers do not buffer messages sent before `onmessage` is
// set, so the main thread has to wait for this handshake before posting.
postMessage({ type: "ready" });

interface Go {
  argv: string[];
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): void;
}

// deno-lint-ignore no-explicit-any
declare function postMessage(message: any): void;

// deno-lint-ignore no-explicit-any
(self as unknown as { onmessage: (message: any) => void }).onmessage = (
  { data: wasm }: { data: WebAssembly.Module | string },
) => {
  const decoder = new TextDecoder();
  // deno-lint-ignore no-explicit-any
  const fs = (globalThis as any).fs;

  let stderr = "";
  fs.writeSync = (fd: number, buffer: Uint8Array) => {
    if (fd === 1) {
      postMessage(buffer);
    } else if (fd === 2) {
      stderr += decoder.decode(buffer);
      const parts = stderr.split("\n");
      if (parts.length > 1) console.log(parts.slice(0, -1).join("\n"));
      stderr = parts[parts.length - 1];
    } else {
      throw new Error("Bad write");
    }
    return buffer.length;
  };

  const stdin: Uint8Array[] = [];
  let resumeStdin: () => void;
  let stdinPos = 0;

  // deno-lint-ignore no-explicit-any
  (self as unknown as { onmessage: (message: any) => void }).onmessage = (
    { data }: { data: Uint8Array },
  ) => {
    if (data.length > 0) {
      stdin.push(data);
      if (resumeStdin) resumeStdin();
    }
    return go;
  };

  fs.read = (
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: null,
    callback: (err: Error | null, count?: number) => void,
  ) => {
    if (
      fd !== 0 || offset !== 0 || length !== buffer.length || position !== null
    ) {
      throw new Error("Bad read");
    }

    if (stdin.length === 0) {
      resumeStdin = () =>
        fs.read(fd, buffer, offset, length, position, callback);
      return;
    }

    const first = stdin[0];
    const count = Math.max(0, Math.min(length, first.length - stdinPos));
    buffer.set(first.subarray(stdinPos, stdinPos + count), offset);
    stdinPos += count;
    if (stdinPos === first.length) {
      stdin.shift();
      stdinPos = 0;
    }
    callback(null, count);
  };

  // deno-lint-ignore no-explicit-any
  const go: Go = new (globalThis as any).Go();
  go.argv = ["", `--service=${ESBUILD_VERSION}`];

  // Try to instantiate the module in the worker, then report back to the main thread
  tryToInstantiateModule(wasm, go).then(
    (instance) => {
      postMessage(null);
      go.run(instance);
    },
    (error) => {
      postMessage(error);
    },
  );

  return go;
};

async function tryToInstantiateModule(
  wasm: WebAssembly.Module | string,
  go: Go,
): Promise<WebAssembly.Instance> {
  if (wasm instanceof WebAssembly.Module) {
    return WebAssembly.instantiate(wasm, go.importObject);
  }

  const res = await fetch(wasm);
  if (!res.ok) throw new Error(`Failed to download ${JSON.stringify(wasm)}`);

  // Attempt to use the superior "instantiateStreaming" API first
  if (
    "instantiateStreaming" in WebAssembly &&
    /^application\/wasm($|;)/i.test(res.headers.get("Content-Type") || "")
  ) {
    const result = await WebAssembly.instantiateStreaming(res, go.importObject);
    return result.instance;
  }

  // Otherwise, fall back to the inferior "instantiate" API
  const bytes = await res.arrayBuffer();
  const result = await WebAssembly.instantiate(bytes, go.importObject);
  return result.instance;
}
