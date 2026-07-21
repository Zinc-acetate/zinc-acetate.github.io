import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import {
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
  windowObject.matchMedia = (query) => ({
    matches: Boolean(matches[query]),
    media: query,
  });
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

test("reveal effects observe once and support very tall content", () => {
  const dom = createDom('<main data-reveal></main>');
  installMatchMedia(dom.window);
  let observerInstance;

  class MockIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.unobserved = [];
      observerInstance = this;
    }

    observe(target) {
      this.observed.push(target);
    }

    unobserve(target) {
      this.unobserved.push(target);
    }

    disconnect() {}
  }

  dom.window.IntersectionObserver = MockIntersectionObserver;
  const result = initRevealEffects({ document: dom.window.document, window: dom.window });
  const target = dom.window.document.querySelector("[data-reveal]");

  assert.equal(result.active, true);
  assert.equal(observerInstance.options.threshold, 0.01);
  assert.deepEqual(observerInstance.observed, [target]);
  observerInstance.callback([{ isIntersecting: true, target }]);
  assert.equal(target.classList.contains("is-revealed"), true);
  assert.deepEqual(observerInstance.unobserved, [target]);

  const duplicate = initRevealEffects({ document: dom.window.document, window: dom.window });
  assert.equal(duplicate.active, false);
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
