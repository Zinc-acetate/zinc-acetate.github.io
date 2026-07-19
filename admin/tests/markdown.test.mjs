import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdown } from "../src/markdown.js";

test("renders TeX control sequences with the explicit KaTeX ESM renderer", () => {
  const html = renderMarkdown(String.raw`$\sum_{i=1}^{n} i \le n^2 + \sqrt{x} + \cancel{x}$`);

  assert.match(html, /class="katex"/);
  assert.match(html, /∑/);
  assert.match(html, /≤/);
  assert.match(html, /<svg[^>]*>/);
  assert.match(html, /<path[^>]*d=/);
  assert.match(html, /<line[^>]*>/);
  assert.doesNotMatch(html, /mathcolor="#ed604d"/);
});

test("preserves semantic HTML for the DOMPurify stage", () => {
  const html = renderMarkdown("<details open><summary>提示</summary><mark>内容</mark></details>");

  assert.match(html, /<details open>/);
  assert.match(html, /<summary>提示<\/summary>/);
  assert.match(html, /<mark>内容<\/mark>/);
});

test("renders highlighted code, tables, and inert Mermaid placeholders", () => {
  const code = renderMarkdown("```cpp\nint main() { return 0; }\n```");
  const table = renderMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");
  const diagram = renderMarkdown("```mermaid\ngraph TD\n  A --> B\n```");

  assert.match(code, /class="code-block"/);
  assert.match(code, /language-cpp/);
  assert.match(code, /hljs-(?:keyword|type)/);
  assert.match(table, /class="table-scroll"/);
  assert.match(diagram, /data-mermaid-block/);
  assert.doesNotMatch(diagram, /<svg/);
});
