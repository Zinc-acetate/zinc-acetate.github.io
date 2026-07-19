import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import {
  enhanceCodeBlocks,
  renderMermaidBlocks,
} from "../shared/content-enhancements.mjs";

function installDom(html) {
  const dom = new JSDOM(html, { url: "https://example.test/" });
  const previous = new Map();

  for (const [name, value] of [
    ["window", dom.window],
    ["document", dom.window.document],
    ["navigator", dom.window.navigator],
  ]) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }

  return {
    dom,
    restore() {
      dom.window.close();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test("adds one working copy button per code block", async () => {
  const fixture = installDom(`
    <main id="content">
      <div class="code-block" data-code-block>
        <div class="code-toolbar"><span>C++</span></div>
        <pre><code>int main() { return 0; }</code></pre>
      </div>
    </main>
  `);

  try {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value) => { copied = value; } },
    });

    const root = document.querySelector("#content");
    enhanceCodeBlocks(root);
    enhanceCodeBlocks(root);

    const buttons = root.querySelectorAll("[data-copy-code]");
    assert.equal(buttons.length, 1);
    buttons[0].click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(copied, "int main() { return 0; }");
    assert.equal(buttons[0].textContent, "已复制");
    assert.equal(buttons[0].dataset.state, "copied");
  } finally {
    fixture.restore();
  }
});

test("renders Mermaid with locked-down settings", async () => {
  const fixture = installDom(`
    <main id="content">
      <figure class="mermaid-block" data-mermaid-block>
        <div class="mermaid-canvas" data-mermaid-canvas></div>
        <pre data-mermaid-source><code>flowchart LR\nA --&gt; B</code></pre>
      </figure>
    </main>
  `);

  try {
    let configuration;
    const mermaid = {
      initialize(value) { configuration = value; },
      async render(id, source) {
        assert.match(id, /^zinc-mermaid-\d+$/);
        assert.equal(source, "flowchart LR\nA --> B");
        return { svg: "<svg><text>diagram</text></svg>" };
      },
    };

    const root = document.querySelector("#content");
    await renderMermaidBlocks(root, {
      loadMermaid: async () => mermaid,
      theme: "neutral",
    });

    assert.equal(configuration.securityLevel, "strict");
    assert.equal(configuration.maxTextSize, 20_000);
    assert.equal(configuration.flowchart.htmlLabels, false);
    assert.ok(configuration.secure.includes("securityLevel"));
    assert.ok(root.querySelector(".mermaid-block").classList.contains("is-rendered"));
    assert.equal(root.querySelector(".mermaid-canvas text").textContent, "diagram");
  } finally {
    fixture.restore();
  }
});

test("keeps Mermaid source visible when rendering fails", async () => {
  const fixture = installDom(`
    <main id="content">
      <figure class="mermaid-block" data-mermaid-block>
        <div class="mermaid-canvas" data-mermaid-canvas></div>
        <pre data-mermaid-source><code>flowchart LR\nA --&gt;</code></pre>
      </figure>
    </main>
  `);

  try {
    const root = document.querySelector("#content");
    await renderMermaidBlocks(root, {
      loadMermaid: async () => ({
        initialize() {},
        async render() { throw new Error("invalid diagram"); },
      }),
    });

    assert.ok(root.querySelector(".mermaid-block").classList.contains("is-error"));
    assert.equal(root.querySelector(".mermaid-error").textContent, "Mermaid 图表渲染失败");
    assert.match(root.querySelector("[data-mermaid-source]").textContent, /flowchart LR/);
  } finally {
    fixture.restore();
  }
});
