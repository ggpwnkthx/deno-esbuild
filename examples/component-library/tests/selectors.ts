/**
 * Shared test selectors and helpers for the component-library demo.
 *
 * Lives in `tests/` so the published component code never imports a
 * test-only module. Production render code keeps the MUI class hooks
 * inline; the browser test imports them from here to keep assertions
 * in sync with the DOM contract.
 */
export const MUI_CLASS = {
  button: 'MuiButton-root',
  card: 'MuiCard-root',
  cardContent: 'MuiCardContent-root',
  title: 'MuiTypography-h5',
  body: 'MuiTypography-body2',
  count: 'MuiTypography-body2',
} as const

export const SELECTOR = {
  button: `.${MUI_CLASS.button}`,
  card: `.${MUI_CLASS.card}`,
  title: `.${MUI_CLASS.title}`,
  count: `.${MUI_CLASS.count}`,
} as const

export const COPY = {
  cardTitle: 'Example card',
  buttonLabel: 'Click me',
} as const

export function formatCount(n: number): string {
  return `Clicked ${n} times`
}

export const COUNT_TEXT = {
  initial: formatCount(0),
  after: (n: number) => formatCount(n),
} as const
