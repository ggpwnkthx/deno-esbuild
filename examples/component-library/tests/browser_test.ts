/**
 * End-to-end smoke test for the demo: boot the per-file ESM dev server, then
 * verify Material UI's components render and respond to clicks in a real
 * headless Chromium via @astral/astral.
 *
 * The dev server serves every `*.ts` / `*.tsx` under `src/` as a separate
 * browser-routable ESM module via `esbuild.transform`, and bundles npm/JS
 * dependencies on demand through `/@modules/<spec>` using `handle.build()`.
 * Bare React and MUI specifiers are rewritten server-side to
 * `/@modules/<spec>` URLs via `@deno/graph` AST positions, so no import map
 * is required in the HTML.
 *
 * `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, and
 * `react/jsx-dev-runtime` are externalised inside every non-React bundle
 * so the browser fetches one shared `/@modules/react` (etc.) URL and reuses
 * it across every dependent module. The shared React instance is what makes
 * MUI's hooks succeed against react-dom's dispatcher (see
 * `src/server/serve_module.ts` for the `neutralizeDynamicReactRequires`
 * post-pass that handles the CJS-bridged bundles).
 */
import { launch } from '@astral/astral'
import { assert, assertEquals, assertExists, assertStringIncludes } from '@std/assert'
import * as path from '@std/path'
import { EXAMPLE_ROOT, SRC } from '../src/server/paths.ts'
import { COPY, SELECTOR } from './selectors.ts'

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

assertEquals(typeof EXAMPLE_ROOT, 'string')

const { button: buttonSel, card: cardSel, count: countSel, title: titleSel } = SELECTOR

Deno.test('component library demo renders Material UI end-to-end', async () => {
  const server = await startServer()
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('browser test exceeded 90s timeout')),
        90_000,
      )
    })
    try {
      await Promise.race([timeout, runBrowserTest(server)])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  } finally {
    await server.kill()
  }
})

async function runBrowserTest(server: ServerHandle): Promise<void> {
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
    // MUI's bundle is large; wait until network is idle so every
    // `/@modules/<spec>` request has finished before assertions run.
    await page.goto(url, { waitUntil: 'networkidle0' })

    // The transformed main.tsx must rewrite every bare specifier it
    // imports into a /@modules/<spec> URL.
    const mainSource = await page.evaluate(async () => {
      const r = await fetch('/main.tsx')
      return await r.text()
    })
    assertStringIncludes(mainSource, '/@modules/react-dom/client')
    assertStringIncludes(mainSource, '/@modules/react/jsx-runtime')
    assertStringIncludes(mainSource, '/@modules/@mui/material/Button')
    assertStringIncludes(mainSource, '/@modules/@mui/material/Card')
    assertStringIncludes(mainSource, '/@modules/@mui/material/CardContent')
    assertStringIncludes(mainSource, '/@modules/@mui/material/Typography')
    assert(
      !mainSource.includes('from "react-dom/client"'),
      `expected server to rewrite react-dom/client, got: ${mainSource}`,
    )
    assert(
      !mainSource.includes('from "@mui/material/Button"'),
      `expected server to rewrite @mui/material/Button, got: ${mainSource}`,
    )

    // MUI must actually render with React from the shared /@modules/react
    // module. If the dispatcher chain is broken, MUI's hooks throw before
    // these selectors ever appear in the DOM.
    const button = await page.waitForSelector(buttonSel, { timeout: 10_000 })
    assertExists(button, 'MuiButton-root should be present in the DOM')
    const card = await page.waitForSelector(cardSel, { timeout: 5_000 })
    assertExists(card, 'MuiCard-root should be present in the DOM')
    const title = await page.waitForSelector(titleSel, { timeout: 5_000 })
    assertExists(title, 'MuiTypography-h5 should be present in the DOM')

    const state = await page.evaluate((selectors: typeof SELECTOR) => ({
      cardTitle: globalThis.document.querySelector(selectors.title)?.textContent ??
        null,
      buttonLabel: globalThis.document.querySelector(selectors.button)?.textContent ??
        null,
      cardTestId: globalThis.document.querySelector(selectors.card)?.getAttribute(
        'data-testid',
      ) ?? null,
      countText: globalThis.document.querySelector(selectors.count)?.textContent ?? null,
    }), { args: [SELECTOR] })
    assertEquals(state.cardTitle, COPY.cardTitle)
    assertEquals(state.buttonLabel, COPY.buttonLabel)

    // Click the button and verify the count text updates.
    await page.evaluate((sel: string) => {
      const btn = globalThis.document.querySelector<HTMLButtonElement>(sel)
      btn?.click()
      btn?.click()
    }, { args: [buttonSel] })
    // Poll for the post-click count text without relying on
    // waitForFunction's timeout argument (older Astral API).
    let afterClicks: string | null = null
    for (let i = 0; i < 20; i++) {
      afterClicks = await page.evaluate(
        (sel: string) => globalThis.document.querySelector(sel)?.textContent ?? null,
        { args: [countSel] },
      )
      if (afterClicks === 'Clicked 2 times') break
      await new Promise((r) => setTimeout(r, 100))
    }
    assertEquals(afterClicks, 'Clicked 2 times')

    const esmRequests = requests.filter((request) =>
      /\.(?:t|j)sx?$/.test(request) || /^\/@modules\//.test(request)
    )
    assert(
      esmRequests.includes('/main.tsx'),
      `expected /main.tsx in requests, got: ${JSON.stringify(esmRequests)}`,
    )
    assert(
      esmRequests.includes('/@modules/react-dom/client'),
      `expected /@modules/react-dom/client in requests, got: ${JSON.stringify(esmRequests)}`,
    )
    assert(
      esmRequests.some((r) => r.startsWith('/@modules/@mui/material/')),
      `expected at least one /@modules/@mui/material/* request, got: ${
        JSON.stringify(esmRequests)
      }`,
    )

    const leakedServerFiles = esmRequests.filter((r) => r.startsWith('/server/'))
    assertEquals(
      leakedServerFiles,
      [],
      `dev-server files leaked into browser requests: ${JSON.stringify(leakedServerFiles)}`,
    )

    assertEquals(consoleErrors, [])
    assertEquals(pageErrors, [])
  } finally {
    await browser.close()
  }
}
