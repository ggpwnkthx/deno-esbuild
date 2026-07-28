/**
 * @module
 * Builds the public {@link ./types.ts:Service} surface from a
 * {@link ./types.ts:StreamService} returned by {@link ./channel.ts:createChannel}.
 * This is the single, shared place where the `build` / `context` /
 * `transform` / `formatMessages` / `analyzeMetafile` Promise wrappers are
 * defined; both transports consume it.
 *
 * @see ./channel.ts
 * @see ./types.ts
 */
import type * as types from '../types/mod.ts'
import { defaultTransformFs, type Service, type ServiceEnv, type StreamService } from './types.ts'

/**
 * Builds the public {@link Service} surface from a {@link StreamService}
 * returned by {@link ./channel.ts:createChannel}.
 */
export function createService(service: StreamService, env: ServiceEnv): Service {
  const buildOrContext =
    (callName: 'build' | 'context') =>
    (options: types.BuildOptions): Promise<types.BuildResult | types.BuildContext> =>
      new Promise<types.BuildResult | types.BuildContext>((resolve, reject) =>
        service.buildOrContext({
          callName,
          refs: null,
          options,
          isTTY: env.isTTY,
          defaultWD: env.defaultWD,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      )

  return {
    build: buildOrContext('build') as typeof types.build,
    context: buildOrContext('context') as typeof types.context,
    transform: (input, options) =>
      new Promise<types.TransformResult>((resolve, reject) =>
        service.transform({
          callName: 'transform',
          refs: null,
          input,
          options: options || {},
          isTTY: env.isTTY,
          fs: env.transformFs ?? defaultTransformFs,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
    formatMessages: (messages, options) =>
      new Promise<string[]>((resolve, reject) =>
        service.formatMessages({
          callName: 'formatMessages',
          refs: null,
          messages,
          options,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
    analyzeMetafile: (metafile, options) =>
      new Promise<string>((resolve, reject) =>
        service.analyzeMetafile({
          callName: 'analyzeMetafile',
          refs: null,
          metafile: typeof metafile === 'string' ? metafile : JSON.stringify(metafile),
          options,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
  }
}
