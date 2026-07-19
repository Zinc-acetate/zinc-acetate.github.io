let diagramSequence = 0;

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Clipboard is unavailable");
}

export function enhanceCodeBlocks(root) {
  root.querySelectorAll(".code-block[data-code-block]").forEach((block) => {
    const toolbar = block.querySelector(":scope > .code-toolbar");
    const code = block.querySelector(":scope > pre > code");
    if (!toolbar || !code || toolbar.querySelector("[data-copy-code]")) return;

    const button = document.createElement("button");
    button.className = "code-copy";
    button.type = "button";
    button.dataset.copyCode = "";
    button.textContent = "复制";
    button.title = "复制代码";
    button.setAttribute("aria-label", "复制代码");
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await writeClipboard(code.textContent || "");
        button.textContent = "已复制";
        button.dataset.state = "copied";
      } catch {
        button.textContent = "复制失败";
        button.dataset.state = "error";
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = "复制";
          delete button.dataset.state;
        }, 1600);
      }
    });
    toolbar.append(button);
  });
}

export function validateMermaidSource(source) {
  if (!source || source.length > 20_000) {
    throw new Error("Mermaid source length is invalid");
  }
  if (/^\s*---(?:\r?\n|$)/.test(source)) {
    throw new Error("Mermaid front matter is disabled");
  }
}

export async function renderMermaidBlocks(root, { loadMermaid, theme = "neutral" }) {
  const blocks = [...root.querySelectorAll(".mermaid-block[data-mermaid-block]")];
  if (!blocks.length) return;

  let mermaid;
  try {
    mermaid = await loadMermaid();
    mermaid.initialize({
      flowchart: { htmlLabels: false },
      maxTextSize: 20_000,
      secure: [
        "maxTextSize",
        "securityLevel",
        "startOnLoad",
        "suppressErrorRendering",
      ],
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
      theme,
    });
  } catch {
    blocks.forEach((block) => block.classList.add("is-error"));
    return;
  }

  for (const block of blocks) {
    const sourceNode = block.querySelector("[data-mermaid-source]");
    const canvas = block.querySelector("[data-mermaid-canvas]");
    if (!sourceNode || !canvas) continue;

    const requestId = String(++diagramSequence);
    block.dataset.mermaidRequest = requestId;
    block.classList.remove("is-error", "is-rendered");
    canvas.replaceChildren();

    try {
      const source = sourceNode.textContent.trim();
      validateMermaidSource(source);
      const result = await mermaid.render(`zinc-mermaid-${requestId}`, source);
      if (!block.isConnected || block.dataset.mermaidRequest !== requestId) continue;
      canvas.innerHTML = result.svg;
      result.bindFunctions?.(canvas);
      block.classList.add("is-rendered");
    } catch {
      if (!block.isConnected || block.dataset.mermaidRequest !== requestId) continue;
      const message = document.createElement("p");
      message.className = "mermaid-error";
      message.textContent = "Mermaid 图表渲染失败";
      canvas.replaceChildren(message);
      block.classList.add("is-error");
    }
  }
}

export async function enhanceRenderedContent(root, options) {
  enhanceCodeBlocks(root);
  await renderMermaidBlocks(root, options);
}
