import MarkdownIt from "markdown-it";
import markdownItKatexModule from "@vscode/markdown-it-katex";
import katex from "katex";
import highlight from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

import { createMarkdownRenderer } from "../../shared/markdown.mjs";

const markdownItKatex =
  typeof markdownItKatexModule === "function"
    ? markdownItKatexModule
    : markdownItKatexModule.default;

const languages = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  kotlin,
  markdown: markdownLanguage,
  plaintext,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

for (const [name, language] of Object.entries(languages)) {
  highlight.registerLanguage(name, language);
}

const markdown = createMarkdownRenderer({
  MarkdownIt,
  highlight,
  katex,
  katexPlugin: markdownItKatex,
});

export function renderMarkdown(content) {
  return markdown.render(content);
}
