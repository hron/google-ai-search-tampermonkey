import {
  OPEN_SIDEBAR_BUTTON_SELECTOR,
  findCloseSidebarButton,
  findOpenSidebarButton,
  findPromptInput,
  findSidebarSearchInput,
  findVisibleSidebarElement,
  focusElement,
  injectStyles,
  isAiModePage,
  isElementHidden,
  isInsideSidebarElement,
  isInsideSidebarThreadList,
  toPageOptions,
} from '../lib/dom.js';

export const SEARCH_THREADS_FEATURE_ID = 'search-threads';
export const SEARCH_ACTIVE_ATTR = 'data-gaism-search-active';
export const SEARCH_ACTIVE_ROW_ATTR = 'data-gaism-search-active-row';

const SEARCH_OPTION_ID_PREFIX = 'gaism-search-option-';
const PENDING_OPEN_TIMEOUT_MS = 2500;
const RESTORE_FOCUS_WINDOW_MS = 800;

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

function findSearchThreadsTriggerButton(sidebar) {
  if (!sidebar || typeof sidebar.querySelector !== 'function') return null;

  const byAria = sidebar.querySelector('button[aria-label*="Search" i]:not([disabled])');
  if (byAria && !isInsideSidebarThreadList(byAria)) return byAria;

  if (typeof sidebar.querySelectorAll === 'function') {
    const headerButtons = Array.from(sidebar.querySelectorAll('button:not([disabled])')).filter(
      (btn) => !btn.getAttribute?.('data-thread-id') && !isInsideSidebarThreadList(btn),
    );
    const byText = headerButtons.find((btn) => /search/i.test(btn.textContent || ''));
    if (byText) return byText;

    const byAction = sidebar.querySelector('button[jsaction*="MR4M8b"]:not([disabled])');
    if (byAction) return byAction;

    // Locale-independent structural fallback: in the sidebar action bar,
    // "New thread" is 1st and "Search threads" is 2nd (both have text labels,
    // unlike the icon-only Close sidebar button which uses aria-label).
    const actionBarButtons = headerButtons.filter(
      (btn) => (btn.textContent || '').trim().length > 0 && !btn.getAttribute?.('aria-label'),
    );
    if (actionBarButtons.length >= 2) {
      return actionBarButtons[1];
    }
  }

  return sidebar.querySelector('button[jsaction*="MR4M8b"]:not([disabled])') || null;
}

function findExitSearchButton(container) {
  if (!container || typeof container.querySelector !== 'function') return null;
  const byAria = container.querySelector('button[aria-label="Exit search"]:not([disabled])');
  if (byAria) return byAria;

  // Structural fallback (locale-independent): the Exit search button sits
  // inside the same search bar container directly before the search <input>.
  const input = findSidebarSearchInput(container);
  const searchBar = input?.parentElement || null;
  if (searchBar && typeof searchBar.querySelectorAll === 'function') {
    const buttons = Array.from(searchBar.querySelectorAll('button:not([disabled])'));
    if (buttons.length > 0) {
      return buttons[0];
    }
  }

  return null;
}

