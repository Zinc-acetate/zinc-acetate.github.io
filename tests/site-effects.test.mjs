import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import {
  initPointerDepth,
  initRevealEffects,
  initScrollProgress,
  initSignalCanvas,
} from "../src/assets/site-effects.mjs";

function createDom(html = "") {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
}

function installMatchMedia(windowObject, matches = {}) {
  const queries = new Map();
  windowObject.matchMedia = (query) => {
    if (!queries.has(query)) {
      const listeners = new Set();
      queries.set(query, {
        matches: Boolean(matches[query]), media: query,
        addEventListener(type, callback) { if (type === 'change') listeners.add(callback); },
        removeEventListener(type, callback) { if (type === 'change') listeners.delete(callback); },
        set(value) { this.matches = value; listeners.forEach(callback => callback(this)); },
      });
    }
    return queries.get(query);
  };
}

test("reveal effects show content immediately when reduced motion is enabled", () => {
  const dom = createDom('<section data-reveal></section><article data-reveal></article>');
  installMatchMedia(dom.window, { "(prefers-reduced-motion: reduce)": true });

  const result = initRevealEffects({ document: dom.window.document, window: dom.window });

  assert.equal(result.active, false);
  assert.equal(dom.window.document.documentElement.classList.contains("reveal-ready"), false);
  assert.equal(dom.window.document.querySelectorAll("[data-reveal].is-revealed").length, 2);
  dom.window.close();
});

function revealHarness(html) {
  const dom = createDom(html);
  installMatchMedia(dom.window);
  const observers = [];
  const frames = new Map();
  let frameId = 0;
  dom.window.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  dom.window.cancelAnimationFrame = (id) => frames.delete(id);
  dom.window.IntersectionObserver = class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.unobserved = [];
      observers.push(this);
    }
    observe(target) { this.observed.push(target); }
    unobserve(target) { this.unobserved.push(target); }
    disconnect() {}
  };
  return {
    dom,
    observers,
    position(target, top, height = 100, left = 0) {
      target.getBoundingClientRect = () => ({ top, bottom: top + height, left, right: left + 200, width: 200, height });
    },
    emit(targets, isIntersecting) {
      for (const observer of observers) observer.callback(targets.map(target => ({ target, isIntersecting, boundingClientRect: target.getBoundingClientRect() })));
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach(callback => callback(0));
    },
    init() { return initRevealEffects({ document: dom.window.document, window: dom.window }); },
  };
}

test("reveal batches follow visual top-to-bottom order even with reversed observer entries", () => {
  const harness = revealHarness(Array.from({ length: 6 }, (_, i) => `<article data-reveal id="post-${i}"></article>`).join(''));
  const targets = [...harness.dom.window.document.querySelectorAll('[data-reveal]')];
  targets.forEach((target, i) => harness.position(target, i * 100));
  const result = harness.init();
  harness.emit([...targets].reverse(), true);
  const delays = targets.map(target => parseFloat(target.style.getPropertyValue('--reveal-delay')));
  assert(delays.every(Number.isFinite), 'every visible item must have a defined entrance delay');
  assert(delays.every((delay, i) => i === 0 || delay >= delays[i - 1]), `lower items must not overtake upper ones: ${delays}`);
  assert(delays.at(-1) <= 240, 'large batches should not make readers wait');
  result.disconnect();
  harness.dom.window.close();
});

test("reveals rearm after leaving the viewport and replay on return", () => {
  const harness = revealHarness('<article data-reveal></article>');
  const { dom } = harness;
  const target = dom.window.document.querySelector('[data-reveal]');
  harness.position(target, 120);
  const result = harness.init();
  harness.emit([target], true);
  assert.equal(target.classList.contains('is-revealed'), true);
  harness.position(target, -400);
  harness.emit([target], false);
  assert.equal(target.classList.contains('is-revealed'), false, 'offscreen content should be ready to animate again');
  harness.position(target, 80);
  harness.emit([target], true);
  assert.equal(target.classList.contains('is-revealed'), true);
  assert(harness.observers.every(observer => observer.unobserved.length === 0));
  result.disconnect();
  dom.window.close();
});

