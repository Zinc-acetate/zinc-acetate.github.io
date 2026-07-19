import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import {
  enhanceCodeBlocks,
  renderMermaidBlocks,
} from "../../shared/content-enhancements.mjs";
import { sanitizeRenderedHtml } from "../../shared/markdown.mjs";
import { renderMarkdown } from "./markdown.js";
import "./styles.css";
import "../../shared/article-content.css";

const authView = document.querySelector("#auth-view");
const editorView = document.querySelector("#editor-view");
const accountActions = document.querySelector("#account-actions");
const accountAvatar = document.querySelector("#account-avatar");
const accountName = document.querySelector("#account-name");
const logoutButton = document.querySelector("#logout-button");
const form = document.querySelector("#post-form");
const titleInput = document.querySelector("#post-title");
const slugInput = document.querySelector("#post-slug");
const descriptionInput = document.querySelector("#post-description");
const categoryInput = document.querySelector("#post-category");
const readingInput = document.querySelector("#post-reading");
const dateInput = document.querySelector("#post-date");
const tagsInput = document.querySelector("#post-tags");
const pinnedInput = document.querySelector("#post-pinned");
const pinOrderInput = document.querySelector("#post-pin-order");
const contentInput = document.querySelector("#post-content");
const editorGrid = document.querySelector("#editor-grid");
const documentState = document.querySelector("#document-state");
const publishStatus = document.querySelector("#publish-status");
const publishButton = document.querySelector("#publish-button");
const confirmDialog = document.querySelector("#confirm-dialog");
const confirmSummary = document.querySelector("#confirm-summary");
const confirmPublish = document.querySelector("#confirm-publish");
const previewTitle = document.querySelector("#preview-title");
const previewDescription = document.querySelector("#preview-description");
const previewCategory = document.querySelector("#preview-category");
const previewDate = document.querySelector("#preview-date");
const previewReading = document.querySelector("#preview-reading");
const previewContent = document.querySelector("#preview-content");

let csrfToken = "";
let slugWasEdited = false;
let readingWasEdited = false;
let dirty = false;
let publishing = false;
let previewMermaidTimer = 0;
let previewRenderVersion = 0;
let mermaidModulePromise;

function localDateTimeValue(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function generatedSlug() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
  return `post-${stamp}`;
}

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || generatedSlug();
}

function estimateReadingMinutes(content) {
  const latinWords = (content.match(/[A-Za-z0-9_]+/g) || []).length;
  const cjkCharacters = (content.match(/[\u3400-\u9fff]/g) || []).length;
  return Math.max(1, Math.ceil(latinWords / 220 + cjkCharacters / 500));
}

function sanitizedMarkdown(content) {
  return sanitizeRenderedHtml(DOMPurify, renderMarkdown(content));
}

function loadMermaid() {
  mermaidModulePromise ||= import("mermaid").then((module) => module.default);
  return mermaidModulePromise;
}

function schedulePreviewEnhancements() {
  const version = ++previewRenderVersion;
  window.clearTimeout(previewMermaidTimer);
  enhanceCodeBlocks(previewContent);
  previewMermaidTimer = window.setTimeout(async () => {
    if (version !== previewRenderVersion) return;
    await renderMermaidBlocks(previewContent, {
      loadMermaid,
      theme: "neutral",
    });
  }, 280);
}

