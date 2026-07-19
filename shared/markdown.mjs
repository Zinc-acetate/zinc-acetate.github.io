const LANGUAGE_ALIASES = new Map([
  ["c++", "cpp"],
  ["cc", "cpp"],
  ["cxx", "cpp"],
  ["cs", "csharp"],
  ["c#", "csharp"],
  ["html", "xml"],
  ["js", "javascript"],
  ["jsx", "javascript"],
  ["kt", "kotlin"],
  ["md", "markdown"],
  ["py", "python"],
  ["rs", "rust"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["text", "plaintext"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["txt", "plaintext"],
  ["yml", "yaml"],
]);

const LANGUAGE_LABELS = new Map([
  ["bash", "BASH"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["css", "CSS"],
  ["diff", "DIFF"],
  ["go", "GO"],
  ["java", "JAVA"],
  ["javascript", "JAVASCRIPT"],
  ["json", "JSON"],
  ["kotlin", "KOTLIN"],
  ["markdown", "MARKDOWN"],
  ["plaintext", "TEXT"],
  ["python", "PYTHON"],
  ["rust", "RUST"],
  ["sql", "SQL"],
  ["typescript", "TYPESCRIPT"],
  ["xml", "HTML / XML"],
  ["yaml", "YAML"],
]);

const SAFE_STYLE_PROPERTIES = new Set([
  "border-bottom-width",
  "color",
  "font-size",
  "height",
  "margin-left",
  "margin-right",
  "max-width",
  "min-width",
  "text-align",
  "top",
  "vertical-align",
  "width",
]);

const KATEX_STYLE_PROPERTIES = new Set([
  ...SAFE_STYLE_PROPERTIES,
  "background-color",
  "border-color",
  "border-right-style",
  "border-right-width",
  "border-style",
  "border-top-width",
  "border-width",
  "bottom",
  "left",
  "margin",
  "margin-top",
  "padding-left",
  "position",
  "text-shadow",
]);

const KATEX_SVG_TAGS = new Set(["line", "path", "svg"]);
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const configuredSanitizers = new WeakSet();

export const SANITIZE_CONFIG = {
  ADD_ATTR: ["encoding", "target"],
  ADD_TAGS: ["annotation", "semantics"],
  FORBID_ATTR: ["formaction", "srcdoc"],
  FORBID_TAGS: [
    "base",
    "button",
    "embed",
    "form",
    "iframe",
    "input",
    "link",
    "meta",
    "object",
    "option",
    "script",
    "select",
    "style",
    "template",
    "textarea",
  ],
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true,
  USE_PROFILES: { html: true, mathMl: true, svg: true },
};

function isInsideKatex(node) {
  let current = node;
  while (current?.nodeType === 1) {
    if (current.classList?.contains("katex")) return true;
    current = current.parentElement;
  }
  return false;
}

function enforceSafeLinkTarget(node) {
  if (!node.hasAttribute?.("target")) return;
  if (node.tagName?.toLowerCase() !== "a" || node.getAttribute("target") !== "_blank") {
    node.removeAttribute("target");
    return;
  }

  const rel = new Set((node.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
  rel.add("noreferrer");
  rel.add("noopener");
  node.setAttribute("rel", [...rel].join(" "));
}

function rewriteSanitizedFragmentLinks(fragment) {
  const prefixedNames = new Set();
  fragment.querySelectorAll?.("[id], [name]").forEach((node) => {
    for (const attribute of ["id", "name"]) {
      const value = node.getAttribute(attribute);
      if (value?.startsWith("user-content-")) prefixedNames.add(value);
    }
  });

  fragment.querySelectorAll?.('a[href^="#"]').forEach((link) => {
    const encodedFragmentName = link.getAttribute("href").slice(1);
    let fragmentName;
    try {
      fragmentName = decodeURIComponent(encodedFragmentName);
    } catch {
      return;
    }

    const sanitizedName = fragmentName.startsWith("user-content-")
      ? fragmentName
      : `user-content-${fragmentName}`;
    if (prefixedNames.has(sanitizedName)) {
      link.setAttribute("href", `#${sanitizedName}`);
    }
  });
}

function normalizeLanguage(info = "") {
  const raw = info.trim().split(/\s+/, 1)[0].toLowerCase();
  return LANGUAGE_ALIASES.get(raw) || raw || "plaintext";
}

function languageLabel(language) {
  return LANGUAGE_LABELS.get(language) || language.toUpperCase().slice(0, 24);
}

function safeLanguageClass(language) {
  return language.replace(/[^a-z0-9_-]/g, "-") || "plaintext";
}

function renderMermaidFence(markdown, content) {
  const escaped = markdown.utils.escapeHtml(content.trim());
  return [
    '<figure class="mermaid-block" data-mermaid-block>',
    '  <figcaption class="mermaid-toolbar">MERMAID</figcaption>',
    '  <div class="mermaid-canvas" data-mermaid-canvas></div>',
    `  <pre class="mermaid-source" data-mermaid-source><code>${escaped}</code></pre>`,
    "</figure>",
    "",
  ].join("\n");
}

function renderCodeFence(markdown, highlight, token) {
  const language = normalizeLanguage(token.info);
  const className = safeLanguageClass(language);
  let code = markdown.utils.escapeHtml(token.content);

  if (language !== "plaintext" && highlight.getLanguage(language)) {
    try {
      code = highlight.highlight(token.content, {
        ignoreIllegals: true,
        language,
      }).value;
    } catch {
      code = markdown.utils.escapeHtml(token.content);
    }
  }

  return [
    `<div class="code-block" data-code-block data-language="${className}">`,
    `  <div class="code-toolbar"><span class="code-language">${markdown.utils.escapeHtml(languageLabel(language))}</span></div>`,
    `  <pre><code class="hljs language-${className}">${code}</code></pre>`,
    "</div>",
    "",
  ].join("\n");
}

export function createMarkdownRenderer({
  MarkdownIt,
  highlight,
  katex,
  katexPlugin,
  sanitize = (html) => html,
}) {
  const markdown = new MarkdownIt({
    breaks: false,
    html: true,
    linkify: true,
    typographer: false,
  }).use(katexPlugin, {
    errorColor: "#ed604d",
    katex,
    maxExpand: 1000,
    maxSize: 100,
    throwOnError: false,
    trust: false,
  });

  markdown.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const language = normalizeLanguage(token.info);
    return language === "mermaid"
      ? renderMermaidFence(markdown, token.content)
      : renderCodeFence(markdown, highlight, token);
  };

  markdown.renderer.rules.table_open = () =>
    '<div class="table-scroll" role="region" aria-label="数据表格" tabindex="0">\n<table>\n';
  markdown.renderer.rules.table_close = () => "</table>\n</div>\n";

  const defaultLinkOpen =
    markdown.renderer.rules.link_open ||
    ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));

  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet("href") || "";
    if (/^https?:\/\//i.test(href)) {
      tokens[index].attrSet("target", "_blank");
      tokens[index].attrSet("rel", "noreferrer noopener");
    }
    return defaultLinkOpen(tokens, index, options, env, self);
  };

  const render = markdown.render.bind(markdown);
  markdown.render = (source, env) => sanitize(render(source, env));
  return markdown;
}

export function configureSanitizer(purifier) {
  if (configuredSanitizers.has(purifier)) return purifier;

  purifier.addHook("uponSanitizeElement", (node) => {
    if (node.namespaceURI !== SVG_NAMESPACE) return;
    if (!isInsideKatex(node) || !KATEX_SVG_TAGS.has(node.localName)) node.remove();
  });

  purifier.addHook("afterSanitizeAttributes", (node) => {
    enforceSafeLinkTarget(node);
    if (!node.hasAttribute?.("style")) return;
    const style = node.style;
    if (!style || typeof style.length !== "number") {
      node.removeAttribute("style");
      return;
    }

    const properties = [];
    for (let index = 0; index < style.length; index += 1) {
      properties.push(style.item(index));
    }
    const allowedProperties = isInsideKatex(node)
      ? KATEX_STYLE_PROPERTIES
      : SAFE_STYLE_PROPERTIES;
    for (const property of properties) {
      const normalizedProperty = property.toLowerCase();
      const normalizedValue = style.getPropertyValue(property).trim().toLowerCase();
      const invalidTextAlign =
        normalizedProperty === "text-align" &&
        !["center", "left", "right"].includes(normalizedValue);
      const invalidPosition =
        normalizedProperty === "position" && normalizedValue !== "relative";
      if (!allowedProperties.has(normalizedProperty) || invalidTextAlign || invalidPosition) {
        style.removeProperty(property);
      }
    }
    if (style.length === 0) node.removeAttribute("style");
  });

  configuredSanitizers.add(purifier);
  return purifier;
}

export function sanitizeRenderedHtml(purifier, html) {
  const fragment = configureSanitizer(purifier).sanitize(html, {
    ...SANITIZE_CONFIG,
    RETURN_DOM_FRAGMENT: true,
  });
  rewriteSanitizedFragmentLinks(fragment);

  const container = fragment.ownerDocument.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}
