/**
 * @module
 * Builds the `rebuild` method returned from the `BuildContext` lifecycle.
 *
 * The `rebuild` flow is the most complex of the five lifecycle methods
 * because it coordinates with the `on-end` callback registered by the
 * context builder to recover the latest build result. Extracting it into
 * its own file keeps the other lifecycle factories together in
 * {@link ./build_context_lifecycle.ts}.
 *
 * @see ./build_context_lifecycle.ts
 * @see ./build_context.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import type { BuildContextContext } from './build_context_lifecycle.ts'

/** Builds the `rebuild` method. */
export function makeRebuild(ctx: BuildContextContext): () => Promise<
  types.BuildResult
> {
  const { buildKey, refs, rebuildState } = ctx
  return () => {
    if (!rebuildState.latestResultPromise) {
      rebuildState.latestResultPromise = new Promise<types.BuildResult>(
        (resolve, reject) => {
          let settlePromise: (() => void) | undefined
          rebuildState.provideLatestResult = (err, result) => {
            if (!settlePromise) {
              settlePromise = () => err ? reject(err) : resolve(result!)
            }
          }
          const triggerAnotherBuild = (): void => {
            const request: protocol.RebuildRequest = {
              command: 'rebuild',
              key: buildKey,
            }
            ctx.sendRequest<
              protocol.RebuildRequest,
              protocol.RebuildResponse
            >(
              refs,
              request,
              (error, _response) => {
                if (error) {
                  reject(new Error(error))
                } else if (settlePromise) {
                  // It's possible to settle the promise that we returned
                  // from this "rebuild()" function earlier than this
                  // point. However, at that point the user could call
                  // "rebuild()" again which would unexpectedly merge with
                  // the same build that's still ongoing. To prevent that,
                  // we defer settling the promise until now when we know
                  // that the build has finished.
                  settlePromise()
                } else {
                  // When we call "rebuild()", we call out to the Go
                  // "Rebuild()" API over IPC. That may trigger a build,
                  // but may also "join" an existing build. At some point
                  // the Go code sends us an "on-end" message with the
                  // build result to tell us to run our "onEnd" plugins.
                  // We capture that build result and return it here.
                  //
                  // However, there's a potential problem: For performance,
                  // the Go code will only send us the result if it's
                  // needed, which only happens if there are "onEnd"
                  // callbacks or if "rebuild" was called. So there's a
                  // race where the following things happen:
                  //
                  // 1. Go starts a rebuild (e.g. due to watch mode)
                  // 2. JS calls "rebuild()"
                  // 3. Go ends the build and starts Go's "OnEnd"
                  //    callback
                  // 4. Go's "OnEnd" callback sees no need to send the
                  //    result
                  // 5. JS asks Go to rebuild, which merges with the
                  //    existing build
                  // 6. Go's existing build ends
                  // 7. The merged build ends, which wakes up JS and
                  //    ends up here
                  //
                  // In that situation we didn't get an "on-end" message
                  // since Go thought it wasn't necessary. In that
                  // situation, we trigger another rebuild below so that
                  // Go will (almost surely) send us an "on-end" message
                  // next time. I suspect that this is a very rare case,
                  // so the performance impact of building twice
                  // shouldn't really matter. It also only happens when
                  // "rebuild()" is used with "watch()" and/or
                  // "serve()".
                  triggerAnotherBuild()
                }
              },
            )
          }
          triggerAnotherBuild()
        },
      )
    }
    return rebuildState.latestResultPromise
  }
}
