import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdown } from "../src/markdown.js";

test("renders TeX control sequences with the explicit KaTeX ESM renderer", () => {
  const html = renderMarkdown(String.raw`$\sum_{i=1}^{n} i \le n^2$`);

  assert.match(html, /class="katex"/);
  assert.match(html, /∑/);
  assert.match(html, /≤/);
  assert.doesNotMatch(html, /mathcolor="#ed604d"/);
});

test("keeps raw HTML disabled", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)">');

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
