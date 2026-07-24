/**
 * @module
 * Builders that convert `BuildOptions` and `TransformOptions` into the
 * CLI-style flag arrays the esbuild service consumes over the wire.
 *
 * `flagsForBuildOptions` and `flagsForTransformOptions` are the public entry
 * points; they share `pushLogFlags` and `pushCommonFlags` so both code paths
 * emit consistent log levels, common flags (target, format, minify, etc.),
 * and JSX/define/log-override languages.
 */
import type * as types from './types.ts'
import {
  checkForInvalidFlags,
  type CommonOptions,
  getFlag,
  jsRegExpToGoRegExp,
  type MangleCache,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeEntryPoints,
  mustBeInteger,
  mustBeObject,
  mustBeRegExp,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrBoolean,
  mustBeStringOrObject,
  mustBeStringOrUint8Array,
  type OptionKeys,
  validateAndJoinStringArray,
  validateMangleCache,
  validateStringValue,
} from './validation.ts'
import * as protocol from './stdio_protocol.ts'

const buildLogLevelDefault = 'warning'
const transformLogLevelDefault = 'silent'

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

function pushCommonFlags(
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

export interface BuildFlagsResult {
  entries: [string, string][]
  flags: string[]
  write: boolean
  stdinContents: Uint8Array | null
  stdinResolveDir: string | null
  absWorkingDir: string | undefined
  nodePaths: string[]
  mangleCache: MangleCache | undefined
}

export function flagsForBuildOptions(
  callName: string,
  options: types.BuildOptions,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
  writeDefault: boolean,
): BuildFlagsResult {
  const flags: string[] = []
  const entries: [string, string][] = []
  const keys: OptionKeys = Object.create(null)
  let stdinContents: Uint8Array | null = null
  let stdinResolveDir: string | null = null
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault)
  pushCommonFlags(flags, options, keys)

  const sourcemap = getFlag(options, keys, 'sourcemap', mustBeStringOrBoolean)
  const bundle = getFlag(options, keys, 'bundle', mustBeBoolean)
  const splitting = getFlag(options, keys, 'splitting', mustBeBoolean)
  const preserveSymlinks = getFlag(
    options,
    keys,
    'preserveSymlinks',
    mustBeBoolean,
  )
  const metafile = getFlag(options, keys, 'metafile', mustBeBoolean)
  const outfile = getFlag(options, keys, 'outfile', mustBeString)
  const outdir = getFlag(options, keys, 'outdir', mustBeString)
  const outbase = getFlag(options, keys, 'outbase', mustBeString)
  const tsconfig = getFlag(options, keys, 'tsconfig', mustBeString)
  const resolveExtensions = getFlag(
    options,
    keys,
    'resolveExtensions',
    mustBeArrayOfStrings,
  )
  const nodePathsInput = getFlag(
    options,
    keys,
    'nodePaths',
    mustBeArrayOfStrings,
  )
  const mainFields = getFlag(options, keys, 'mainFields', mustBeArrayOfStrings)
  const conditions = getFlag(options, keys, 'conditions', mustBeArrayOfStrings)
  const external = getFlag(options, keys, 'external', mustBeArrayOfStrings)
  const packages = getFlag(options, keys, 'packages', mustBeString)
  const alias = getFlag(options, keys, 'alias', mustBeObject)
  const loader = getFlag(options, keys, 'loader', mustBeObject)
  const outExtension = getFlag(options, keys, 'outExtension', mustBeObject)
  const publicPath = getFlag(options, keys, 'publicPath', mustBeString)
  const entryNames = getFlag(options, keys, 'entryNames', mustBeString)
  const chunkNames = getFlag(options, keys, 'chunkNames', mustBeString)
  const assetNames = getFlag(options, keys, 'assetNames', mustBeString)
  const inject = getFlag(options, keys, 'inject', mustBeArrayOfStrings)
  const banner = getFlag(options, keys, 'banner', mustBeObject)
  const footer = getFlag(options, keys, 'footer', mustBeObject)
  const entryPoints = getFlag(options, keys, 'entryPoints', mustBeEntryPoints)
  const absWorkingDir = getFlag(options, keys, 'absWorkingDir', mustBeString)
  const stdin = getFlag(options, keys, 'stdin', mustBeObject)
  const write = getFlag(options, keys, 'write', mustBeBoolean) ?? writeDefault // Default to true if not specified
  const allowOverwrite = getFlag(
    options,
    keys,
    'allowOverwrite',
    mustBeBoolean,
  )
  const mangleCache = getFlag(options, keys, 'mangleCache', mustBeObject)
  keys.plugins = true // "plugins" has already been read earlier
  checkForInvalidFlags(options, keys, `in ${callName}() call`)

  if (sourcemap) {
    flags.push(`--sourcemap${sourcemap === true ? '' : `=${sourcemap}`}`)
  }
  if (bundle) flags.push('--bundle')
  if (allowOverwrite) flags.push('--allow-overwrite')
  if (splitting) flags.push('--splitting')
  if (preserveSymlinks) flags.push('--preserve-symlinks')
  if (metafile) flags.push(`--metafile`)
  if (outfile) flags.push(`--outfile=${outfile}`)
  if (outdir) flags.push(`--outdir=${outdir}`)
  if (outbase) flags.push(`--outbase=${outbase}`)
  if (tsconfig) flags.push(`--tsconfig=${tsconfig}`)
  if (packages) flags.push(`--packages=${packages}`)
  if (resolveExtensions) {
    flags.push(
      `--resolve-extensions=${validateAndJoinStringArray(resolveExtensions, 'resolve extension')}`,
    )
  }
  if (publicPath) flags.push(`--public-path=${publicPath}`)
  if (entryNames) flags.push(`--entry-names=${entryNames}`)
  if (chunkNames) flags.push(`--chunk-names=${chunkNames}`)
  if (assetNames) flags.push(`--asset-names=${assetNames}`)
  if (mainFields) {
    flags.push(
      `--main-fields=${validateAndJoinStringArray(mainFields, 'main field')}`,
    )
  }
  if (conditions) {
    flags.push(
      `--conditions=${validateAndJoinStringArray(conditions, 'condition')}`,
    )
  }
  if (external) {
    for (const name of external) {
      flags.push(`--external:${validateStringValue(name, 'external')}`)
    }
  }
  if (alias) {
    for (const old in alias) {
      if (old.indexOf('=') >= 0) {
        throw new Error(`Invalid package name in alias: ${old}`)
      }
      flags.push(
        `--alias:${old}=${validateStringValue(alias[old], 'alias', old)}`,
      )
    }
  }
  if (banner) {
    for (const type in banner) {
      if (type.indexOf('=') >= 0) {
        throw new Error(`Invalid banner file type: ${type}`)
      }
      flags.push(
        `--banner:${type}=${validateStringValue(banner[type], 'banner', type)}`,
      )
    }
  }
  if (footer) {
    for (const type in footer) {
      if (type.indexOf('=') >= 0) {
        throw new Error(`Invalid footer file type: ${type}`)
      }
      flags.push(
        `--footer:${type}=${validateStringValue(footer[type], 'footer', type)}`,
      )
    }
  }
  if (inject) {
    for (const path of inject) {
      flags.push(`--inject:${validateStringValue(path, 'inject')}`)
    }
  }
  if (loader) {
    for (const ext in loader) {
      if (ext.indexOf('=') >= 0) {
        throw new Error(`Invalid loader extension: ${ext}`)
      }
      flags.push(
        `--loader:${ext}=${validateStringValue(loader[ext], 'loader', ext)}`,
      )
    }
  }
  if (outExtension) {
    for (const ext in outExtension) {
      if (ext.indexOf('=') >= 0) {
        throw new Error(`Invalid out extension: ${ext}`)
      }
      flags.push(
        `--out-extension:${ext}=${validateStringValue(outExtension[ext], 'out extension', ext)}`,
      )
    }
  }

  if (entryPoints) {
    if (Array.isArray(entryPoints)) {
      for (let i = 0, n = entryPoints.length; i < n; i++) {
        const entryPoint = entryPoints[i]
        if (typeof entryPoint === 'object' && entryPoint !== null) {
          const entryPointKeys: OptionKeys = Object.create(null)
          const input = getFlag(entryPoint, entryPointKeys, 'in', mustBeString)
          const output = getFlag(
            entryPoint,
            entryPointKeys,
            'out',
            mustBeString,
          )
          checkForInvalidFlags(
            entryPoint,
            entryPointKeys,
            'in entry point at index ' + i,
          )
          if (input === undefined) {
            throw new Error(
              'Missing property "in" for entry point at index ' + i,
            )
          }
          if (output === undefined) {
            throw new Error(
              'Missing property "out" for entry point at index ' + i,
            )
          }
          entries.push([output, input])
        } else {
          entries.push([
            '',
            validateStringValue(entryPoint, 'entry point at index ' + i),
          ])
        }
      }
    } else {
      for (const key in entryPoints) {
        entries.push([
          key,
          validateStringValue(entryPoints[key], 'entry point', key),
        ])
      }
    }
  }

  if (stdin) {
    const stdinKeys: OptionKeys = Object.create(null)
    const contents = getFlag(
      stdin,
      stdinKeys,
      'contents',
      mustBeStringOrUint8Array,
    )
    const resolveDir = getFlag(stdin, stdinKeys, 'resolveDir', mustBeString)
    const sourcefile = getFlag(stdin, stdinKeys, 'sourcefile', mustBeString)
    const loader = getFlag(stdin, stdinKeys, 'loader', mustBeString)
    checkForInvalidFlags(stdin, stdinKeys, 'in "stdin" object')

    if (sourcefile) flags.push(`--sourcefile=${sourcefile}`)
    if (loader) flags.push(`--loader=${loader}`)
    if (resolveDir) stdinResolveDir = resolveDir
    if (typeof contents === 'string') {
      stdinContents = protocol.encodeUTF8(contents)
    } else if (contents instanceof Uint8Array) stdinContents = contents
  }

  const nodePaths: string[] = []
  if (nodePathsInput) {
    for (let value of nodePathsInput) {
      value += ''
      nodePaths.push(value)
    }
  }

  return {
    entries,
    flags,
    write,
    stdinContents,
    stdinResolveDir,
    absWorkingDir,
    nodePaths,
    mangleCache: validateMangleCache(mangleCache),
  }
}

