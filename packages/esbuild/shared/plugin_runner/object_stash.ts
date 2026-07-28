/**
 * @module
 * Object-stash helpers used by the plugin runner to ferry opaque JS
 * values across the wire-protocol boundary.
 */

/**
 * Holds opaque JavaScript objects on the JS side so they can be passed
 * to the Go service (and back) as integers. Numbers travel for free; objects
 * don't. Each `store` call returns a fresh ID; `load(id)` returns the
 * original value. `clear()` is called between builds to bound memory.
 */
export interface ObjectStash {
  /** Drop every previously-stored value, freeing the underlying references. */
  clear(): void
  /** Look up a value previously stored under `id`. */
  load(id: number): unknown
  /** Store `value` and return the lookup id; `undefined` maps to id `-1`. */
  store(value: unknown): number
}

/**
 * Builds a fresh in-memory {@link ObjectStash} keyed by an auto-incrementing
 * integer. Each stash is short-lived and scoped to a single build.
 */
export function createObjectStash(): ObjectStash {
  const map = new Map<number, unknown>()
  let nextID = 0
  return {
    clear() {
      map.clear()
    },
    load(id) {
      return map.get(id)
    },
    store(value) {
      if (value === void 0) return -1
      const id = nextID++
      map.set(id, value)
      return id
    },
  }
}