function updatePreview() {
  previewTitle.textContent = titleInput.value.trim() || "未命名文章";
  previewDescription.textContent = descriptionInput.value.trim();
  previewCategory.textContent = categoryInput.value.trim() || "未分类";
  previewReading.textContent = `${readingInput.value || 1} min`;

  const publishedAt = new Date(dateInput.value);
  previewDate.textContent = Number.isNaN(publishedAt.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(publishedAt);

  const content = contentInput.value.trim();
  previewContent.innerHTML = content ? sanitizedMarkdown(content) : "<p>Markdown 预览会显示在这里。</p>";
  schedulePreviewEnhancements();
}

function markDirty() {
  dirty = true;
  documentState.textContent = "未发布";
}

function postPayload() {
  return {
    category: categoryInput.value,
    content: contentInput.value,
    description: descriptionInput.value,
    pinOrder: pinnedInput.checked ? Number(pinOrderInput.value) : null,
    pinned: pinnedInput.checked,
    publishedAt: new Date(dateInput.value).toISOString(),
    readingMinutes: Number(readingInput.value),
    slug: slugInput.value,
    tags: tagsInput.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    title: titleInput.value,
  };
}

function addSummaryRow(label, value) {
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  confirmSummary.append(term, description);
}

function openConfirmation() {
  confirmSummary.replaceChildren();
  addSummaryRow("标题", titleInput.value.trim());
  addSummaryRow("文件", `${dateInput.value.slice(0, 10)}-${slugInput.value.trim()}.md`);
  addSummaryRow("分类", categoryInput.value.trim());
  addSummaryRow("排序", pinnedInput.checked ? `置顶 / ${pinOrderInput.value}` : "按发布时间");
  confirmDialog.showModal();
}

async function loadSession() {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    const session = await response.json();
    if (!session.authenticated) {
      authView.hidden = false;
      editorView.hidden = true;
      accountActions.hidden = true;
      accountAvatar.removeAttribute("src");
      return;
    }

    csrfToken = session.csrfToken;
    accountAvatar.src = session.user.avatarUrl;
    accountName.textContent = `@${session.user.login}`;
    authView.hidden = true;
    editorView.hidden = false;
    accountActions.hidden = false;
  } catch {
    authView.querySelector("p:last-of-type").textContent = "登录状态检查失败，请刷新页面。";
  }
}

function showDevelopmentEditor() {
  csrfToken = "development-only";
  accountAvatar.src = "https://avatars.githubusercontent.com/u/130532874?v=4";
  accountName.textContent = "@Zinc-acetate";
  authView.hidden = true;
  editorView.hidden = false;
  accountActions.hidden = false;
}

async function publishPost() {
  if (publishing) return;
  publishing = true;
  publishButton.disabled = true;
  confirmPublish.disabled = true;
  publishStatus.textContent = "正在提交到 GitHub...";

  try {
    const response = await fetch("/api/posts", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(postPayload()),
    });
    const result = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        await loadSession();
        throw new Error("登录已过期，请重新登录。");
      }
      throw new Error(result.error || "发布失败，请稍后重试。");
    }

    dirty = false;
    documentState.textContent = "已提交";
    publishStatus.replaceChildren();
    const message = document.createTextNode("文章已提交，");
    const commitLink = document.createElement("a");
    commitLink.href = result.commitUrl;
    commitLink.target = "_blank";
    commitLink.rel = "noreferrer";
    commitLink.textContent = "查看提交";
    publishStatus.append(message, commitLink);
  } catch (error) {
    publishStatus.textContent = error.message;
  } finally {
    publishing = false;
    publishButton.disabled = false;
    confirmPublish.disabled = false;
  }
}

dateInput.value = localDateTimeValue();
slugInput.value = generatedSlug();
updatePreview();

titleInput.addEventListener("input", () => {
  if (!slugWasEdited) slugInput.value = slugify(titleInput.value);
});

slugInput.addEventListener("input", () => {
  slugWasEdited = true;
  slugInput.value = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");
});

readingInput.addEventListener("input", () => {
  readingWasEdited = true;
});

contentInput.addEventListener("input", () => {
  if (!readingWasEdited) readingInput.value = String(estimateReadingMinutes(contentInput.value));
});

pinnedInput.addEventListener("change", () => {
  pinOrderInput.disabled = !pinnedInput.checked;
});

form.addEventListener("input", () => {
  markDirty();
  updatePreview();
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    editorGrid.dataset.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!contentInput.value.trim()) {
    contentInput.setCustomValidity("请输入正文。");
    contentInput.reportValidity();
    contentInput.setCustomValidity("");
    return;
  }
  openConfirmation();
});

confirmPublish.addEventListener("click", (event) => {
  event.preventDefault();
  confirmDialog.close();
  publishPost();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-CSRF-Token": csrfToken },
  });
  csrfToken = "";
  await loadSession();
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty || publishing) return;
  event.preventDefault();
  event.returnValue = "";
});

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "editor") {
  showDevelopmentEditor();
} else {
  loadSession();
}
