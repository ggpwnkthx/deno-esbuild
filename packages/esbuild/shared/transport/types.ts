/**
 * @module
 * Public interface surface for the transport: stream contract,
 * `Service`/`StreamService` interface pair, `ServiceEnv` knobs, and the
 * default no-op `StreamFS` used by the WASM transport.
 *
 * @see ./channel.ts
 * @see ./service.ts
 * @see ./sync_stubs.ts
 */
import type * as types from '../types/mod.ts'

/** Input end of the stdio channel used to drive the esbuild service
 * process/worker. The transport writes to the service via `writeToStdin`,
 * and the optional `readFileSync` is used by the stack-trace helpers. */
export interface StreamIn {
  /** Writes a packet to the service's stdin. */
  writeToStdin: (data: Uint8Array) => void
  /** Optional synchronous file reader used by the stack-trace helpers. */
  readFileSync?: (path: string, encoding: 'utf8') => string
  /** Whether the host transport is synchronous (i.e. uses `buildSync`). */
  isSync: boolean
  /** Whether the transport can write to the real filesystem. */
  hasFS: boolean
  /** Re-export of the full esbuild namespace. */
  esbuild: types.PluginBuild['esbuild']
}

/** Output end of the stdio channel from the esbuild service process/worker. */
export interface StreamOut {
  /** Feeds a chunk of stdout bytes into the channel parser. */
  readFromStdout: (data: Uint8Array) => void
  /** Notifies the host that the service has disconnected. */
  afterClose: (error: Error | null) => void
  /** Request dispatcher the host invokes to make RPC calls. */
  service: StreamService
}

/** File system shim passed to the `transform()` service call so that
 * generated output files can be read back into the host. */
export interface StreamFS {
  /** Writes `contents` to a temp file and reports the path via `callback`. */
  writeFile(
    contents: string | Uint8Array,
    callback: (path: string | null) => void,
  ): void
  /** Reads the file at `path` and yields its contents as a UTF-8 string. */
  readFile(
    path: string,
    callback: (err: Error | null, contents: string | null) => void,
  ): void
}

/** Reference-counting helpers used to extend a stream's lifetime while
 * external code is waiting on its callbacks. */
export interface Refs {
  /** Increment the reference count. */
  ref(): void
  /** Decrement the reference count. */
  unref(): void
}

/**
 * The four main RPC methods used to communicate with the esbuild service:
 * `buildOrContext`, `transform`, `formatMessages`, and `analyzeMetafile`.
 * Implemented by {@link ./channel.ts:createChannel}.
 */
export interface StreamService {
  /** Sends a `build` (or `context`) request to the service. */
  buildOrContext(args: {
    callName: string
    refs: Refs | null
    options: types.BuildOptions
    isTTY: boolean
    defaultWD: string
    callback: (
      err: Error | null,
      res: types.BuildResult | types.BuildContext | null,
    ) => void
  }): void

  /** Sends a `transform` request to the service. */
  transform(args: {
    callName: string
    refs: Refs | null
    input: string | Uint8Array
    options: types.TransformOptions
    isTTY: boolean
    fs: StreamFS
    callback: (err: Error | null, res: types.TransformResult | null) => void
  }): void

  /** Sends a `formatMessages` request to the service. */
  formatMessages(args: {
    callName: string
    refs: Refs | null
    messages: types.PartialMessage[]
    options: types.FormatMessagesOptions
    callback: (err: Error | null, res: string[] | null) => void
  }): void

  /** Sends an `analyzeMetafile` request to the service. */
  analyzeMetafile(args: {
    callName: string
    refs: Refs | null
    metafile: string
    options: types.AnalyzeMetafileOptions | undefined
    callback: (err: Error | null, res: string | null) => void
  }): void
}

/**
 * The public, transport-agnostic esbuild service surface.
 * Implemented by the native-binary transport (`mod.ts`) and the WASM
 * transport (`wasm.ts`) using a {@link StreamService} as the underlying
 * RPC layer.
 */
export interface Service {
  /** Implementation of {@link types.build} for this transport. */
  build: typeof types.build
  /** Implementation of {@link types.context} for this transport. */
  context: typeof types.context
  /** Implementation of {@link types.transform} for this transport. */
  transform: typeof types.transform
  /** Implementation of {@link types.formatMessages} for this transport. */
  formatMessages: typeof types.formatMessages
  /** Implementation of {@link types.analyzeMetafile} for this transport. */
  analyzeMetafile: typeof types.analyzeMetafile
}

/** Per-transport knobs for {@link ./service.ts:createService}. */
export interface ServiceEnv {
  /** Whether the host's stdout is a TTY. */
  isTTY: boolean
  /** Default working directory for builds that don't pin one. */
  defaultWD: string
  /** File system shim used to shuttle transform output back. */
  transformFs?: StreamFS
}

/**
 * Default in-memory {@link StreamFS} used by transports that cannot read or
 * write real temp files (i.e. the WASM transport). The esbuild WASM service
 * surfaces transform input/output as in-process strings, so neither `readFile`
 * nor `writeFile` is ever invoked.
 */
export const defaultTransformFs: StreamFS = {
  readFile(_path, callback) {
    callback(new Error('Internal error'), null)
  },
  writeFile(_contents, callback) {
    callback(null)
  },
}
