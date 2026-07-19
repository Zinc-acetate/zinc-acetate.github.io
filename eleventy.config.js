const markdownIt = require("markdown-it");
const markdownItKatex = require("@vscode/markdown-it-katex").default;

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

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy({
    "node_modules/katex/dist/katex.min.css": "assets/katex.min.css",
    "node_modules/katex/dist/fonts": "assets/fonts",
  });

  const markdownLibrary = markdownIt({
    breaks: false,
    html: false,
    linkify: true,
    typographer: false,
  }).use(markdownItKatex, {
    errorColor: "#ed604d",
    throwOnError: false,
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
