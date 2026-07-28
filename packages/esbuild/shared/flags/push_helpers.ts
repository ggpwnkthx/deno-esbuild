/**
 * @module
 * Shared flag-push helpers used by both the `build` and `transform` flag
 * builders in {@link ./build.ts} and {@link ./transform.ts}.
 *
 * - {@link pushLogFlags} appends `--color`, `--log-level`, and `--log-limit`.
 * - {@link pushCommonFlags} appends the long tail of options shared between
 *   build and transform: target, format, minify, JSX, define, etc.
 *
 * @see ./build.ts
 * @see ./transform.ts
 */
import type * as types from '../types/mod.ts'
import {
  type CommonOptions,
  getFlag,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeInteger,
  mustBeObject,
  mustBeRegExp,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrObject,
  type OptionKeys,
} from '../validation.ts'
import { jsRegExpToGoRegExp } from '../regex.ts'
import { validateAndJoinStringArray, validateStringValue } from '../string_helpers.ts'

/** Appends the log-related CLI flags (`--color`, `--log-level`, `--log-limit`)
 * to `flags`. Called by both flag builders so the log shape is consistent. */
export function pushLogFlags(
  flags: string[],
  options: CommonOptions,
  keys: OptionKeys,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
): void {
  const color = getFlag(options, keys, 'color', mustBeBoolean)
  const logLevel = getFlag(options, keys, 'logLevel', mustBeString)
  const logLimit = getFlag(options, keys, 'logLimit', mustBeInteger)

  if (color !== void 0) flags.push(`--color=${color}`)
  else if (isTTY) flags.push(`--color=true`) // This is needed to fix "execFileSync" which buffers stderr
  flags.push(`--log-level=${logLevel || logLevelDefault}`)
  flags.push(`--log-limit=${logLimit || 0}`)
}

/** Appends the CLI flags shared between `build` and `transform` (target,
 * format, minify, JSX, define, etc.) to `flags`. Internal counterpart of
 * {@link pushLogFlags}. */
