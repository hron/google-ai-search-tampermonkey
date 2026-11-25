# Google AI Search Keyboard Shortcuts (Tampermonkey)

A modular Tampermonkey userscript that adds missing keyboard navigation and shortcuts to Google Search AI Mode (`https://www.google.com/search?udm=50`), while leaving regular Google Search untouched.

## Features

### Keyboard-first `Ctrl+K` Thread Search
Adds a command-palette workflow for Google AI Mode's `"Search threads"` sidebar without stealing focus from the search input:

- **`Ctrl+K`** (or **`Cmd+K`**): opens the AI Mode history sidebar (if collapsed) and switches straight into `"Search threads"`, focusing the search input. Pressing **`Ctrl+K`** again while focused in search toggles it back closed.
- The top matching thread is automatically highlighted as soon as search results appear or update.
- **`ArrowUp`** / **`ArrowDown`** (and **`PageUp`** / **`PageDown`**): move selection through threads while keeping the active row scrolled into view.
- Keyboard focus stays strictly inside the search input so you can continue typing, editing, moving the text cursor (`ArrowLeft` / `ArrowRight`), or selecting text without interruption.
- **`Enter`**: opens the currently highlighted thread immediately (while leaving `Exit search` / `Clear text` / `Close sidebar` buttons working natively if tabbed to). If `Ctrl+K` opened the sidebar for you, it closes back out of the way after selecting a thread.
- **`Escape`**: exits thread search (and collapses the sidebar if opened via `Ctrl+K`) and returns focus to the `"Ask anything"` prompt input.
- Mouse hover stays in sync with keyboard selection without stationary cursors stealing focus during scrolling, and infinite scroll preserves your current selection.

### Smooth `PageUp` / `PageDown` scrolling while input is focused
Scroll the AI Mode conversation smoothly without leaving the `"Ask anything"` prompt textarea:

- Press **`PageUp`** / **`PageDown`** while focused in the prompt input (or anywhere in the main conversation) to smoothly scroll the thread by a page while keeping focus in the prompt box.
- Works with both document-level scrolling (`document.scrollingElement`) and internal overflow containers (`aim-mars-turn-root` / zero-state `[role="main"]`).
- Rapid taps accumulate smoothly without losing distance, and holding **`PageUp`** / **`PageDown`** transitions into continuous smooth scrolling that coasts to a stop on release.
- Modifier combos like **`Shift+PageUp`** / **`Shift+PageDown`** (text selection) and **`Ctrl+PageUp`** / **`Ctrl+PageDown`** (tab switching), as well as dialogs, menus, sidebar scrolling, and other editable fields, are left untouched.

## Development

Requirements: Node.js (zero external npm dependencies).

```bash
# Build dist/google-ai-search-shortcuts.user.js
npm run build

# Run unit tests
npm test

# Build and test together
npm run check

# Run automated real-Firefox E2E tests (WebDriver BiDi + WebExtension CSP sandbox)
npm run test:firefox

# Run local interactive Google AI Mode DOM verification harness (http://127.0.0.1:4174/)
npm run dev
```

## Installing in Tampermonkey

### Option 1: 1-Click Install from GitHub Releases (Recommended)
1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open the latest release userscript:
   **[Install Google AI Search Keyboard Shortcuts](https://github.com/hron/google-ai-search-tampermonkey/releases/latest/download/google-ai-search-shortcuts.user.js)**
3. Click **Install** in the Tampermonkey prompt. Future releases update automatically via `@updateURL` / `@downloadURL`.

### Option 2: Direct copy/paste (Firefox, Brave, Chrome)
1. Run `npm run build`.
2. Open Tampermonkey Dashboard → **Create a new script**.
3. Paste the contents of `dist/google-ai-search-shortcuts.user.js` and save.

### Option 3: Live local development via `@require`
> **Note for Firefox users:** Firefox blocks WebExtensions (including Tampermonkey) from loading `file://` URLs. Use the local HTTP dev server (`npm run dev`) instead of `file://` in Firefox!

- **Firefox & Chromium (works everywhere):**
  1. Run `npm run dev` (serves `http://127.0.0.1:4174/dist/google-ai-search-shortcuts.user.js` with `Cache-Control: no-store`).
  2. Create a thin loader script in Tampermonkey:
```js
// ==UserScript==
// @name         Google AI Search Keyboard Shortcuts (Local Dev)
// @match        https://www.google.com/search*
// @match        https://google.com/search*
// @grant        GM_addStyle
// @run-at       document-idle
// @description  Keyboard shortcuts for Google Search AI Mode
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @require      http://127.0.0.1:4174/dist/google-ai-search-shortcuts.user.js
// ==/UserScript==
```
  3. In Tampermonkey Settings → **Externals**, set **Update Interval** to `Always` (or bump a query param like `?v=2`) if you want reloads to pick up rebuilt changes immediately.

## Releasing

Releases are built, verified (unit + Firefox E2E tests), and published automatically by GitHub Actions when a `v*.*.*` tag is pushed:

```bash
npm version patch   # or minor / major (updates package.json and creates a vX.Y.Z tag)
git push origin main --follow-tags
```

## Project Structure

- `src/meta.js` — Tampermonkey metadata header generator (reads version from `package.json`).
- `src/lib/dom.js` — Google AI Mode detection, DOM selectors, and helpers.
- `src/lib/scrolling.js` — Pure spring-based smooth scrolling calculations.
- `src/features/page-scroll.js` — Smooth `PageUp` / `PageDown` scrolling while the prompt input is focused.
- `src/features/search-threads.js` — Keyboard-first `Ctrl+K` thread search & sidebar navigation.
- `src/main.js` — Feature bootstrapper.
- `scripts/build.mjs` — Zero-dependency bundler generating `dist/google-ai-search-shortcuts.user.js` and `dist/google-ai-search-shortcuts.meta.js`.
- `test/` — Unit tests (`node --test`).
