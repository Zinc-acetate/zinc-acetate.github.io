module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");

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
    collectionApi.getFilteredByTag("posts").reverse(),
  );

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
