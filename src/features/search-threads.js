import {
  SIDEBAR_SELECTOR,
  findPromptInput,
  focusElement,
  injectStyles,
  isAiModePage,
  toPageOptions,
} from '../lib/dom.js';

export const SEARCH_THREADS_FEATURE_ID = 'search-threads';
export const SEARCH_ACTIVE_ATTR = 'data-gaism-search-active';
export const SEARCH_ACTIVE_ROW_ATTR = 'data-gaism-search-active-row';

const SEARCH_OPTION_ID_PREFIX = 'gaism-search-option-';
const PENDING_OPEN_TIMEOUT_MS = 2500;

const SEARCH_INPUT_SELECTOR =
  'input.LudIE, .uTGOrc input:not([type="hidden"]), input[type="search"], input[placeholder*="Search" i]:not([type="hidden"]), input[type="text"]:not([type="hidden"])';

const SEARCH_THREAD_OPTION_SELECTOR =
  '[data-xid="threads-list-root"] button[data-thread-id]:not([disabled]), [data-xid="aim-threads-view"] button[data-thread-id]:not([disabled]), [role="list"] [role="listitem"] button[data-thread-id]:not([disabled]), [role="listbox"] [role="option"]';

const SEARCH_THREADS_STYLES = `
[${SEARCH_ACTIVE_ROW_ATTR}="true"] {
  background-color: var(--lhs-selected-background-color, rgba(138, 180, 248, 0.16)) !important;
  background-color: color-mix(
    in srgb,
    var(--bbQxAb, #8ab4f8) 16%,
    var(--lhs-selected-background-color, var(--lhs-rail-background, transparent))
  ) !important;
  box-shadow: inset 0 0 0 1px color-mix(
    in srgb,
    var(--bbQxAb, #8ab4f8) 42%,
    transparent
  );
  border-radius: 12px;
}

[${SEARCH_ACTIVE_ATTR}="true"]:not([${SEARCH_ACTIVE_ROW_ATTR}="true"] [${SEARCH_ACTIVE_ATTR}="true"]) {
  background-color: color-mix(
    in srgb,
    var(--bbQxAb, #8ab4f8) 16%,
    var(--lhs-selected-background-color, transparent)
  ) !important;
  box-shadow: inset 0 0 0 1px color-mix(
    in srgb,
    var(--bbQxAb, #8ab4f8) 42%,
    transparent
  );
  border-radius: 12px;
}
`;

function resolveSearchElementNode(node) {
  if (!node) return null;
  if (typeof node.closest === 'function') return node;
  return node.parentElement && typeof node.parentElement.closest === 'function'
    ? node.parentElement
    : null;
}

function isSearchElementHidden(el, stopAt) {
  let cur = el;
  while (cur) {
    if (cur.hidden === true) return true;
    if (typeof cur.getAttribute === 'function') {
      if (cur.getAttribute('aria-hidden') === 'true') return true;
      if (cur.getAttribute('hidden') !== null) return true;
    }
    const view = cur.ownerDocument?.defaultView;
    if (view && typeof view.getComputedStyle === 'function') {
      try {
        const style = view.getComputedStyle(cur);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
          return true;
        }
      } catch {
        // Ignore computed style errors on detached/mocked nodes
      }
    }
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  return false;
}

function findSidebarContainer(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  const sidebar = doc.querySelector(SIDEBAR_SELECTOR);
  if (!sidebar || isSearchElementHidden(sidebar, sidebar)) return null;
  return sidebar;
}

function findOpenSidebarButton(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  return (
    doc.querySelector('button[jsname="JIu0P"]:not([disabled])') ||
    doc.querySelector('button[aria-label="Open sidebar"]:not([disabled])') ||
    doc.querySelector('button.ONx74b:not([disabled])') ||
    null
  );
}

function findCloseSidebarButton(sidebar) {
  if (!sidebar || typeof sidebar.querySelector !== 'function') return null;
  return (
    sidebar.querySelector('button[aria-label="Close sidebar"]:not([disabled])') ||
    sidebar.querySelector('button.OxKcRe:not([disabled])') ||
    null
  );
}