export function findSearchThreadsUI(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;

  const sidebar = findVisibleSidebarElement(doc);
  if (sidebar) {
    const input = findSidebarSearchInput(sidebar);
    if (input && !isElementHidden(input, sidebar)) {
      return { container: sidebar, input, isSidebar: true };
    }
  }

  // Graceful fallback if Google ever renders a modal search dialog
  if (typeof doc.querySelectorAll === 'function') {
    const dialogs = Array.from(doc.querySelectorAll('[role="dialog"]'));
    for (let i = dialogs.length - 1; i >= 0; i -= 1) {
      const dialog = dialogs[i];
      if (isElementHidden(dialog, dialog)) continue;
      const input =
        dialog.querySelector('[role="search"] input:not([type="hidden"])') ||
        dialog.querySelector('input[type="search"]');
      if (input && !isElementHidden(input, dialog)) {
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
    if (isElementHidden(el, container)) continue;
    if (input && el === input) continue;

    seen.add(el);
    options.push(el);
  }

  return options;
}

function findActiveRowElement(option) {
  if (!option || typeof option.closest !== 'function') return null;
  const listItem = option.closest('[role="listitem"]');
  const parent = option.parentElement;
  if (parent && listItem && parent !== listItem && listItem.contains?.(parent)) {
    return parent;
  }
  return listItem || null;
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

function isScrollableOverflowY(el) {
  const view = el?.ownerDocument?.defaultView;
  let overflowY = null;
  try {
    overflowY = view?.getComputedStyle?.(el)?.overflowY || null;
  } catch {
    overflowY = null;
  }
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

function findSearchScrollViewport(option, container) {
  let cur = option?.parentElement || null;
  while (cur && cur !== container) {
    if (
      typeof cur.scrollHeight === 'number' &&
      typeof cur.clientHeight === 'number' &&
      cur.scrollHeight > cur.clientHeight + 1 &&
      isScrollableOverflowY(cur)
    ) {
      return cur;
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

  let restoreFocusActive = false;
  let restoreFocusExpiryTimer = null;
  let restoreFocusFollowupTimers = [];

  const view = doc.defaultView || null;
  const keyTarget = view || doc;

  function isSidebarFocusStealTarget(el) {
    if (!el || typeof el.closest !== 'function') return false;
    if (isInsideSidebarElement(el)) return true;
    return Boolean(el.closest(OPEN_SIDEBAR_BUTTON_SELECTOR));
  }

  function focusPromptIfNeeded() {
    const prompt = findPromptInput(doc);
    if (!prompt) return;
    if (doc.activeElement !== prompt) {
      focusElement(prompt, doc);
    }
  }

  function handleRestoreFocusIn(event) {
    if (!restoreFocusActive) return;
    const targetEl = resolveSearchElementNode(event?.target);
    if (!targetEl || targetEl === doc.body || targetEl === doc.documentElement) {
      focusPromptIfNeeded();
      return;
    }
    const prompt = findPromptInput(doc);
    if (
      prompt &&
      (targetEl === prompt || (typeof prompt.contains === 'function' && prompt.contains(targetEl)))
    ) {
      return;
    }
    if (isSidebarFocusStealTarget(targetEl)) {
      focusPromptIfNeeded();
    }
  }

  function handleRestoreCancelPointer() {
    cancelRestorePromptFocus();
  }

  function handleRestoreCancelKey(event) {
    if (event?.key === 'Tab') {
      cancelRestorePromptFocus();
    }
  }

  function cancelRestorePromptFocus() {
    if (
      !restoreFocusActive &&
      restoreFocusExpiryTimer === null &&
      restoreFocusFollowupTimers.length === 0
    ) {
      return;
    }
    restoreFocusActive = false;
    if (restoreFocusExpiryTimer !== null) {
      clearTimeout(restoreFocusExpiryTimer);
      restoreFocusExpiryTimer = null;
    }
    for (const id of restoreFocusFollowupTimers) {
      clearTimeout(id);
    }
    restoreFocusFollowupTimers = [];
    if (typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('focusin', handleRestoreFocusIn, true);
      doc.removeEventListener('pointerdown', handleRestoreCancelPointer, true);
      doc.removeEventListener('mousedown', handleRestoreCancelPointer, true);
      doc.removeEventListener('keydown', handleRestoreCancelKey, true);
    }
  }

  function armRestorePromptFocus() {
    cancelRestorePromptFocus();
    restoreFocusActive = true;
    focusPromptIfNeeded();

    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('focusin', handleRestoreFocusIn, true);
      doc.addEventListener('pointerdown', handleRestoreCancelPointer, true);
      doc.addEventListener('mousedown', handleRestoreCancelPointer, true);
      doc.addEventListener('keydown', handleRestoreCancelKey, true);
    }

    for (const delayMs of [0, 50, 200, 450]) {
      restoreFocusFollowupTimers.push(
        setTimeout(() => {
          if (!restoreFocusActive) return;
          const activeEl = resolveSearchElementNode(doc.activeElement);
          if (
            !activeEl ||
            activeEl === doc.body ||
            activeEl === doc.documentElement ||
            isSidebarFocusStealTarget(activeEl)
          ) {
            focusPromptIfNeeded();
          }
        }, delayMs),
      );
    }

    restoreFocusExpiryTimer = setTimeout(() => {
      cancelRestorePromptFocus();
    }, RESTORE_FOCUS_WINDOW_MS);
  }

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

    const sidebar = findVisibleSidebarElement(doc);
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

    const sidebar = findVisibleSidebarElement(doc);
    const container = activeContainer || sidebar;
    const exitBtn = findExitSearchButton(container);
    if (exitBtn && typeof exitBtn.click === 'function') {
      exitBtn.click();
    }

    if (shouldCollapseSidebar) {
      const currentSidebar = findVisibleSidebarElement(doc);
      const closeBtn = findCloseSidebarButton(currentSidebar);
      if (closeBtn && typeof closeBtn.click === 'function') {
        closeBtn.click();
      }
    }

    sync();

    if (restoreFocus) {
      armRestorePromptFocus();
    }
  }

  function triggerCtrlK() {
    cancelRestorePromptFocus();
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

    const sidebar = findVisibleSidebarElement(doc);
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
      if (!pendingOpenSearch && !findVisibleSidebarElement(doc)) {
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
    if (isScrollableOverflowY(el)) return true;
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
          const closeBtn = findCloseSidebarButton(findVisibleSidebarElement(doc));
          if (closeBtn && typeof closeBtn.click === 'function') {
            closeBtn.click();
            armRestorePromptFocus();
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
    cancelRestorePromptFocus();
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
