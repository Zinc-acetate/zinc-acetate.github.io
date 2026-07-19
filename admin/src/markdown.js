import MarkdownIt from "markdown-it";
import markdownItKatexModule from "@vscode/markdown-it-katex";
import katex from "katex";

const markdownItKatex =
  typeof markdownItKatexModule === "function"
    ? markdownItKatexModule
    : markdownItKatexModule.default;

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
}).use(markdownItKatex, {
  errorColor: "#ed604d",
  katex,
  throwOnError: false,
});

const defaultLinkOpen =
  markdown.renderer.rules.link_open ||
  ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noreferrer noopener");
  return defaultLinkOpen(tokens, index, options, env, self);
};

export function renderMarkdown(content) {
  return markdown.render(content);
}
