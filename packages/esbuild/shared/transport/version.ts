/**
 * @module
 * The pinned esbuild binary version. This is the version of the upstream
 * Go service that the spawned binary reports in the first wire packet; it
 * is intentionally independent of the package version in `deno.json`. The
 * native transport asserts the two match at startup
 * (see {@link ./channel.ts:createChannel}).
 */

/** The esbuild binary version string. */
export const ESBUILD_VERSION: string = '0.28.1'