function findSearchThreadsTriggerButton(sidebar) {
  if (!sidebar || typeof sidebar.querySelector !== 'function') return null;

  const byAction = sidebar.querySelector('button[jsaction*="MR4M8b"]:not([disabled])');
  if (byAction) return byAction;

  if (typeof sidebar.querySelectorAll === 'function') {
    const actionBarButtons = Array.from(sidebar.querySelectorAll('button.L9tyXb:not([disabled])'));
    const byText = actionBarButtons.find((btn) => /search/i.test(btn.textContent || ''));
    if (byText) return byText;
    // In Google AI Mode's sidebar action bar, New thread is 1st and Search threads is 2nd
    if (actionBarButtons.length >= 2) {
      return actionBarButtons[1];
    }
  }

  return sidebar.querySelector('button[aria-label*="Search" i]:not([disabled])') || null;
}

function findExitSearchButton(container) {
  if (!container || typeof container.querySelector !== 'function') return null;
  return (
    container.querySelector('button[aria-label="Exit search"]:not([disabled])') ||
    container.querySelector('.uTGOrc button.Amkkpc:not([disabled])') ||
    null
  );
}

export function findSearchThreadsUI(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;

  const sidebar = findSidebarContainer(doc);
  if (sidebar) {
    const input = sidebar.querySelector(SEARCH_INPUT_SELECTOR);
    if (input && !isSearchElementHidden(input, sidebar)) {
      return { container: sidebar, input, isSidebar: true };
    }
  }

  // Graceful fallback if Google ever renders a modal search dialog
  if (typeof doc.querySelectorAll === 'function') {
    const dialogs = Array.from(doc.querySelectorAll('[role="dialog"]'));
    for (let i = dialogs.length - 1; i >= 0; i -= 1) {
      const dialog = dialogs[i];
      if (isSearchElementHidden(dialog, dialog)) continue;
      const input =
        dialog.querySelector('[role="search"] input:not([type="hidden"])') ||
        dialog.querySelector('input[type="search"]');
      if (input && !isSearchElementHidden(input, dialog)) {
        return { container: dialog, input, isSidebar: false };
      }
    }
  }

  return null;
}

export function findSearchThreadOptions(container, input = null) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];

  const candidates = Array.from(container.querySelectorAll(SEARCH_THREAD_OPTION_SELECTOR));
  const seen = new Set();
  const options = [];

  for (const el of candidates) {
    if (!el || seen.has(el)) continue;
    if (el.disabled === true || (typeof el.getAttribute === 'function' && el.getAttribute('disabled') !== null)) {
      continue;
    }
    if (isSearchElementHidden(el, container)) continue;
    if (input && el === input) continue;

    seen.add(el);
    options.push(el);
  }

  return options;
}

function findActiveRowElement(option) {
  if (!option || typeof option.closest !== 'function') return null;
  return option.closest('.u987h') || option.closest('[role="listitem"]') || null;
}

export function computeNextOptionIndex(currentIndex, count, delta, { wrap = true } = {}) {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) {
    return delta < 0 ? count - 1 : 0;
  }
  const next = currentIndex + delta;
  if (wrap) {
    if (next < 0) return count - 1;
    if (next >= count) return 0;
    return next;
  }
  return Math.max(0, Math.min(count - 1, next));
}

function findSearchScrollViewport(option, container) {
  let cur = option?.parentElement || null;
  while (cur && cur !== container) {
    if (
      typeof cur.scrollHeight === 'number' &&
      typeof cur.clientHeight === 'number' &&
      cur.scrollHeight > cur.clientHeight + 1
    ) {
      if (cur.classList?.contains?.('cIl10d')) return cur;
      const view = cur.ownerDocument?.defaultView;
      let overflowY = null;
      try {
        overflowY = view?.getComputedStyle?.(cur)?.overflowY || null;
      } catch {
        overflowY = null;
      }
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        return cur;
      }
    }
    cur = cur.parentElement;
  }
  return null;
}

