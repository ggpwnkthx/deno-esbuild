import type * as esbuild from "esbuild";
import { MediaType, RequestedModuleType } from "@deno/loader";
import type { WorkspaceOptions } from "@deno/loader";

/**
 * Converts a media type to an esbuild loader identifier.
 */
export function mediaToLoader(type: MediaType): esbuild.Loader {
  switch (type) {
    case MediaType.Jsx:
      return "jsx";
    case MediaType.JavaScript:
    case MediaType.Mjs:
    case MediaType.Cjs:
      return "js";
    case MediaType.TypeScript:
    case MediaType.Mts:
    case MediaType.Dmts:
    case MediaType.Dcts:
      return "ts";
    case MediaType.Tsx:
      return "tsx";
    case MediaType.Css:
      return "css";
    case MediaType.Json:
      return "json";
    case MediaType.Html:
      return "default";
    case MediaType.Sql:
      return "default";
    case MediaType.Wasm:
      return "binary";
    case MediaType.SourceMap:
      return "json";
    case MediaType.Unknown:
      return "default";
    default:
      return "default";
  }
}

/**
 * Maps an esbuild platform option to a workspace platform option.
 */
export function getPlatform(
  platform: esbuild.Platform | undefined,
): WorkspaceOptions["platform"] {
  switch (platform) {
    case "browser":
      return "browser";
    case "node":
      return "node";
    case "neutral":
    default:
      return undefined;
  }
}

/**
 * Determines the requested module type based on file extension and arguments.
 */
export function getModuleType(
  file: string,
  withArgs: Record<string, string>,
): RequestedModuleType {
  switch (withArgs.type) {
    case "text":
      return RequestedModuleType.Text;
    case "bytes":
      return RequestedModuleType.Bytes;
    case "json":
      return RequestedModuleType.Json;
    default:
      if (file.endsWith(".json")) {
        return RequestedModuleType.Json;
      }
      return RequestedModuleType.Default;
  }
}

// For some reason esbuild passes external specifiers to plugins.
// See: https://esbuild.github.io/api/#external
/**
 * Converts an external specifier pattern to a RegExp for matching.
 */
export function externalToRegex(external: string): RegExp {
  // Note: * becomes .* which matches across path separators (e.g. "foo/*" matches "foo/bar/baz").
  // This aligns with esbuild's external pattern behaviour where * is a greedy glob.
  return new RegExp(
    "^" + external.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&").replace(
      /\*/g,
      ".*",
    ) + "$",
  );
}
