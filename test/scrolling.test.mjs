import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGE_SCROLL_RATIO,
  computePageStep,
  applyScrollAction,
  createSmoothPageScroller,
} from '../src/lib/scrolling.js';

describe('computePageStep', () => {
  it('computes ~85% of viewport height with a minimum floor', () => {
    assert.equal(computePageStep({ clientHeight: 800 }), Math.round(800 * PAGE_SCROLL_RATIO));
    assert.equal(computePageStep({ clientHeight: 50 }), 100);
    assert.equal(computePageStep(null), Math.round(600 * PAGE_SCROLL_RATIO));
  });
});

describe('applyScrollAction', () => {
  it('calls scrollBy for "by" actions and scrollTo for "to" actions', () => {
    const calls = [];
    const scroller = {
      scrollBy(opts) {
        calls.push(['scrollBy', opts]);
      },
      scrollTo(opts) {
        calls.push(['scrollTo', opts]);
      },
    };

    applyScrollAction(scroller, { type: 'by', delta: -60, behavior: 'instant' });
    applyScrollAction(scroller, { type: 'to', top: 0, behavior: 'smooth' });

    assert.deepEqual(calls, [
      ['scrollBy', { top: -60, behavior: 'instant' }],
      ['scrollTo', { top: 0, behavior: 'smooth' }],
    ]);
  });

  it('falls back to direct scrollTop assignment if scrollBy/scrollTo throws (Firefox XrayWrapper)', () => {
    const scroller = {
      scrollTop: 200,
      scrollBy() {
        throw new Error('Permission denied to access property "top"');
      },
      scrollTo() {
        throw new Error('Permission denied to access property "behavior"');
      },
    };

    assert.equal(applyScrollAction(scroller, { type: 'by', delta: -60, behavior: 'instant' }), true);
    assert.equal(scroller.scrollTop, 140);

    assert.equal(applyScrollAction(scroller, { type: 'to', top: 0, behavior: 'smooth' }), true);
    assert.equal(scroller.scrollTop, 0);
  });
});

