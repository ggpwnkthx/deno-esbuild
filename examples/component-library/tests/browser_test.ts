/**
 * End-to-end smoke test for the demo: boot the per-file ESM dev server, then
 * verify the React components render with the expected text and behavior in a
 * real headless Chromium via @astral/astral.
 *
 * The dev server serves every `*.ts` / `*.tsx` under `src/` as a separate
 * browser-routable ESM module via `esbuild.transform`, and bundles npm/JS
 * dependencies on demand through `/@modules/<spec>` using `handle.build()`.
 * Bare React specifiers are rewritten server-side to `/@modules/<spec>`
 * URLs via `@deno/graph` AST positions, so no import map is required in
 * the HTML.
 */
import { launch } from '@astral/astral'
import { assert, assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import * as path from '@std/path'
import { EXAMPLE_ROOT, SRC } from '../src/server/paths.ts'
import { COPY, COUNT_TEXT, SELECTOR } from './selectors.ts'

interface ServerHandle {
  port: number
  child: Deno.ChildProcess
  kill: () => void
}

async function startServer(): Promise<ServerHandle> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ['serve', '-A', '--port=0', path.join(SRC, 'serve.ts')],
    stdout: 'piped',
    stderr: 'piped',
  })
  const child = cmd.spawn()

  const decoder = new TextDecoder()
  let buffer = ''
  let port = -1
  const portReady = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server start timeout')), 30_000)
    void (async () => {
      try {
        for await (const chunk of child.stdout) {
          buffer += decoder.decode(chunk)
          const m = buffer.match(/listening on http:\/\/localhost:(\d+)/)
          if (m) {
            clearTimeout(timeout)
            port = Number(m[1])
            resolve(port)
            return
          }
        }
      } catch (err) {
        reject(err)
      }
    })()
  })

  port = await portReady

  return {
    port,
    child,
    kill: () => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
    },
  }
}

assertExists(EXAMPLE_ROOT)

const { button: buttonSel, card: cardSel, count: countSel } = SELECTOR

interface CardAndButton {
  card: string
  button: string
}

Deno.test('component library demo renders in a real browser', async (t) => {
  const server = await startServer()
  try {
    await t.step('renders Card with title and Button with label', async () => {
      const browser = await launch({ headless: true, args: ['--no-sandbox'] })
      try {
        const requests: string[] = []
        const consoleErrors: string[] = []
        const pageErrors: string[] = []
        const page = await browser.newPage('about:blank', {
          interceptor(request) {
            requests.push(decodeURIComponent(new URL(request.url).pathname))
          },
        })
        page.addEventListener('console', (event) => {
          if (event.detail.type === 'error') consoleErrors.push(event.detail.text)
        })
        page.addEventListener('pageerror', (event) => pageErrors.push(event.detail.message))
        const url = `http://localhost:${server.port}/index.html`
        await page.goto(url, { waitUntil: 'load' })

        const button = await page.waitForSelector(buttonSel, { timeout: 10_000 })
        assertExists(button, 'Button should be present in the DOM')

        const card = await page.waitForSelector(cardSel, { timeout: 5_000 })
        assertExists(card, 'Card should be present in the DOM')

        const mainSource = await page.evaluate(async () => {
          const r = await fetch('/main.tsx')
          return await r.text()
        })
        assertStringIncludes(mainSource, '/@modules/react-dom/client')
        assertStringIncludes(mainSource, '/@modules/react/jsx-runtime')
        assert(
          !mainSource.includes('from "react-dom/client"'),
          `expected server to rewrite react-dom/client, got: ${mainSource}`,
        )

        const state = await page.evaluate((selectors: CardAndButton) => {
          const card = globalThis.document.querySelector<HTMLElement>(selectors.card)
          const button = globalThis.document.querySelector<HTMLElement>(selectors.button)
          return {
            cardTitle: globalThis.document.querySelector('.gg-card__title')?.textContent,
            buttonLabel: button?.textContent,
            cardTestId: card?.dataset.testid,
            buttonTestId: button?.dataset.testid,
            reactGlobalUndefined: Reflect.get(globalThis, 'React') === undefined,
          }
        }, { args: [{ card: cardSel, button: buttonSel } satisfies CardAndButton] })
        assertEquals(state.cardTitle, COPY.cardTitle)
        assertEquals(state.buttonLabel, COPY.buttonLabel)
        assertEquals(state.cardTestId, 'gg-card')
        assertEquals(state.buttonTestId, 'gg-button')
        assertEquals(state.reactGlobalUndefined, true)
        assertEquals(consoleErrors, [])
        assertEquals(pageErrors, [])

        const esmRequests = requests.filter((request) =>
          /\.(?:t|j)sx?$/.test(request) || /^\/@modules\//.test(request)
        )

        const expected = new Set([
          '/main.tsx',
          '/Button.tsx',
          '/Card.tsx',
          '/@modules/react-dom/client',
        ])
        for (const path of expected) {
          assert(
            esmRequests.includes(path),
            `expected ${path} in requests, got: ${JSON.stringify(esmRequests)}`,
          )
        }

        const leakedServerFiles = esmRequests.filter((r) => r.startsWith('/server/'))
        assertEquals(
          leakedServerFiles,
          [],
          `dev-server files leaked into browser requests: ${JSON.stringify(leakedServerFiles)}`,
        )

        const initialCount = await page.evaluate(
          (sel: string) => globalThis.document.querySelector(sel)?.textContent,
          { args: [countSel] },
        )
        assertEquals(initialCount, COUNT_TEXT.initial)

        const click = () =>
          page.evaluate(
            (sel: string) => {
              const button = globalThis.document.querySelector<HTMLButtonElement>(sel)
              button?.click()
            },
            { args: [buttonSel] },
          )
        await click()
        await click()
        const afterClicks = await page.evaluate(
          (sel: string) => globalThis.document.querySelector(sel)?.textContent,
          { args: [countSel] },
        )
        assertEquals(afterClicks, `Clicked ${2} times`)
        assertEquals(consoleErrors, [])
        assertEquals(pageErrors, [])
      } finally {
        await browser.close()
      }
    })
  } finally {
    await server.kill()
  }
})
