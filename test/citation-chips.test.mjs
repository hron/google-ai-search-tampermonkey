import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CITATION_CHIPS_FEATURE_ID,
  CITATION_CHIPS_STYLES,
  computeClampedDialogTop,
  createCitationChipsFeature,
} from '../src/features/citation-chips.js';

function createEnv({ search = '?udm=50&q=antigravity', viewportHeight = 900, dialogs = [] } = {}) {
  const listeners = [];
  const headChildren = [];

  const head = {
    appendChild(node) {
      headChildren.push(node);
      return node;
    },
  };

  const defaultView = {
    innerHeight: viewportHeight,
    location: { search, pathname: '/search' },
    addEventListener(type, fn, capture) {
      listeners.push({ target: 'window', type, fn, capture });
    },
    removeEventListener(type, fn) {
      const i = listeners.findIndex((l) => l.target === 'window' && l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };

  const doc = {
    defaultView,
    location: defaultView.location,
    head,
    body: {},
    createElement(tag) {
      const attrs = new Map();
      return {
        tagName: tag.toUpperCase(),
        textContent: '',
        setAttribute(k, v) {
          attrs.set(k, String(v));
        },
        getAttribute(k) {
          return attrs.has(k) ? attrs.get(k) : null;
        },
      };
    },
    querySelector(sel) {
      const match = sel.match(/^style\[data-gaism-style-id="([^"]+)"\]$/);
      if (match) {
        return headChildren.find((n) => n.getAttribute('data-gaism-style-id') === match[1]) || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[role="dialog"]' || sel === '[role="dialog"].jR6h') {
        return dialogs;
      }
      return [];
    },
    addEventListener(type, fn, capture) {
      listeners.push({ target: 'document', type, fn, capture });
    },
    removeEventListener(type, fn) {
      const i = listeners.findIndex((l) => l.target === 'document' && l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };

  const button = {
    tagName: 'BUTTON',
    clicked: 0,
    click() { this.clicked += 1; },
    closest: (sel) => (sel.includes('button[data-amic="true"]') ? button : null),
  };
  const chip = { tagName: 'SPAN' };
  button.parentElement = chip;
  const anchor = {
    tagName: 'A',
    parentElement: chip,
    textContent: '',
    matches: (sel) => sel.includes('a.PMDqCb') || sel === 'a',
  };
  chip.querySelector = (sel) => (sel === 'button[data-amic="true"]' ? button : null);
  anchor.closest = (sel) => (sel === 'a' || sel.includes('a.PMDqCb') ? anchor : null);

  const altAnchor = {
    tagName: 'A',
    parentElement: chip,
    textContent: '',
    matches: (sel) => sel.includes('a.rA9BFb') || sel === 'a',
  };
  altAnchor.closest = (sel) => (sel === 'a' || sel.includes('a.rA9BFb') ? altAnchor : null);

  const renamedClassAnchor = {
    tagName: 'A',
    parentElement: chip,
    textContent: '',
    matches: (sel) => sel === 'a',
  };
  renamedClassAnchor.closest = (sel) => (sel === 'a' ? renamedClassAnchor : null);

  const proseContainer = {
    tagName: 'P',
    querySelector: (sel) => (sel === 'button[data-amic="true"]' ? button : null),
  };
  const proseLink = {
    tagName: 'A',
    parentElement: proseContainer,
    textContent: 'Wikipedia article',
    matches: (sel) => sel === 'a',
  };
  proseLink.closest = (sel) => (sel === 'a' ? proseLink : null);

  const plainLink = {
    tagName: 'A',
    textContent: 'Plain link',
    closest: (sel) => (sel === 'a' ? plainLink : null),
  };

  const fire = (target, props = {}, type = 'click') => {
    const ev = {
      type,
      target,
      isTrusted: false,
      defaultPrevented: false,
      stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; },
      ...props,
    };
    for (const l of listeners.filter((x) => x.type === type)) l.fn(ev);
    return ev;
  };

  const fireResize = () => {
    const ev = { type: 'resize' };
    for (const l of listeners.filter((x) => x.type === 'resize')) l.fn(ev);
  };

  return {
    doc,
    listeners,
    headChildren,
    anchor,
    altAnchor,
    renamedClassAnchor,
    proseLink,
    button,
    plainLink,
    fire,
    fireResize,
  };
}

function createFakeDialog({
  top,
  height,
  ariaModal = null,
  ariaLabel = null,
  hasExternalLinks = true,
  hasInputs = false,
  classes = [],
}) {
  const attrs = new Map();
  if (ariaModal !== null) attrs.set('aria-modal', ariaModal);
  if (ariaLabel !== null) attrs.set('aria-label', ariaLabel);
  const classSet = new Set(classes);
  const dialog = {
    style: { top: `${top}px`, left: '500px' },
    _top: top,
    _height: height,
    classList: {
      contains: (c) => classSet.has(c),
    },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    querySelector: (sel) => {
      if (sel.includes('input') && hasInputs) return { tagName: 'INPUT' };
      if (sel.includes('a[href') && hasExternalLinks) return { tagName: 'A' };
      return null;
    },
    getBoundingClientRect() {
      return { top: dialog._top, bottom: dialog._top + dialog._height, height: dialog._height };
    },
  };
  return dialog;
}

describe('computeClampedDialogTop', () => {
  it('returns null when dialog already fits inside the viewport with margin', () => {
    assert.equal(computeClampedDialogTop({ top: 100, bottom: 590, height: 490 }, 900, 16), null);
  });

  it('shifts dialog upward when expanded height would overflow the bottom of the viewport', () => {
    // 550 + 490 = 1040 > 900 - 16 (884) -> 884 - 490 = 394
    assert.equal(computeClampedDialogTop({ top: 550, bottom: 1040, height: 490 }, 900, 16), 394);
  });

  it('clamps to top margin when dialog is taller than viewport minus margins or starts above margin', () => {
    assert.equal(computeClampedDialogTop({ top: 400, bottom: 1300, height: 900 }, 900, 16), 16);
    assert.equal(computeClampedDialogTop({ top: -20, bottom: 400, height: 420 }, 900, 16), 16);
  });

  it('returns null for hidden/zero-height dialogs', () => {
    assert.equal(computeClampedDialogTop({ top: 0, bottom: 0, height: 0 }, 900, 16), null);
  });
});

describe('citation-chips feature (Vimium compatibility & full-height links dialog)', () => {
  it('redirects synthetic clicks on the chip overlay link (a.PMDqCb and a.rA9BFb) to the chip button', () => {
    const env = createEnv();
    const feature = createCitationChipsFeature({ doc: env.doc, observe: false });
    assert.equal(feature.id, CITATION_CHIPS_FEATURE_ID);
    feature.init();

    const ev1 = env.fire(env.anchor, { isTrusted: false });
    assert.equal(ev1.defaultPrevented, true, 'must not navigate to first source');
    assert.equal(ev1.stopped, true);
    assert.equal(env.button.clicked, 1, 'must open the related-links list');

    const ev2 = env.fire(env.altAnchor, { isTrusted: false });
    assert.equal(ev2.defaultPrevented, true);
    assert.equal(env.button.clicked, 2);

    const ev3 = env.fire(env.renamedClassAnchor, { isTrusted: false });
    assert.equal(ev3.defaultPrevented, true, 'must work even when Google renames overlay link classes');
    assert.equal(env.button.clicked, 3);

    const proseEv = env.fire(env.proseLink, { isTrusted: false });
    assert.equal(proseEv.defaultPrevented, false, 'must not hijack ordinary prose links sharing a paragraph with a chip');
    assert.equal(env.button.clicked, 3);

    feature.destroy();
  });

  it('leaves real (trusted) mouse clicks untouched', () => {
    const env = createEnv();
    const feature = createCitationChipsFeature({ doc: env.doc, observe: false });
    feature.init();

    const ev = env.fire(env.anchor, { isTrusted: true });
    assert.equal(ev.defaultPrevented, false);
    assert.equal(env.button.clicked, 0);
    feature.destroy();
  });

  it('ignores synthetic clicks on ordinary links', () => {
    const env = createEnv();
    const feature = createCitationChipsFeature({ doc: env.doc, observe: false });
    feature.init();

    const ev = env.fire(env.plainLink, { isTrusted: false });
    assert.equal(ev.defaultPrevented, false);
    assert.equal(env.button.clicked, 0);
    feature.destroy();
  });

  it('injects full-height Related links dialog styles on AI Mode pages, not regular search', () => {
    const aiEnv = createEnv({ search: '?udm=50&q=antigravity' });
    const aiFeature = createCitationChipsFeature({ doc: aiEnv.doc, observe: false });
    aiFeature.init();

    assert.equal(aiEnv.headChildren.length, 1);
    assert.equal(aiEnv.headChildren[0].textContent, CITATION_CHIPS_STYLES);
    assert.match(CITATION_CHIPS_STYLES, /\[role="dialog"\]\[data-gaism-related-links-dialog="true"\]/);
    assert.match(CITATION_CHIPS_STYLES, /max-block-size:\s*calc\(100vh - 32px\)\s*!important/);
    aiFeature.destroy();

    const regEnv = createEnv({ search: '?q=weather' });
    const regFeature = createCitationChipsFeature({ doc: regEnv.doc, observe: false });
    regFeature.init();
    assert.equal(regEnv.headChildren.length, 0, 'must not inject styles on regular search');
    regFeature.destroy();
  });

  it('clamps expanded Related links dialog top position so it stays inside the viewport', () => {
    const dialog = createFakeDialog({ top: 550, height: 490 });
    const modalDialog = createFakeDialog({ top: 550, height: 490, ariaModal: 'true' });
    const searchDialog = createFakeDialog({ top: 550, height: 490, hasInputs: true });
    const env = createEnv({ viewportHeight: 900, dialogs: [dialog, modalDialog, searchDialog] });
    const feature = createCitationChipsFeature({ doc: env.doc, observe: false });
    feature.init();

    assert.equal(dialog.getAttribute('data-gaism-related-links-dialog'), 'true');
    assert.equal(dialog.style.top, '394px');
    assert.equal(modalDialog.getAttribute('data-gaism-related-links-dialog'), null);
    assert.equal(modalDialog.style.top, '550px');
    assert.equal(searchDialog.getAttribute('data-gaism-related-links-dialog'), null);
    assert.equal(searchDialog.style.top, '550px');

    // Also re-clamps on window resize
    dialog._top = 394;
    env.doc.defaultView.innerHeight = 600;
    env.fireResize();
    assert.equal(dialog.style.top, '94px');

    feature.destroy();
  });

  it('suppresses synthetic mousedown/mouseup/pointerdown/pointerup on citation chips so switching dialogs works in one click', () => {
    const env = createEnv();
    const feature = createCitationChipsFeature({ doc: env.doc, observe: false });
    feature.init();

    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      for (const target of [env.anchor, env.altAnchor, env.button]) {
        const synthEv = env.fire(target, { isTrusted: false }, type);
        assert.equal(synthEv.defaultPrevented, true, `synthetic ${type} on chip must be prevented`);
        assert.equal(synthEv.stopped, true, `synthetic ${type} on chip must stop propagation`);

        const trustedEv = env.fire(target, { isTrusted: true }, type);
        assert.equal(trustedEv.defaultPrevented, false, `trusted ${type} on chip must stay untouched`);
        assert.equal(trustedEv.stopped, false, `trusted ${type} on chip must not stop propagation`);
      }

      const plainEv = env.fire(env.plainLink, { isTrusted: false }, type);
      assert.equal(plainEv.defaultPrevented, false, `synthetic ${type} on ordinary link must stay untouched`);
      assert.equal(plainEv.stopped, false);
    }

    feature.destroy();
  });

  it('removes its listeners on destroy()', () => {
    const env = createEnv();
    const feature = createCitationChipsFeature({ doc: env.doc, observe: false });
    feature.init();
    feature.destroy();
    assert.equal(env.listeners.length, 0);
  });
});
