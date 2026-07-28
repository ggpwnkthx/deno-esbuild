/**
 * @module
 * `TsconfigRaw` shape recognized by esbuild's TypeScript handling. Lives in
 * its own module so other type modules can import it without pulling in the
 * full {@link ./common.ts:CommonOptions} interface.
 *
 * @see ./common.ts
 * @see https://esbuild.github.io/api/#tsconfig-raw
 */

/**
 * Subset of `tsconfig.json` fields supported by esbuild's TypeScript handling.
 *
 * @see https://esbuild.github.io/api/#tsconfig-raw
 */
export interface TsconfigRaw {
  /**
   * Subset of the `compilerOptions` section of `tsconfig.json` recognized by
   * esbuild's TypeScript handling.
   */
  compilerOptions?: {
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    alwaysStrict?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    baseUrl?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    experimentalDecorators?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    importsNotUsedAsValues?: 'remove' | 'preserve' | 'error'
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsx?:
      | 'preserve'
      | 'react-native'
      | 'react'
      | 'react-jsx'
      | 'react-jsxdev'
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsxFactory?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsxFragmentFactory?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsxImportSource?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    paths?: Record<string, string[]>
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    preserveValueImports?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    strict?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    target?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    useDefineForClassFields?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    verbatimModuleSyntax?: boolean
  }
}
