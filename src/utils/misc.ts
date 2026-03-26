import type {
  BuildFailure,
  Location,
  Message,
  Note,
  PartialMessage,
  PartialNote,
} from "../types.ts";
import { encodeUTF8, getDecodeUTF8 } from "./codec.ts";
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  mustBeArray,
  mustBeObjectOrNull,
  mustBeString,
} from "./validation.ts";

export function createObjectStash<T = unknown>(): {
  clear(): void;
  load(id: number): T | undefined;
  store(value: T): number;
} {
  const map = new Map<number, T>();
  let nextID = 0;

  return {
    clear() {
      map.clear();
    },
    load(id: number): T | undefined {
      return map.get(id);
    },
    store(value: T): number {
      if (value === void 0) return -1;
      const id = nextID++;
      map.set(id, value);
      return id;
    },
  };
}

interface StreamIn {
  readFileSync?: (path: string, encoding: string) => string;
}

export function extractCallerV8(
  e: Error,
  streamIn: StreamIn,
  ident: string,
): () => { text: string; location: Location } | undefined {
  let note: { text: string; location: Location } | undefined;
  let tried = false;

  return () => {
    if (tried) return note;
    tried = true;

    try {
      const lines = (e.stack + "").split("\n");
      lines.splice(1, 1);
      const location = parseStackLinesV8(streamIn, lines, ident);
      if (location) {
        note = { text: e.message, location };
        return note;
      }
    } catch {
      // Ignore
    }
  };
}

export function extractErrorMessageV8(
  e: unknown,
  streamIn: StreamIn,
  _stash: ReturnType<typeof createObjectStash> | undefined,
  pluginName: string,
): Message {
  let text = "Internal error";
  let location: Location | null = null;

  try {
    text = ((e as { message?: string })?.message || e) + "";
  } catch {
    // Ignore
  }

  try {
    location = parseStackLinesV8(streamIn, ((e as Error).stack + "").split("\n"), "");
  } catch {
    // Ignore
  }

  return {
    id: "",
    pluginName,
    text,
    location,
    notes: [],
    detail: -1,
  };
}

function parseStackLinesV8(
  streamIn: StreamIn,
  lines: string[],
  ident: string,
): Location | null {
  const encodeUTF8Func = encodeUTF8;
  const at = "    at ";

  if (
    streamIn.readFileSync
    && !lines[0].startsWith(at)
    && lines[1].startsWith(at)
  ) {
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i];
      if (!line.startsWith(at)) continue;
      line = line.slice(at.length);

      while (true) {
        let match = /^(?:new |async )?\S+ \((.*)\)$/.exec(line);
        if (match) {
          line = match[1];
          continue;
        }

        match = /^eval at \S+ \((.*)\)(?:, \S+:\d+:\d+)?$/.exec(line);
        if (match) {
          line = match[1];
          continue;
        }

        match = /^(\S+):(\d+):(\d+)$/.exec(line);
        if (match) {
          let contents: string | undefined;
          try {
            contents = streamIn.readFileSync!(match[1], "utf8");
          } catch {
            break;
          }

          const lineText = contents.split(/\r\n|\r|\n|\u2028|\u2029/)[+match[2] - 1]
            || "";
          const column = +match[3] - 1;
          const length = lineText.slice(column, column + ident.length) === ident
            ? ident.length
            : 0;

          return {
            file: match[1],
            namespace: "file",
            line: +match[2],
            column: encodeUTF8Func(lineText.slice(0, column)).length,
            length: encodeUTF8Func(lineText.slice(column, column + length)).length,
            lineText: lineText + "\n" + lines.slice(1).join("\n"),
            suggestion: "",
          };
        }
        break;
      }
    }
  }

  return null;
}

export function failureErrorWithLog(
  text: string,
  errors: Message[],
  warnings: Message[],
): BuildFailure {
  const limit = 5;
  text += errors.length < 1
    ? ""
    : ` with ${errors.length} error${errors.length < 2 ? "" : "s"}:`
      + errors.slice(0, limit + 1).map((e, i) => {
        if (i === limit) return "\n...";
        if (!e.location) {
          return `
error: ${e.text}`;
        }
        const { file, line, column } = e.location;
        const pluginText = e.pluginName ? `[plugin: ${e.pluginName}] ` : "";
        return `
${file}:${line}:${column}: ERROR: ${pluginText}${e.text}`;
      }).join("");

  const error = new Error(text) as BuildFailure;

  Object.defineProperty(error, "errors", {
    configurable: true,
    enumerable: true,
    get: () => errors,
    set: (value: Message[]) =>
      Object.defineProperty(error, "errors", {
        configurable: true,
        enumerable: true,
        value,
      }),
  });

  Object.defineProperty(error, "warnings", {
    configurable: true,
    enumerable: true,
    get: () => warnings,
    set: (value: Message[]) =>
      Object.defineProperty(error, "warnings", {
        configurable: true,
        enumerable: true,
        value,
      }),
  });

  return error;
}