test("reveal effects keep very tall and partially visible content readable", () => {
  const harness = revealHarness('<main data-reveal></main>');
  const { dom } = harness;
  const target = dom.window.document.querySelector("[data-reveal]");
  harness.position(target, -1500, 5000);
  const result = harness.init();
  harness.emit([target], true);
  assert.equal(result.active, true);
  assert.equal(target.classList.contains("is-revealed"), true);
  harness.emit([target], false);
  assert.equal(target.classList.contains("is-revealed"), true);
  const duplicate = initRevealEffects({ document: dom.window.document, window: dom.window });
  assert.equal(duplicate.active, false);
  result.disconnect();
  dom.window.close();
});

test("keyboard focus reveals an offscreen link immediately", () => {
  const harness = revealHarness('<section data-reveal><a href="#">Read</a></section>');
  const target = harness.dom.window.document.querySelector('[data-reveal]');
  harness.position(target, 2000);
  const result = harness.init();
  harness.dom.window.document.querySelector('a').focus();
  assert.equal(target.classList.contains('is-revealed'), true);
  result.disconnect();
  harness.dom.window.close();
});

test("reveal order follows responsive geometry instead of source order", () => {
  const harness = revealHarness('<article data-reveal id="left"></article><article data-reveal id="bottom"></article><aside data-reveal id="right"></aside>');
  const targets = [...harness.dom.window.document.querySelectorAll('[data-reveal]')];
  harness.position(targets[0], 100, 100, 0);
  harness.position(targets[1], 300, 100, 0);
  harness.position(targets[2], 100, 100, 300);
  const result = harness.init();
  harness.emit(targets, true);
  const delay = target => parseFloat(target.style.getPropertyValue('--reveal-delay'));
  assert(delay(targets[0]) < delay(targets[2]));
  assert(delay(targets[2]) < delay(targets[1]));
  result.disconnect();
  harness.dom.window.close();
});

test("reveal hysteresis prevents edge flicker and follows live motion preferences", () => {
  const harness = revealHarness('<article data-reveal></article>');
  const target = harness.dom.window.document.querySelector('[data-reveal]');
  harness.position(target, 150);
  const result = harness.init();
  harness.emit([target], true);
  harness.position(target, -130);
  harness.emit([target], false);
  assert(target.classList.contains('is-revealed'), 'keep revealed while inside the offscreen buffer');
  const preference = harness.dom.window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.set(true);
  assert.equal(result.active, false);
  assert.equal(harness.dom.window.document.documentElement.classList.contains('reveal-ready'), false);
  preference.set(false);
  assert.equal(result.active, true);
  result.disconnect();
  harness.dom.window.close();
});

test("article blocks reveal separately without hiding a whole long article", () => {
  const harness = revealHarness('<div data-reveal-content><h2>Heading</h2><p>Text</p><pre><code>code</code></pre></div>');
  const result = harness.init();
  const container = harness.dom.window.document.querySelector('[data-reveal-content]');
  assert.equal(container.hasAttribute('data-reveal'), false);
  assert.equal(container.querySelectorAll(':scope > [data-reveal]').length, 3);
  result.disconnect();
  harness.dom.window.close();
});

test("pointer effects reset immediately when reduced motion is enabled", () => {
  const dom = createDom('<a data-pointer-depth></a>');
  installMatchMedia(dom.window, { '(pointer: fine)': true });
  const target = dom.window.document.querySelector('a');
  target.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
  const frames = new Map();
  dom.window.requestAnimationFrame = callback => { frames.set(1, callback); return 1; };
  dom.window.cancelAnimationFrame = id => frames.delete(id);
  const result = initPointerDepth({ document: dom.window.document, window: dom.window });
  target.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 190, clientY: 15 }));
  frames.get(1)();
  assert.equal(target.dataset.pointerActive, 'true');
  assert.notEqual(target.style.getPropertyValue('--depth-x'), '0.000deg');
  dom.window.matchMedia('(prefers-reduced-motion: reduce)').set(true);
  assert.equal(result.active, false);
  assert.equal(target.dataset.pointerActive, undefined);
  assert.equal(target.style.getPropertyValue('--depth-x'), '0.000deg');
  result.disconnect();
  dom.window.close();
});

