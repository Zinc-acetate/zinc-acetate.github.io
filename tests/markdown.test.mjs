import assert from "node:assert/strict";
import test from "node:test";

import markdownItKatexModule from "@vscode/markdown-it-katex";
import DOMPurify from "isomorphic-dompurify";
import katex from "katex";
import MarkdownIt from "markdown-it";
import highlight from "highlight.js/lib/core";
import cpp from "highlight.js/lib/languages/cpp";
import plaintext from "highlight.js/lib/languages/plaintext";

import { validateMermaidSource } from "../shared/content-enhancements.mjs";
import {
  createMarkdownRenderer,
  sanitizeRenderedHtml,
} from "../shared/markdown.mjs";

const markdownItKatex =
  typeof markdownItKatexModule === "function"
    ? markdownItKatexModule
    : markdownItKatexModule.default;

highlight.registerLanguage("cpp", cpp);
highlight.registerLanguage("plaintext", plaintext);

const markdown = createMarkdownRenderer({
  MarkdownIt,
  highlight,
  katex,
  katexPlugin: markdownItKatex,
  sanitize: (html) => sanitizeRenderedHtml(DOMPurify, html),
});

test("allows semantic HTML while removing executable markup", () => {
  const html = markdown.render(`
<details open><summary>提示</summary><mark>安全内容</mark></details>

<img src="https://example.com/a.png" onerror="alert(1)">
<a href="javascript:alert(1)">bad link</a>
<div style="position:fixed;color:#fff;height:1em">styled</div>
<script>alert(1)</script><svg onload="alert(1)"></svg>
`);

  assert.match(html, /<details open="">/);
  assert.match(html, /<mark>安全内容<\/mark>/);
  assert.match(html, /https:\/\/example\.com\/a\.png/);
  assert.doesNotMatch(html, /onerror|javascript:|<script|<svg/i);
  assert.doesNotMatch(html, /position\s*:/i);
  assert.match(html, /color:\s*rgb\(255, 255, 255\)|color:\s*#fff/i);
  assert.match(html, /height:\s*1em/i);
});

test("renders KaTeX control sequences without unsafe trust", () => {
  const html = markdown.render(
    String.raw`$\sum_{i=1}^{n} i \le n^2 + \sqrt{x} + \xrightarrow{n} + \cancel{x} + \rule{1em}{2em}$`,
  );

  assert.match(html, /class="katex"/);
  assert.match(html, /∑/);
  assert.match(html, /≤/);
  assert.match(html, /<svg[^>]*>/);
  assert.match(html, /<path[^>]*d=/);
  assert.match(html, /<line[^>]*>/);
  assert.match(html, /border-right-width:\s*1em/i);
  assert.match(html, /border-top-width:\s*2em/i);
  assert.match(html, /<annotation encoding="application\/x-tex">/);
  assert.doesNotMatch(html, /mathcolor="#ed604d"/);
});

test("preserves external link targets and synchronized safe fragment links", () => {
  const external = markdown.render("[外链](https://example.com/)");
  const fragment = markdown.render(
    '[英文锚点](#proof) [中文锚点](#证明)\n\n<h2 id="proof">Proof</h2><h2 id="证明">证明</h2>',
  );

  assert.match(external, /target="_blank"/);
  assert.match(external, /rel="noreferrer noopener"/);
  assert.match(fragment, /href="#user-content-proof"/);
  assert.match(fragment, /id="user-content-proof"/);
  assert.match(fragment, /href="#user-content-证明"/);
  assert.match(fragment, /id="user-content-证明"/);
});

test("keeps Markdown table alignment while rejecting unsafe alignment values", () => {
  const table = markdown.render("| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |");
  const unsafe = markdown.render('<div style="text-align:match-parent;position:fixed">unsafe</div>');

  assert.match(table, /text-align:\s*left/i);
  assert.match(table, /text-align:\s*center/i);
  assert.match(table, /text-align:\s*right/i);
  assert.doesNotMatch(unsafe, /text-align|position/i);
});

test("highlights known code languages and escapes unknown languages", () => {
  const cppHtml = markdown.render("```c++\n#include <bits/stdc++.h>\nint main() { return 0; }\n```");
  const unknownHtml = markdown.render("```made-up\n<script>alert(1)</script>\n```");

  assert.match(cppHtml, /data-language="cpp"/);
  assert.match(cppHtml, /language-cpp/);
  assert.match(cppHtml, /hljs-(?:meta|string|keyword|type)/);
  assert.match(unknownHtml, /data-language="made-up"/);
  assert.match(unknownHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(unknownHtml, /<script>/);
});

test("wraps tables and emits inert Mermaid source", () => {
  const table = markdown.render("| A | B |\n| - | - |\n| 1 | 2 |");
  const diagram = markdown.render("```mermaid\ngraph TD\n  A --> B\n```");

  assert.match(table, /class="table-scroll"/);
  assert.match(table, /<th>A<\/th>/);
  assert.match(diagram, /data-mermaid-block/);
  assert.match(diagram, /graph TD/);
  assert.doesNotMatch(diagram, /<svg/);
});

test("rejects Mermaid YAML front matter and oversized input", () => {
  assert.throws(() => validateMermaidSource("---\nconfig:\n  theme: dark\n---\ngraph TD"));
  assert.throws(() => validateMermaidSource("x".repeat(20_001)));
  assert.doesNotThrow(() => validateMermaidSource("graph TD\n  A --> B"));
});
