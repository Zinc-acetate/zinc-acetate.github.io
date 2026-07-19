const markdownIt = require("markdown-it");
const markdownItKatex = require("@vscode/markdown-it-katex").default;
const katex = require("katex");
const DOMPurify = require("isomorphic-dompurify");
const highlight = require("highlight.js/lib/core");

const highlightLanguages = {
  bash: require("highlight.js/lib/languages/bash"),
  c: require("highlight.js/lib/languages/c"),
  cpp: require("highlight.js/lib/languages/cpp"),
  csharp: require("highlight.js/lib/languages/csharp"),
  css: require("highlight.js/lib/languages/css"),
  diff: require("highlight.js/lib/languages/diff"),
  go: require("highlight.js/lib/languages/go"),
  java: require("highlight.js/lib/languages/java"),
  javascript: require("highlight.js/lib/languages/javascript"),
  json: require("highlight.js/lib/languages/json"),
  kotlin: require("highlight.js/lib/languages/kotlin"),
  markdown: require("highlight.js/lib/languages/markdown"),
  plaintext: require("highlight.js/lib/languages/plaintext"),
  python: require("highlight.js/lib/languages/python"),
  rust: require("highlight.js/lib/languages/rust"),
  sql: require("highlight.js/lib/languages/sql"),
  typescript: require("highlight.js/lib/languages/typescript"),
  xml: require("highlight.js/lib/languages/xml"),
  yaml: require("highlight.js/lib/languages/yaml"),
};

for (const [name, language] of Object.entries(highlightLanguages)) {
  highlight.registerLanguage(name, language);
}

function compareBlogPosts(left, right) {
  const leftPinned = left.data.pinned === true;
  const rightPinned = right.data.pinned === true;
  if (leftPinned !== rightPinned) return rightPinned ? 1 : -1;

  if (leftPinned && rightPinned) {
    const leftOrder = Number.isFinite(Number(left.data.pinOrder)) ? Number(left.data.pinOrder) : 999;
    const rightOrder = Number.isFinite(Number(right.data.pinOrder)) ? Number(right.data.pinOrder) : 999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }

  return right.date - left.date;
}

module.exports = async function (eleventyConfig) {
  const {
    createMarkdownRenderer,
    sanitizeRenderedHtml,
  } = await import("./shared/markdown.mjs");

  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy({
    "node_modules/katex/dist/katex.min.css": "assets/katex.min.css",
    "node_modules/katex/dist/fonts": "assets/fonts",
    "shared/article-content.css": "assets/article-content.css",
    "shared/content-enhancements.mjs": "assets/content-enhancements.mjs",
  });
  eleventyConfig.addWatchTarget("shared");

  const markdownLibrary = createMarkdownRenderer({
    MarkdownIt: markdownIt,
    highlight,
    katex,
    katexPlugin: markdownItKatex,
    sanitize: (html) => sanitizeRenderedHtml(DOMPurify, html),
  });
  eleventyConfig.setLibrary("md", markdownLibrary);

  eleventyConfig.addFilter("readableDate", (date) =>
    new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Shanghai",
    }).format(new Date(date)),
  );

  eleventyConfig.addFilter("htmlDate", (date) =>
    new Date(date).toISOString().slice(0, 10),
  );

  eleventyConfig.addFilter("projectDate", (date) =>
    new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      timeZone: "Asia/Shanghai",
    }).format(new Date(date)),
  );

  eleventyConfig.addFilter("json", (value) => JSON.stringify(value));

  eleventyConfig.addFilter("xmlEscape", (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;"),
  );

  eleventyConfig.addFilter("head", (items, count) => items.slice(0, count));

  eleventyConfig.addCollection("blogPosts", (collectionApi) =>
    collectionApi.getFilteredByTag("posts").sort(compareBlogPosts),
  );

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
  };
};

module.exports.compareBlogPosts = compareBlogPosts;
