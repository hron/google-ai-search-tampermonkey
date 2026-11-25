import { injectStyles, isAiModePage, toPageOptions } from '../lib/dom.js';

export const CITATION_CHIPS_FEATURE_ID = 'citation-chips';

const CHIP_OVERLAY_LINK_SELECTOR = 'a.PMDqCb, a.rA9BFb';
const CHIP_BUTTON_SELECTOR = 'button[data-amic="true"]';
const RELATED_LINKS_DIALOG_SELECTOR = '[role="dialog"].jR6h';
const DIALOG_VIEWPORT_MARGIN_PX = 16;
const SYNTHETIC_POINTER_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];

export const CITATION_CHIPS_STYLES = `
${RELATED_LINKS_DIALOG_SELECTOR},
${RELATED_LINKS_DIALOG_SELECTOR}.WaKIwf,
${RELATED_LINKS_DIALOG_SELECTOR}.WaKIwf.ganmlc {
  max-block-size: calc(100vh - ${DIALOG_VIEWPORT_MARGIN_PX * 2}px) !important;
  max-height: calc(100vh - ${DIALOG_VIEWPORT_MARGIN_PX * 2}px) !important;
}
`;

function resolveNode(node) {
  if (!node) return null;
  if (typeof node.closest === 'function') return node;
  return node.parentElement && typeof node.parentElement.closest === 'function'
    ? node.parentElement
    : null;
}

export function computeClampedDialogTop(rect, viewportHeight, margin = DIALOG_VIEWPORT_MARGIN_PX) {
  if (!rect || typeof rect.height !== 'number' || rect.height <= 0) return null;
  if (typeof viewportHeight !== 'number' || viewportHeight <= 0) return null;

  const currentTop = Math.round(rect.top);
  if (rect.bottom > viewportHeight - margin) {
    const nextTop = Math.max(margin, Math.round(viewportHeight - margin - rect.height));
    return Math.abs(nextTop - currentTop) > 1 ? nextTop : null;
  }
  if (rect.top < margin) {
    return Math.abs(margin - currentTop) > 1 ? margin : null;
  }
  return null;
}

/**
 * 1. Google renders inline citation chips as an empty full-size overlay <a>
 *    (first source URL, target=_blank) stacked above the real "related results"
 *    <button>. Keyboard-driven tools such as Vimium hint the overlay and send
 *    it a synthetic click, which opens the first source in a new tab instead of
 *    showing the list. Redirect only synthetic (untrusted) clicks on the
 *    overlay to the button; real clicks keep their original behavior.
 * 2. Expand the "Related links" popover (.jR6h) from Google's tiny 290px/145px
 *    cap to full height (up to the viewport height) and clamp its `top` offset
 *    so the entire list stays visible without awkward keyboard scrolling.
 */
export function createCitationChipsFeature({ doc = document, observe = true } = {}) {
  const view = doc.defaultView || null;
  const clickTarget = view || doc;
  let observer = null;
  let syncScheduled = false;
  let stylesInjected = false;

  function ensureStylesInjected() {
    if (stylesInjected || !isAiModePage(doc)) return;
    injectStyles(CITATION_CHIPS_STYLES, CITATION_CHIPS_FEATURE_ID, doc);
    stylesInjected = true;
  }

  function clampRelatedLinksDialogs() {
    if (!isAiModePage(doc)) return;
    ensureStylesInjected();
    if (typeof doc.querySelectorAll !== 'function') return;

    const viewportHeight = view?.innerHeight || doc.documentElement?.clientHeight || 0;
    if (viewportHeight <= 0) return;

    const dialogs = doc.querySelectorAll(RELATED_LINKS_DIALOG_SELECTOR);
    for (const dialog of dialogs) {
      if (!dialog || typeof dialog.getBoundingClientRect !== 'function' || !dialog.style) continue;
      const rect = dialog.getBoundingClientRect();
      const clampedTop = computeClampedDialogTop(rect, viewportHeight, DIALOG_VIEWPORT_MARGIN_PX);
      if (clampedTop !== null) {
        dialog.style.top = `${clampedTop}px`;
      }
    }
  }

  function scheduleClamp() {
    if (syncScheduled) return;
    syncScheduled = true;
    const run = () => {
      syncScheduled = false;
      clampRelatedLinksDialogs();
    };
    if (view && typeof view.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(run);
    } else if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function findChipButtonForEvent(event) {
    const el = resolveNode(event?.target);
    if (!el) return null;
    const overlay = el.closest(CHIP_OVERLAY_LINK_SELECTOR);
    if (overlay) {
      const button = overlay.parentElement?.querySelector?.(CHIP_BUTTON_SELECTOR);
      return button && typeof button.click === 'function' ? { button, viaOverlay: true } : null;
    }
    const button = el.closest(CHIP_BUTTON_SELECTOR);
    if (button && typeof button.click === 'function') {
      return { button, viaOverlay: false };
    }
    return null;
  }

  function handleSyntheticPointer(event) {
    if (!event || event.isTrusted !== false) return;
    if (!findChipButtonForEvent(event)) return;

    // Vimium dispatches synthetic mousedown/mouseup before click. Google's
    // outside-click handler closes any currently open Related links dialog on
    // mouseup, which suppresses opening the newly clicked chip's dialog.
    // Stopping synthetic pointer/mouse events lets the subsequent click switch
    // the open dialog directly in-place without closing it first.
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  function handleClick(event) {
    if (!event || event.isTrusted !== false) return;
    const match = findChipButtonForEvent(event);
    if (!match || !match.viaOverlay) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    match.button.click();
    scheduleClamp();
  }

  function handleResize() {
    clampRelatedLinksDialogs();
  }

  function init() {
    ensureStylesInjected();
    for (const type of SYNTHETIC_POINTER_EVENTS) {
      clickTarget.addEventListener(type, handleSyntheticPointer, true);
    }
    clickTarget.addEventListener('click', handleClick, true);
    if (view && typeof view.addEventListener === 'function') {
      view.addEventListener('resize', handleResize);
    }
    clampRelatedLinksDialogs();

    const observeRoot = doc.body || doc.documentElement;
    if (observe && typeof MutationObserver === 'function' && observeRoot) {
      observer = new MutationObserver(scheduleClamp);
      const opts = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      };
      try {
        observer.observe(observeRoot, toPageOptions(opts, doc));
      } catch {
        observer.observe(observeRoot, opts);
      }
    }
  }

  function destroy() {
    for (const type of SYNTHETIC_POINTER_EVENTS) {
      clickTarget.removeEventListener(type, handleSyntheticPointer, true);
    }
    clickTarget.removeEventListener('click', handleClick, true);
    if (view && typeof view.removeEventListener === 'function') {
      view.removeEventListener('resize', handleResize);
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  return {
    id: CITATION_CHIPS_FEATURE_ID,
    init,
    sync: clampRelatedLinksDialogs,
    destroy,
  };
}
