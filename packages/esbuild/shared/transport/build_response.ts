/**
 * @module
 * Maps a wire-format `BuildResponse` to the public `BuildResult` shape,
 * with onEnd-callback orchestration folded in.
 *
 * Extracted from {@link ./build_context.ts} so the orchestrator can stay
 * focused on plugin iteration and request/response wiring.
 *
 * @see ./build_context.ts
 * @see ../types/build.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import { failureErrorWithLog, replaceDetailsInMessages } from '../message_sanitize.ts'
import type { ObjectStash } from '../plugin_runner/object_stash.ts'
import type { RunOnEndCallbacks } from '../plugin_runner/types.ts'
import { convertOutputFiles, parseJSON } from './util.ts'

/** Callback signature consumed by {@link buildResponseToResult}. */
type BuildResponseResultCallback = (
  error: types.BuildFailure | null,
  result: types.BuildResult | null,
  onEndErrors: types.Message[],
  onEndWarnings: types.Message[],
) => void

/**
 * Builds a `BuildResult` from a wire `BuildResponse`, threading the
 * registered `onEnd` callbacks through `runOnEndCallbacks` and reporting
 * the collected errors and warnings via the supplied `callback`.
 */
export function buildResponseToResult(
  response: protocol.BuildResponse,
  details: ObjectStash,
  runOnEndCallbacks: RunOnEndCallbacks,
  callback: BuildResponseResultCallback,
): void {
  const result: types.BuildResult = {
    errors: replaceDetailsInMessages(response.errors, details),
    warnings: replaceDetailsInMessages(response.warnings, details),
    outputFiles: undefined,
    metafile: undefined,
    mangleCache: undefined,
  }
  const originalErrors = result.errors.slice()
  const originalWarnings = result.warnings.slice()
  if (response.outputFiles) {
    result.outputFiles = response.outputFiles.map(convertOutputFiles)
  }
  if (response.metafile && response.metafile.length) {
    result.metafile = parseJSON(response.metafile) as types.Metafile
  }
  if (response.mangleCache) result.mangleCache = response.mangleCache
  if (response.writeToStdout !== void 0) {
    console.log(
      protocol.decodeUTF8(response.writeToStdout).replace(/\n$/, ''),
    )
  }
  runOnEndCallbacks(result, (onEndErrors, onEndWarnings) => {
    if (originalErrors.length > 0 || onEndErrors.length > 0) {
      const error = failureErrorWithLog(
        'Build failed',
        originalErrors.concat(onEndErrors),
        originalWarnings.concat(onEndWarnings),
      )
      return callback(error, null, onEndErrors, onEndWarnings)
    }
    callback(null, result, onEndErrors, onEndWarnings)
  })
}