describe('createSmoothPageScroller', () => {
  function createHarness({ scrollTop = 1500, clientHeight = 800, scrollHeight = 6000, reducedMotion = false } = {}) {
    let nowMs = 0;
    let nextId = 1;
    const frames = new Map();
    const scrollCalls = [];

    const scroller = {
      scrollTop,
      clientHeight,
      scrollHeight,
      scrollTo(opts) {
        scrollCalls.push(['scrollTo', opts]);
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = Math.max(0, Math.min(max, opts.top));
      },
      scrollBy(opts) {
        scrollCalls.push(['scrollBy', opts]);
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + opts.top));
      },
    };

    const requestFrame = (cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    };

    const cancelFrame = (id) => {
      frames.delete(id);
    };

    const stepFrame = (dtMs = 16.6667) => {
      nowMs += dtMs;
      const pending = Array.from(frames.entries());
      frames.clear();
      for (const [, cb] of pending) {
        cb(nowMs);
      }
    };

    const advanceMs = (totalMs, stepMs = 16.6667) => {
      const steps = Math.round(totalMs / stepMs);
      for (let i = 0; i < steps; i += 1) {
        if (frames.size === 0) break;
        stepFrame(stepMs);
      }
    };

    const controller = createSmoothPageScroller({
      getScroller: () => scroller,
      requestFrame,
      cancelFrame,
      prefersReducedMotion: () => reducedMotion,
    });

    return {
      scroller,
      scrollCalls,
      frames,
      stepFrame,
      advanceMs,
      controller,
    };
  }

  it('smoothly glides one page on a quick tap without overshoot and stops', () => {
    const h = createHarness({ scrollTop: 1500, clientHeight: 800, scrollHeight: 6000 });
    const pageStep = computePageStep(h.scroller);

    h.controller.press(-1);
    h.advanceMs(50);
    h.controller.release(-1);
    h.advanceMs(50);
    const mid = h.scroller.scrollTop;
    assert.ok(
      mid < 1500 - 100 && mid > 1500 - pageStep + 100,
      `expected smooth mid-flight scrollTop, got ${mid}`,
    );

    h.advanceMs(700);
    assert.equal(h.scroller.scrollTop, 1500 - pageStep);
    assert.equal(h.frames.size, 0, 'should settle cleanly after release');
  });

  it('accumulates rapid taps smoothly without losing distance', () => {
    const h = createHarness({ scrollTop: 1000, clientHeight: 800, scrollHeight: 6000 });
    const pageStep = computePageStep(h.scroller);

    for (let i = 0; i < 3; i += 1) {
      h.controller.press(1);
      h.advanceMs(33);
      h.controller.release(1);
      h.advanceMs(33);
    }

    h.advanceMs(900);
    assert.equal(h.scroller.scrollTop, 1000 + 3 * pageStep);
    assert.equal(h.frames.size, 0);
  });

  it('reverses smoothly mid-flight when opposite page key is pressed', () => {
    const h = createHarness({ scrollTop: 1500, clientHeight: 800, scrollHeight: 6000 });
    const pageStep = computePageStep(h.scroller);

    h.controller.press(-1);
    h.advanceMs(50);
    h.controller.release(-1);
    h.advanceMs(50);
    const turnedAt = h.scroller.scrollTop;
    assert.ok(turnedAt < 1400);

    h.controller.press(1);
    h.advanceMs(50);
    h.controller.release(1);
    h.advanceMs(800);
    assert.ok(
      Math.abs(h.scroller.scrollTop - (turnedAt + pageStep)) <= 2,
      `expected smooth reversal target near ${Math.round(turnedAt + pageStep)}, got ${h.scroller.scrollTop}`,
    );
    assert.equal(h.frames.size, 0);
  });

  it('scrolls continuously and smoothly while held and coasts to stop on release', () => {
    const h = createHarness({ scrollTop: 500, clientHeight: 800, scrollHeight: 6000 });

    h.controller.press(1);

    const deltas = [];
    let prev = h.scroller.scrollTop;
    for (let i = 0; i < 48; i += 1) {
      h.stepFrame(16.6667);
      deltas.push(h.scroller.scrollTop - prev);
      prev = h.scroller.scrollTop;
    }

    assert.ok(deltas.every((d) => d > 0), 'every frame while held should advance smoothly');
    assert.ok(h.scroller.scrollTop > 1800, `expected continuous held scrolling past 1800, got ${h.scroller.scrollTop}`);

    const atRelease = h.scroller.scrollTop;
    h.controller.release(1);
    h.advanceMs(700);
    assert.ok(h.scroller.scrollTop > atRelease + 40, 'should smoothly coast after release');
    assert.equal(h.frames.size, 0);
  });

  it('clamps cleanly at top and bottom bounds without scheduling wasted frames when already at edge', () => {
    const h = createHarness({ scrollTop: 0, clientHeight: 800, scrollHeight: 2000 });
    h.controller.press(-1);
    assert.equal(h.frames.size, 0, 'no animation needed when already at top');
    assert.equal(h.scroller.scrollTop, 0);

    h.scroller.scrollTop = 1000;
    h.controller.press(1);
    h.advanceMs(50);
    h.controller.release(1);
    h.advanceMs(700);
    assert.equal(h.scroller.scrollTop, 1200);
    assert.equal(h.frames.size, 0);
  });

  it('stops immediately if scrollTop is changed externally after release', () => {
    const h = createHarness({ scrollTop: 1500 });
    h.controller.press(-1);
    h.advanceMs(33);
    h.controller.release(-1);
    h.stepFrame(16.6667);

    h.scroller.scrollTop = 2200;
    h.stepFrame(16.6667);
    assert.equal(h.scroller.scrollTop, 2200);
    assert.equal(h.frames.size, 0);
  });

  it('falls back to smooth scrollBy when requestAnimationFrame is unavailable, and instant when reduced motion is preferred', () => {
    const calls = [];
    const scroller = {
      scrollTop: 1000,
      clientHeight: 800,
      scrollHeight: 3000,
      scrollBy(opts) {
        calls.push(opts);
      },
    };

    const fallbackController = createSmoothPageScroller({
      getScroller: () => scroller,
      requestFrame: null,
      cancelFrame: null,
    });
    fallbackController.press(-1);
    assert.deepEqual(calls, [{ top: -680, behavior: 'smooth' }]);

    const reduced = createHarness({ scrollTop: 1500, reducedMotion: true });
    reduced.controller.press(1);
    assert.equal(reduced.frames.size, 0);
    assert.deepEqual(reduced.scrollCalls, [['scrollBy', { top: 680, behavior: 'instant' }]]);
  });
});