function scrollSearchOptionIntoView(option, container, isFirst, doc) {
  if (!option) return;
  const viewport = findSearchScrollViewport(option, container);
  if (viewport) {
    if (isFirst) {
      viewport.scrollTop = 0;
      return;
    }
    if (
      typeof viewport.getBoundingClientRect === 'function' &&
      typeof option.getBoundingClientRect === 'function'
    ) {
      const vRect = viewport.getBoundingClientRect();
      const oRect = option.getBoundingClientRect();
      const pad = 4;
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (oRect.top < vRect.top + pad) {
        viewport.scrollTop = Math.max(0, viewport.scrollTop - (vRect.top + pad - oRect.top));
      } else if (oRect.bottom > vRect.bottom - pad) {
        viewport.scrollTop = Math.min(
          maxScroll,
          viewport.scrollTop + (oRect.bottom - (vRect.bottom - pad)),
        );
      }
      return;
    }
  }

  if (typeof option.scrollIntoView === 'function') {
    try {
      option.scrollIntoView(toPageOptions({ block: 'nearest' }, doc));
    } catch {
      option.scrollIntoView(false);
    }
  }
}

function computeSearchPageStepItems(options, viewport) {
  if (!viewport || options.length === 0) return 5;
  const firstRect =
    typeof options[0].getBoundingClientRect === 'function'
      ? options[0].getBoundingClientRect()
      : null;
  const rowHeight = firstRect && firstRect.height > 0 ? firstRect.height : 52;
  const viewportHeight =
    typeof viewport.clientHeight === 'number' && viewport.clientHeight > 0
      ? viewport.clientHeight
      : typeof viewport.getBoundingClientRect === 'function'
        ? viewport.getBoundingClientRect().height
        : 0;
  if (viewportHeight <= 0 || rowHeight <= 0) return 5;
  return Math.max(1, Math.floor(viewportHeight / rowHeight) - 1);
}

function isCtrlOrCmdK(event) {
  if (!event || event.altKey || event.shiftKey) return false;
  if (event.ctrlKey === event.metaKey) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  const keyMatch = typeof event.key === 'string' && event.key.toLowerCase() === 'k';
  const codeMatch = event.code === 'KeyK';
  return keyMatch || codeMatch;
}