export interface TransformFlagsResult {
  flags: string[]
  mangleCache: MangleCache | undefined
}

export function flagsForTransformOptions(
  callName: string,
  options: types.TransformOptions,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
): TransformFlagsResult {
  const flags: string[] = []
  const keys: OptionKeys = Object.create(null)
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault)
  pushCommonFlags(flags, options, keys)

  const sourcemap = getFlag(options, keys, 'sourcemap', mustBeStringOrBoolean)
  const sourcefile = getFlag(options, keys, 'sourcefile', mustBeString)
  const loader = getFlag(options, keys, 'loader', mustBeString)
  const banner = getFlag(options, keys, 'banner', mustBeString)
  const footer = getFlag(options, keys, 'footer', mustBeString)
  const mangleCache = getFlag(options, keys, 'mangleCache', mustBeObject)
  checkForInvalidFlags(options, keys, `in ${callName}() call`)

  if (sourcemap) {
    flags.push(`--sourcemap=${sourcemap === true ? 'external' : sourcemap}`)
  }
  if (sourcefile) flags.push(`--sourcefile=${sourcefile}`)
  if (loader) flags.push(`--loader=${loader}`)
  if (banner) flags.push(`--banner=${banner}`)
  if (footer) flags.push(`--footer=${footer}`)

  return {
    flags,
    mangleCache: validateMangleCache(mangleCache),
  }
}

export const buildLogLevelDefaultValue: types.LogLevel = buildLogLevelDefault
export const transformLogLevelDefaultValue: types.LogLevel = transformLogLevelDefault
