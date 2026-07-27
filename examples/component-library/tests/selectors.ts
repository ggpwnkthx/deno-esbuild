/**
 * Shared test selectors and helpers for the component-library demo.
 *
 * Lives in `tests/` so the published component code never imports a
 * test-only module. Production render code keeps the `data-testid` literals
 * inline; the browser test imports them from here to keep assertions in
 * sync with the DOM contract.
 */
export const TEST_ID = {
  button: 'gg-button',
  card: 'gg-card',
  count: 'gg-count',
} as const

export const SELECTOR = {
  button: `[data-testid="${TEST_ID.button}"]`,
  card: `[data-testid="${TEST_ID.card}"]`,
  count: `[data-testid="${TEST_ID.count}"]`,
} as const

export const COPY = {
  cardTitle: 'Example card',
  buttonLabel: 'Click me',
  countInitial: 'Clicked 0 times',
} as const

export function formatCount(n: number): string {
  return `Clicked ${n} times`
}

export const COUNT_TEXT = {
  initial: formatCount(0),
  after: (n: number) => formatCount(n),
} as const