export function replaceDetailsInMessages(
  messages: Message[],
  stash: ReturnType<typeof createObjectStash>,
): Message[] {
  for (const message of messages) {
    message.detail = stash.load(message.detail as number);
  }
  return messages;
}

export function sanitizeLocation(
  location: unknown,
  where: string,
  _terminalWidth: number | undefined,
): Location | null {
  if (location == null) return null;

  const keys: Record<string, boolean> = {};
  const file = getFlag<string>(
    location as Record<string, unknown>,
    keys,
    "file",
    mustBeString,
  );
  const namespace = getFlag<string>(
    location as Record<string, unknown>,
    keys,
    "namespace",
    mustBeString,
  );
  const line = getFlag<number>(
    location as Record<string, unknown>,
    keys,
    "line",
    mustBeIntegerForSanitize,
  );
  const column = getFlag<number>(
    location as Record<string, unknown>,
    keys,
    "column",
    mustBeIntegerForSanitize,
  );
  const length = getFlag<number>(
    location as Record<string, unknown>,
    keys,
    "length",
    mustBeIntegerForSanitize,
  );
  const lineText = getFlag<string>(
    location as Record<string, unknown>,
    keys,
    "lineText",
    mustBeString,
  );
  const suggestion = getFlag<string>(
    location as Record<string, unknown>,
    keys,
    "suggestion",
    mustBeString,
  );
  checkForInvalidFlags(location as Record<string, unknown>, keys, where);

  return {
    file: file || "",
    namespace: namespace || "",
    line: line || 0,
    column: column || 0,
    length: length || 0,
    lineText: lineText || "",
    suggestion: suggestion || "",
  };
}

function mustBeIntegerForSanitize(value: unknown): string | null {
  if (typeof value === "number" && value === (value | 0)) return null;
  return "an integer";
}

export function sanitizeMessages(
  messages: PartialMessage[],
  property: string,
  stash: ReturnType<typeof createObjectStash> | null,
  fallbackPluginName: string,
  terminalWidth: number | undefined,
): Message[] {
  const messagesClone: Message[] = [];
  let index = 0;

  for (const message of messages) {
    const keys: Record<string, boolean> = {};
    const id = getFlag<string>(
      message as Record<string, unknown>,
      keys,
      "id",
      mustBeString,
    );
    const pluginName = getFlag<string>(
      message as Record<string, unknown>,
      keys,
      "pluginName",
      mustBeString,
    );
    const text = getFlag<string>(
      message as Record<string, unknown>,
      keys,
      "text",
      mustBeString,
    );
    const location = getFlag<Partial<Location> | null>(
      message as Record<string, unknown>,
      keys,
      "location",
      mustBeObjectOrNull,
    );
    const notes = getFlag<PartialNote[]>(
      message as Record<string, unknown>,
      keys,
      "notes",
      mustBeArray,
    );
    const detail = getFlag<unknown>(
      message as Record<string, unknown>,
      keys,
      "detail",
      canBeAnything,
    );
    const where = `in element ${index} of "${property}"`;
    checkForInvalidFlags(message as Record<string, unknown>, keys, where);

    const notesClone: Note[] = [];
    if (notes) {
      for (const note of notes) {
        const noteKeys: Record<string, boolean> = {};
        const noteText = getFlag<string>(
          note as Record<string, unknown>,
          noteKeys,
          "text",
          mustBeString,
        );
        const noteLocation = getFlag<Partial<Location> | null>(
          note as Record<string, unknown>,
          noteKeys,
          "location",
          mustBeObjectOrNull,
        );
        checkForInvalidFlags(note as Record<string, unknown>, noteKeys, where);
        notesClone.push({
          text: noteText || "",
          location: sanitizeLocation(noteLocation, where, terminalWidth),
        });
      }
    }

    messagesClone.push({
      id: id || "",
      pluginName: pluginName || fallbackPluginName,
      text: text || "",
      location: sanitizeLocation(location, where, terminalWidth),
      notes: notesClone,
      detail: stash ? stash.store(detail) : -1,
    });
    index++;
  }

  return messagesClone;
}

export function convertOutputFiles(file: {
  path: string;
  contents: Uint8Array;
  hash: string;
}): {
  path: string;
  contents: Uint8Array;
  hash: string;
  text: string;
} {
  const decodeUTF8 = getDecodeUTF8();
  let cachedContents: Uint8Array | undefined;
  let cachedText: string | undefined;
  return {
    path: file.path,
    contents: file.contents,
    hash: file.hash,
    get text(): string {
      const binary = this.contents;
      if (cachedContents !== binary) {
        cachedContents = binary;
        cachedText = decodeUTF8(binary);
      }
      return cachedText!;
    },
  };
}
