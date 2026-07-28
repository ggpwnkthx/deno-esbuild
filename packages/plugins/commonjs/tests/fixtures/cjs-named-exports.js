'use strict'

// Fixture for the commonjsPlugin — a CJS module that exports several
// named bindings via `exports.X = Y;` at module top scope, the same
// shape React's `cjs/react.development.js` uses. Used by mod.test.ts to
// confirm the plugin turns each assignment into a real ESM named
// export that survives bundling.

function add(a, b) {
  return a + b
}

function sub(a, b) {
  return a - b
}

exports.add = add
exports.sub = sub
exports.version = '1.2.3'
