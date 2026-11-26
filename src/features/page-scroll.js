import {
  SIDEBAR_SELECTOR,
  createDocumentScrollerOptions,
  findThreadScroller,
  isAiModePage,
  resolvePromptInputElement,
} from '../lib/dom.js';
import { createSmoothArrowScroller, createSmoothPageScroller } from '../lib/scrolling.js';

export const PAGE_SCROLL_FEATURE_ID = 'page-scroll';

const PAGE_SCROLL_OVERLAY_SELECTOR =
  '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';
const PAGE_SCROLL_EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function getPageScrollElementNode(node) {
  if (!node) return null;
  if (typeof node.closest === 'function') return node;
  return node.parentElement && typeof node.parentElement.closest === 'function'
    ? node.parentElement
    : null;
}

function isInsidePageScrollOverlay(el) {
  return Boolean(el && el.closest(PAGE_SCROLL_OVERLAY_SELECTOR));
}

function isInsideSidebar(el) {
  return Boolean(el && el.closest(SIDEBAR_SELECTOR));
}

function isPageScrollEditableControl(el) {
  if (!el) return false;
  if (PAGE_SCROLL_EDITABLE_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable === true) return true;
  if (typeof el.getAttribute === 'function') {
    const ce = el.getAttribute('contenteditable');
    if (ce === 'true' || ce === '') return true;
    if (el.getAttribute('role') === 'textbox') return true;
  }
  return false;
}

function hasNestedVerticalScroller(el, threadScroller) {
  let cur = el;
  while (cur && cur !== threadScroller) {
    if (
      typeof cur.scrollHeight === 'number' &&
      typeof cur.clientHeight === 'number' &&
      cur.scrollHeight > cur.clientHeight + 1
    ) {
      const view = cur.ownerDocument?.defaultView;
      let overflowY = null;
      try {
        overflowY = view?.getComputedStyle?.(cur)?.overflowY || null;
      } catch {
        overflowY = null;
      }
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        return true;
      }
    }
    cur = cur.parentElement;
  }
  return false;
}

function getScrollKeyAction(event) {
  if (!event) return null;
  if (event.key === 'PageUp') return { kind: 'page', direction: -1 };
  if (event.key === 'PageDown') return { kind: 'page', direction: 1 };
  if (event.key === 'ArrowUp') return { kind: 'arrow', direction: -1 };
  if (event.key === 'ArrowDown') return { kind: 'arrow', direction: 1 };
  return null;
}

function isPromptInputEmpty(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    return typeof el.value !== 'string' || el.value.length === 0;
  }
  return (el.textContent || '').replace(/[\u200B\r\n]/g, '').length === 0;
}

function shouldHandleScrollKey(event, doc, scroller, action) {
  if (!event || !action) {
    return false;
  }
  if (
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }
  if (!isAiModePage(doc)) {
    return false;
  }
  if (!scroller) return false;
  if (
    typeof scroller.scrollHeight === 'number' &&
    typeof scroller.clientHeight === 'number' &&
    scroller.scrollHeight <= scroller.clientHeight + 1
  ) {
    return false;
  }

  const activeEl = getPageScrollElementNode(doc.activeElement);
  const targetEl = getPageScrollElementNode(event.target);

  if (isInsidePageScrollOverlay(activeEl) || isInsidePageScrollOverlay(targetEl)) {
    return false;
  }

  if (isInsideSidebar(activeEl) || isInsideSidebar(targetEl)) {
    return false;
  }

  const promptEl = resolvePromptInputElement(activeEl) || resolvePromptInputElement(targetEl);
  if (promptEl) {
    if (action.kind === 'page') {
      return true;
    }
    if (typeof promptEl.getAttribute === 'function' && promptEl.getAttribute('aria-expanded') === 'true') {
      return false;
    }
    return isPromptInputEmpty(promptEl);
  }

  if (action.kind === 'arrow') {
    return false;
  }

  if (isPageScrollEditableControl(activeEl) || isPageScrollEditableControl(targetEl)) {
    return false;
  }

  if (
    hasNestedVerticalScroller(activeEl, scroller) ||
    hasNestedVerticalScroller(targetEl, scroller)
  ) {
    return false;
  }

  if (!activeEl || activeEl === doc.body || activeEl === doc.documentElement) {
    return true;
  }

  return Boolean(activeEl.closest('[role="main"]') || activeEl === scroller);
}

export function createPageScrollFeature({ doc = document } = {}) {
  const view = doc.defaultView || null;
  const keyTarget = view || doc;
  const scrollerOptions = createDocumentScrollerOptions(doc);
  const pageScroller = createSmoothPageScroller(scrollerOptions);
  const arrowScroller = createSmoothArrowScroller(scrollerOptions);

  function stopAll() {
    pageScroller.stop();
    arrowScroller.stop();
  }

  function handleKeyDown(event) {
    const action = getScrollKeyAction(event);
    if (!action) {
      return;
    }
    const scroller = findThreadScroller(doc);
    if (!shouldHandleScrollKey(event, doc, scroller, action)) {
      return;
    }

    const activeController = action.kind === 'page' ? pageScroller : arrowScroller;
    const otherController = action.kind === 'page' ? arrowScroller : pageScroller;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    otherController.stop();
    if (!event.repeat || !activeController.isActive()) {
      activeController.press(action.direction);
    }
  }

  function handleKeyUp(event) {
    const action = getScrollKeyAction(event);
    if (!action) {
      return;
    }
    if (action.kind === 'page') {
      pageScroller.release(action.direction);
    } else {
      arrowScroller.release(action.direction);
    }
  }

  function handleWindowBlur() {
    stopAll();
  }

  function init() {
    keyTarget.addEventListener('keydown', handleKeyDown, true);
    keyTarget.addEventListener('keyup', handleKeyUp, true);
    keyTarget.addEventListener('blur', handleWindowBlur);
  }

  function destroy() {
    stopAll();
    keyTarget.removeEventListener('keydown', handleKeyDown, true);
    keyTarget.removeEventListener('keyup', handleKeyUp, true);
    keyTarget.removeEventListener('blur', handleWindowBlur);
  }

  return {
    id: PAGE_SCROLL_FEATURE_ID,
    init,
    destroy,
  };
}