export function pushCommonFlags(
  flags: string[],
  options: CommonOptions,
  keys: OptionKeys,
): void {
  const legalComments = getFlag(options, keys, 'legalComments', mustBeString)
  const sourceRoot = getFlag(options, keys, 'sourceRoot', mustBeString)
  const sourcesContent = getFlag(
    options,
    keys,
    'sourcesContent',
    mustBeBoolean,
  )
  const target = getFlag(options, keys, 'target', mustBeStringOrArrayOfStrings)
  const format = getFlag(options, keys, 'format', mustBeString)
  const globalName = getFlag(options, keys, 'globalName', mustBeString)
  const mangleProps = getFlag(options, keys, 'mangleProps', mustBeRegExp)
  const reserveProps = getFlag(options, keys, 'reserveProps', mustBeRegExp)
  const mangleQuoted = getFlag(options, keys, 'mangleQuoted', mustBeBoolean)
  const minify = getFlag(options, keys, 'minify', mustBeBoolean)
  const minifySyntax = getFlag(options, keys, 'minifySyntax', mustBeBoolean)
  const minifyWhitespace = getFlag(
    options,
    keys,
    'minifyWhitespace',
    mustBeBoolean,
  )
  const minifyIdentifiers = getFlag(
    options,
    keys,
    'minifyIdentifiers',
    mustBeBoolean,
  )
  const lineLimit = getFlag(options, keys, 'lineLimit', mustBeInteger)
  const drop = getFlag(options, keys, 'drop', mustBeArrayOfStrings)
  const dropLabels = getFlag(options, keys, 'dropLabels', mustBeArrayOfStrings)
  const charset = getFlag(options, keys, 'charset', mustBeString)
  const treeShaking = getFlag(options, keys, 'treeShaking', mustBeBoolean)
  const ignoreAnnotations = getFlag(
    options,
    keys,
    'ignoreAnnotations',
    mustBeBoolean,
  )
  const jsx = getFlag(options, keys, 'jsx', mustBeString)
  const jsxFactory = getFlag(options, keys, 'jsxFactory', mustBeString)
  const jsxFragment = getFlag(options, keys, 'jsxFragment', mustBeString)
  const jsxImportSource = getFlag(
    options,
    keys,
    'jsxImportSource',
    mustBeString,
  )
  const jsxDev = getFlag(options, keys, 'jsxDev', mustBeBoolean)
  const jsxSideEffects = getFlag(
    options,
    keys,
    'jsxSideEffects',
    mustBeBoolean,
  )
  const define = getFlag(options, keys, 'define', mustBeObject)
  const logOverride = getFlag(options, keys, 'logOverride', mustBeObject)
  const supported = getFlag(options, keys, 'supported', mustBeObject)
  const pure = getFlag(options, keys, 'pure', mustBeArrayOfStrings)
  const keepNames = getFlag(options, keys, 'keepNames', mustBeBoolean)
  const platform = getFlag(options, keys, 'platform', mustBeString)
  const tsconfigRaw = getFlag(
    options,
    keys,
    'tsconfigRaw',
    mustBeStringOrObject,
  )
  const absPaths = getFlag(options, keys, 'absPaths', mustBeArrayOfStrings)

  if (legalComments) flags.push(`--legal-comments=${legalComments}`)
  if (sourceRoot !== void 0) flags.push(`--source-root=${sourceRoot}`)
  if (sourcesContent !== void 0) {
    flags.push(`--sources-content=${sourcesContent}`)
  }
  if (target) {
    flags.push(
      `--target=${
        validateAndJoinStringArray(
          Array.isArray(target) ? target : [target],
          'target',
        )
      }`,
    )
  }
  if (format) flags.push(`--format=${format}`)
  if (globalName) flags.push(`--global-name=${globalName}`)
  if (platform) flags.push(`--platform=${platform}`)
  if (tsconfigRaw) {
    flags.push(
      `--tsconfig-raw=${
        typeof tsconfigRaw === 'string' ? tsconfigRaw : JSON.stringify(tsconfigRaw)
      }`,
    )
  }

  if (minify) flags.push('--minify')
  if (minifySyntax) flags.push('--minify-syntax')
  if (minifyWhitespace) flags.push('--minify-whitespace')
  if (minifyIdentifiers) flags.push('--minify-identifiers')
  if (lineLimit) flags.push(`--line-limit=${lineLimit}`)
  if (charset) flags.push(`--charset=${charset}`)
  if (treeShaking !== void 0) flags.push(`--tree-shaking=${treeShaking}`)
  if (ignoreAnnotations) flags.push(`--ignore-annotations`)
  if (drop) {
    for (const what of drop) {
      flags.push(`--drop:${validateStringValue(what, 'drop')}`)
    }
  }
  if (dropLabels) {
    flags.push(
      `--drop-labels=${validateAndJoinStringArray(dropLabels, 'drop label')}`,
    )
  }
  if (absPaths) {
    flags.push(
      `--abs-paths=${validateAndJoinStringArray(absPaths, 'abs paths')}`,
    )
  }
  if (mangleProps) {
    flags.push(`--mangle-props=${jsRegExpToGoRegExp(mangleProps)}`)
  }
  if (reserveProps) {
    flags.push(`--reserve-props=${jsRegExpToGoRegExp(reserveProps)}`)
  }
  if (mangleQuoted !== void 0) flags.push(`--mangle-quoted=${mangleQuoted}`)

  if (jsx) flags.push(`--jsx=${jsx}`)
  if (jsxFactory) flags.push(`--jsx-factory=${jsxFactory}`)
  if (jsxFragment) flags.push(`--jsx-fragment=${jsxFragment}`)
  if (jsxImportSource) flags.push(`--jsx-import-source=${jsxImportSource}`)
  if (jsxDev) flags.push('--jsx-dev')
  if (jsxSideEffects) flags.push('--jsx-side-effects')

  if (define) {
    for (const key in define) {
      if (key.indexOf('=') >= 0) throw new Error(`Invalid define: ${key}`)
      flags.push(
        `--define:${key}=${validateStringValue(define[key], 'define', key)}`,
      )
    }
  }
  if (logOverride) {
    for (const key in logOverride) {
      if (key.indexOf('=') >= 0) {
        throw new Error(`Invalid log override: ${key}`)
      }
      flags.push(
        `--log-override:${key}=${validateStringValue(logOverride[key], 'log override', key)}`,
      )
    }
  }
  if (supported) {
    for (const key in supported) {
      if (key.indexOf('=') >= 0) throw new Error(`Invalid supported: ${key}`)
      const value = supported[key]
      if (typeof value !== 'boolean') {
        throw new Error(
          `Expected value for supported ${
            JSON.stringify(key)
          } to be a boolean, got ${typeof value} instead`,
        )
      }
      flags.push(`--supported:${key}=${value}`)
    }
  }
  if (pure) {
    for (const fn of pure) {
      flags.push(`--pure:${validateStringValue(fn, 'pure')}`)
    }
  }
  if (keepNames) flags.push('--keep-names')
}
