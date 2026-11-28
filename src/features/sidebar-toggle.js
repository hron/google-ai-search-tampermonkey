import {
  findCloseSidebarButton,
  findOpenSidebarButton,
  findVisibleSidebarElement,
  isAiModePage,
} from '../lib/dom.js';

export const SIDEBAR_TOGGLE_FEATURE_ID = 'sidebar-toggle';

function isCtrlOrCmdB(event) {
  if (!event || event.altKey || event.shiftKey) return false;
  if (event.ctrlKey === event.metaKey) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  const keyMatch = typeof event.key === 'string' && event.key.toLowerCase() === 'b';
  const codeMatch = event.code === 'KeyB';
  return keyMatch || codeMatch;
}

export function findSidebarToggleButton(doc = document) {
  const sidebar = findVisibleSidebarElement(doc);
  if (sidebar) {
    return findCloseSidebarButton(sidebar);
  }
  return findOpenSidebarButton(doc);
}

export function createSidebarToggleFeature({ doc = document } = {}) {
  const view = doc.defaultView || null;
  const keyTarget = view || doc;

  function handleKeyDown(event) {
    if (!isCtrlOrCmdB(event)) return;
    if (!isAiModePage(doc)) return;

    const button = findSidebarToggleButton(doc);
    if (!button || typeof button.click !== 'function') return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    if (!event.repeat) {
      button.click();
    }
  }

  function init() {
    keyTarget.addEventListener('keydown', handleKeyDown, true);
  }

  function destroy() {
    keyTarget.removeEventListener('keydown', handleKeyDown, true);
  }

  return {
    id: SIDEBAR_TOGGLE_FEATURE_ID,
    init,
    destroy,
  };
}
