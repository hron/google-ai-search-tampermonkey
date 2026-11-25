const REPO_URL = 'https://github.com/hron/google-ai-search-tampermonkey';
const RELEASE_DOWNLOAD_BASE = `${REPO_URL}/releases/latest/download`;

export function createUserscriptHeader({ version }) {
  if (!version || typeof version !== 'string') {
    throw new Error('createUserscriptHeader requires a non-empty version string');
  }

  return `// ==UserScript==
// @name         Google AI Search Keyboard Shortcuts
// @namespace    ${REPO_URL}
// @version      ${version}
// @description  Adds missing keyboard shortcuts to Google Search AI Mode (google.com/search), including smooth PageUp/PageDown scrolling while the prompt input is focused and a keyboard-first Ctrl+K thread search.
// @author       Aleksei Gusev
// @homepageURL  ${REPO_URL}
// @supportURL   ${REPO_URL}/issues
// @downloadURL  ${RELEASE_DOWNLOAD_BASE}/google-ai-search-shortcuts.user.js
// @updateURL    ${RELEASE_DOWNLOAD_BASE}/google-ai-search-shortcuts.meta.js
// @match        https://www.google.com/search*
// @match        https://google.com/search*
// @grant        GM_addStyle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @run-at       document-idle
// ==/UserScript==`;
}