test("scroll progress is frame-limited and uses the scrollable distance", () => {
  const dom = createDom('<div data-scroll-progress></div>');
  const root = dom.window.document.documentElement;
  const callbacks = [];

  Object.defineProperty(root, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(root, "clientHeight", { configurable: true, value: 400 });
  Object.defineProperty(dom.window, "scrollY", { configurable: true, value: 300 });
  dom.window.requestAnimationFrame = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };
  dom.window.cancelAnimationFrame = () => {};

  const result = initScrollProgress({ document: dom.window.document, window: dom.window });
  assert.equal(result.active, true);
  assert.equal(callbacks.length, 1);
  callbacks.shift()(0);

  const progress = dom.window.document.querySelector("[data-scroll-progress]");
  assert.equal(progress.style.getPropertyValue("--scroll-progress"), "0.5000");
  result.disconnect();
  dom.window.close();
});

test("signal canvas renders one static frame for reduced motion and caps DPR", () => {
  const dom = createDom(`
    <section data-signal-scene>
      <canvas data-signal-canvas></canvas>
    </section>
  `);
  installMatchMedia(dom.window, { "(prefers-reduced-motion: reduce)": true });
  Object.defineProperty(dom.window, "devicePixelRatio", { configurable: true, value: 3 });

  const host = dom.window.document.querySelector("[data-signal-scene]");
  const canvas = dom.window.document.querySelector("canvas");
  host.getBoundingClientRect = () => ({
    bottom: 300,
    height: 300,
    left: 0,
    right: 600,
    top: 0,
    width: 600,
    x: 0,
    y: 0,
  });

  let drawCalls = 0;
  canvas.getContext = () => ({
    beginPath() {},
    clearRect() { drawCalls += 1; },
    fillRect() {},
    fillText() {},
    lineTo() {},
    moveTo() {},
    restore() {},
    save() {},
    setTransform() {},
    stroke() {},
    translate() {},
  });
  let animationFrames = 0;
  dom.window.requestAnimationFrame = () => {
    animationFrames += 1;
    return animationFrames;
  };
  dom.window.cancelAnimationFrame = () => {};

  const result = initSignalCanvas({ document: dom.window.document, window: dom.window });

  assert.equal(result.active, false);
  assert.equal(animationFrames, 0);
  assert.ok(drawCalls >= 1);
  assert.equal(canvas.width, 900);
  assert.equal(canvas.height, 450);
  assert.equal(canvas.dataset.signalEffects, "ready");
  result.disconnect();
  dom.window.close();
});

test("signal canvas caps redraws and stops when offscreen, hidden, or reduced", () => {
  const dom = createDom('<section data-signal-scene><canvas data-signal-canvas></canvas></section>');
  installMatchMedia(dom.window);
  const host = dom.window.document.querySelector('section');
  const canvas = dom.window.document.querySelector('canvas');
  host.getBoundingClientRect = () => ({ width: 600, height: 300 });
  let draws = 0;
  canvas.getContext = () => ({
    beginPath() {}, clearRect() { draws++; }, fillRect() {},
    lineTo() {}, moveTo() {}, restore() {}, save() {},
    setTransform() {}, stroke() {}, translate() {},
  });
  const frames = new Map();
  let sequence = 0;
  dom.window.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
  dom.window.cancelAnimationFrame = id => frames.delete(id);
  let observer;
  dom.window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  };
  const tick = time => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(time));
  };
  const result = initSignalCanvas({ document: dom.window.document, window: dom.window });
  const initialDraws = draws;
  tick(1);
  tick(10);
  tick(41);
  assert.equal(draws - initialDraws, 2);
  observer.callback([{ isIntersecting: false }]);
  assert.equal(frames.size, 0);
  assert.equal(host.dataset.sceneActive, 'false');
  observer.callback([{ isIntersecting: true }]);
  assert.equal(frames.size, 1);
  Object.defineProperty(dom.window.document, 'hidden', { configurable: true, value: true });
  dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(frames.size, 0);
  Object.defineProperty(dom.window.document, 'hidden', { configurable: true, value: false });
  dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(frames.size, 1);
  dom.window.matchMedia('(prefers-reduced-motion: reduce)').set(true);
  assert.equal(frames.size, 0);
  assert.equal(result.active, false);
  result.disconnect();
  dom.window.close();
});