export function createSearchThreadsFeature({ doc = document, observe = true } = {}) {
  let activeContainer = null;
  let activeInput = null;
  let activeOption = null;
  let activeRow = null;
  let lastQuery = '';
  let pendingQueryReset = false;
  let lastPointerX = null;
  let lastPointerY = null;
  let optionIdCounter = 0;
  let observer = null;
  let syncScheduled = false;

  let openedSidebarViaShortcut = false;
  let pendingOpenSearch = false;
  let pendingOpenTimer = null;
  let clickedSearchTrigger = null;

  const view = doc.defaultView || null;
  const keyTarget = view || doc;

  function clearPendingOpenSearch() {
    pendingOpenSearch = false;
    clickedSearchTrigger = null;
    if (pendingOpenTimer !== null) {
      clearTimeout(pendingOpenTimer);
      pendingOpenTimer = null;
    }
  }

  function armPendingOpenSearch() {
    clearPendingOpenSearch();
    pendingOpenSearch = true;
    pendingOpenTimer = setTimeout(() => {
      pendingOpenSearch = false;
      pendingOpenTimer = null;
    }, PENDING_OPEN_TIMEOUT_MS);
  }

  function clearActiveOptionState(option, row, input) {
    if (option && typeof option.removeAttribute === 'function') {
      option.removeAttribute(SEARCH_ACTIVE_ATTR);
      option.removeAttribute('aria-selected');
    }
    if (row && typeof row.removeAttribute === 'function') {
      row.removeAttribute(SEARCH_ACTIVE_ROW_ATTR);
    }
    if (input && typeof input.removeAttribute === 'function') {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function ensureOptionId(option) {
    if (option.id) return option.id;
    const existing = typeof option.getAttribute === 'function' ? option.getAttribute('id') : null;
    if (existing) return existing;
    optionIdCounter += 1;
    const generated = `${SEARCH_OPTION_ID_PREFIX}${optionIdCounter}`;
    if (typeof option.setAttribute === 'function') {
      option.setAttribute('id', generated);
    } else {
      option.id = generated;
    }
    return generated;
  }

  function setActiveOption(option, { scroll = false, isFirst = false } = {}) {
    const nextRow = findActiveRowElement(option);
    if (activeOption && activeOption !== option) {
      clearActiveOptionState(activeOption, activeRow !== nextRow ? activeRow : null, null);
    } else if (activeRow && activeRow !== nextRow) {
      clearActiveOptionState(null, activeRow, null);
    }

    activeOption = option || null;
    activeRow = nextRow;

    if (!activeOption) {
      if (activeInput && typeof activeInput.removeAttribute === 'function') {
        activeInput.removeAttribute('aria-activedescendant');
      }
      return;
    }

    const optId = ensureOptionId(activeOption);
    if (typeof activeOption.setAttribute === 'function') {
      activeOption.setAttribute(SEARCH_ACTIVE_ATTR, 'true');
      activeOption.setAttribute('aria-selected', 'true');
    }
    if (activeRow && typeof activeRow.setAttribute === 'function') {
      activeRow.setAttribute(SEARCH_ACTIVE_ROW_ATTR, 'true');
    }
    if (activeInput && typeof activeInput.setAttribute === 'function') {
      activeInput.setAttribute('aria-activedescendant', optId);
    }

    if (scroll) {
      scrollSearchOptionIntoView(activeOption, activeContainer, isFirst, doc);
    }
  }

  function handleInputChange() {
    if (!activeInput) return;
    lastQuery = activeInput.value || '';
    pendingQueryReset = true;
    scheduleSync();
  }

  function handleContainerPointerMove(event) {
    if (!activeContainer) return;
    if (
      typeof event.clientX === 'number' &&
      typeof event.clientY === 'number' &&
      event.clientX === lastPointerX &&
      event.clientY === lastPointerY
    ) {
      return;
    }
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    const targetEl = resolveSearchElementNode(event.target);
    if (!targetEl) return;

    const options = findSearchThreadOptions(activeContainer, activeInput);
    const hovered = options.find((opt) => {
      if (opt === targetEl || (typeof opt.contains === 'function' && opt.contains(targetEl))) {
        return true;
      }
      const row = findActiveRowElement(opt);
      return Boolean(row && (row === targetEl || (typeof row.contains === 'function' && row.contains(targetEl))));
    });
    if (hovered && hovered !== activeOption) {
      setActiveOption(hovered, { scroll: false });
    }
  }

  function detachContainerListeners() {
    if (activeContainer && typeof activeContainer.removeEventListener === 'function') {
      activeContainer.removeEventListener('pointermove', handleContainerPointerMove, true);
    }
    if (activeInput && typeof activeInput.removeEventListener === 'function') {
      activeInput.removeEventListener('input', handleInputChange);
    }
    clearActiveOptionState(activeOption, activeRow, activeInput);
    activeContainer = null;
    activeInput = null;
    activeOption = null;
    activeRow = null;
    lastQuery = '';
    pendingQueryReset = false;
    lastPointerX = null;
    lastPointerY = null;
  }

  function advancePendingOpenSearch() {
    if (!pendingOpenSearch) return;

    const existing = findSearchThreadsUI(doc);
    if (existing) {
      clearPendingOpenSearch();
      focusElement(existing.input, doc, { select: true });
      sync();
      return;
    }

    const sidebar = findSidebarContainer(doc);
    if (!sidebar) return;

    const trigger = findSearchThreadsTriggerButton(sidebar);
    if (trigger && trigger !== clickedSearchTrigger && typeof trigger.click === 'function') {
      clickedSearchTrigger = trigger;
      trigger.click();
      const opened = findSearchThreadsUI(doc);
      if (opened) {
        clearPendingOpenSearch();
        focusElement(opened.input, doc, { select: true });
        sync();
      }
    }
  }

  function closeSearch({ restoreFocus = true } = {}) {
    clearPendingOpenSearch();
    const shouldCollapseSidebar = openedSidebarViaShortcut;
    openedSidebarViaShortcut = false;

    const sidebar = findSidebarContainer(doc);
    const container = activeContainer || sidebar;
    const exitBtn = findExitSearchButton(container);
    if (exitBtn && typeof exitBtn.click === 'function') {
      exitBtn.click();
    }

    if (shouldCollapseSidebar) {
      const currentSidebar = findSidebarContainer(doc);
      const closeBtn = findCloseSidebarButton(currentSidebar);
      if (closeBtn && typeof closeBtn.click === 'function') {
        closeBtn.click();
      }
    }

    sync();

    if (restoreFocus) {
      const prompt = findPromptInput(doc);
      if (prompt) {
        focusElement(prompt, doc);
      }
    }
  }

  function triggerCtrlK() {
    const existing = findSearchThreadsUI(doc);
    if (existing) {
      clearPendingOpenSearch();
      const activeEl = resolveSearchElementNode(doc.activeElement);
      const isFocusedInSearch =
        activeEl === existing.input ||
        Boolean(activeEl && typeof existing.container.contains === 'function' && existing.container.contains(activeEl));

      if (isFocusedInSearch) {
        closeSearch({ restoreFocus: true });
      } else {
        focusElement(existing.input, doc, { select: true });
        sync();
      }
      return;
    }

    const sidebar = findSidebarContainer(doc);
    if (sidebar) {
      openedSidebarViaShortcut = false;
      armPendingOpenSearch();
      advancePendingOpenSearch();
      return;
    }

    const openBtn = findOpenSidebarButton(doc);
    if (openBtn && typeof openBtn.click === 'function') {
      openedSidebarViaShortcut = true;
      armPendingOpenSearch();
      openBtn.click();
      advancePendingOpenSearch();
    }
  }

  function sync() {
    if (!isAiModePage(doc)) {
      clearPendingOpenSearch();
      openedSidebarViaShortcut = false;
      if (activeContainer || activeInput || activeOption) {
        detachContainerListeners();
      }
      return null;
    }

    if (pendingOpenSearch) {
      advancePendingOpenSearch();
    }

    const found = findSearchThreadsUI(doc);
    if (!found) {
      if (activeContainer || activeInput || activeOption) {
        detachContainerListeners();
      }
      if (!pendingOpenSearch && !findSidebarContainer(doc)) {
        openedSidebarViaShortcut = false;
      }
      return null;
    }

    const isNewUI = found.container !== activeContainer || found.input !== activeInput;
    if (isNewUI) {
      detachContainerListeners();
      activeContainer = found.container;
      activeInput = found.input;
      lastQuery = activeInput.value || '';
      pendingQueryReset = false;

      if (typeof activeContainer.addEventListener === 'function') {
        activeContainer.addEventListener('pointermove', handleContainerPointerMove, true);
      }
      if (typeof activeInput.addEventListener === 'function') {
        activeInput.addEventListener('input', handleInputChange);
      }
    }

    if (activeInput.disabled) {
      setActiveOption(null);
      return activeContainer;
    }

    const options = findSearchThreadOptions(activeContainer, activeInput);
    if (options.length === 0) {
      setActiveOption(null);
      return activeContainer;
    }

    const currentQuery = activeInput.value || '';
    const queryChanged = pendingQueryReset || currentQuery !== lastQuery;
    lastQuery = currentQuery;
    pendingQueryReset = false;

    if (queryChanged) {
      setActiveOption(options[0], { scroll: true, isFirst: true });
      return activeContainer;
    }

    if (activeOption && options.includes(activeOption)) {
      setActiveOption(activeOption, { scroll: false });
      return activeContainer;
    }

    setActiveOption(options[0], { scroll: true, isFirst: true });
    return activeContainer;
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    const run = () => {
      syncScheduled = false;
      sync();
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function isContainerOrViewportFocused(el) {
    if (!el || !activeContainer) return false;
    if (el === activeContainer) return true;
    if (typeof activeContainer.contains === 'function' && !activeContainer.contains(el)) {
      return false;
    }
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return false;
    }
    if (el.classList?.contains?.('cIl10d') || el.classList?.contains?.('XOpo9c')) return true;
    return typeof el.getAttribute === 'function' && el.getAttribute('tabindex') === '0';
  }

  function handleKeyDown(event) {
    if (!event) return;
    if (!isAiModePage(doc)) return;

    if (isCtrlOrCmdK(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      triggerCtrlK();
      return;
    }

    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'PageDown' &&
      event.key !== 'PageUp' &&
      event.key !== 'Enter' &&
      event.key !== 'Escape'
    ) {
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.isComposing || event.keyCode === 229) return;

    if (!activeContainer || !activeInput) {
      sync();
    }
    if (!activeContainer || !activeInput) return;

    const activeEl = resolveSearchElementNode(doc.activeElement);
    const targetEl = resolveSearchElementNode(event.target);

    if (event.key === 'Escape') {
      const inSearchContainer =
        activeEl === activeInput ||
        targetEl === activeInput ||
        Boolean(
          activeEl &&
            typeof activeContainer.contains === 'function' &&
            activeContainer.contains(activeEl),
        );
      if (!inSearchContainer) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      closeSearch({ restoreFocus: true });
      return;
    }

    if (activeInput.disabled) return;

    const inputFocused = activeEl === activeInput || targetEl === activeInput;
    const viewportFocused = !inputFocused && isContainerOrViewportFocused(activeEl);

    if (event.key === 'Enter') {
      if (!inputFocused && !viewportFocused) return;
      const options = findSearchThreadOptions(activeContainer, activeInput);
      if (options.length === 0) return;

      const selected = activeOption && options.includes(activeOption) ? activeOption : options[0];
      if (!selected || typeof selected.click !== 'function') return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      const shouldCollapse = openedSidebarViaShortcut;
      openedSidebarViaShortcut = false;
      selected.click();

      if (shouldCollapse) {
        setTimeout(() => {
          const closeBtn = findCloseSidebarButton(findSidebarContainer(doc));
          if (closeBtn && typeof closeBtn.click === 'function') {
            closeBtn.click();
          }
        }, 0);
      }
      return;
    }

    if (!inputFocused && !viewportFocused) return;

    const options = findSearchThreadOptions(activeContainer, activeInput);
    if (options.length === 0) return;

    const currentIndex = activeOption ? options.indexOf(activeOption) : -1;
    let delta = 0;
    let wrap = !event.repeat;

    if (event.key === 'ArrowDown') {
      delta = 1;
    } else if (event.key === 'ArrowUp') {
      delta = -1;
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      const viewport = findSearchScrollViewport(options[0], activeContainer);
      const step = computeSearchPageStepItems(options, viewport);
      delta = event.key === 'PageDown' ? step : -step;
      wrap = false;
    }

    const nextIndex = computeNextOptionIndex(currentIndex, options.length, delta, { wrap });
    if (nextIndex < 0) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    if (viewportFocused) {
      focusElement(activeInput, doc);
    }

    setActiveOption(options[nextIndex], { scroll: true, isFirst: nextIndex === 0 });
  }

  function init() {
    injectStyles(SEARCH_THREADS_STYLES, SEARCH_THREADS_FEATURE_ID, doc);
    keyTarget.addEventListener('keydown', handleKeyDown, true);
    sync();

    const observeRoot = doc.body || doc.documentElement;
    if (observe && typeof MutationObserver === 'function' && observeRoot) {
      observer = new MutationObserver(scheduleSync);
      try {
        observer.observe(observeRoot, toPageOptions({ childList: true, subtree: true }, doc));
      } catch {
        observer.observe(observeRoot, { childList: true, subtree: true });
      }
    }
  }

  function destroy() {
    clearPendingOpenSearch();
    openedSidebarViaShortcut = false;
    keyTarget.removeEventListener('keydown', handleKeyDown, true);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    detachContainerListeners();
  }

  return {
    id: SEARCH_THREADS_FEATURE_ID,
    init,
    sync,
    destroy,
    getActiveOption: () => activeOption,
  };
}
