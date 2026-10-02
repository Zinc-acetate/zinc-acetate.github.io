import {
  enhanceCodeBlocks,
  renderMermaidBlocks,
} from "/assets/content-enhancements.mjs";
import {
  initMotionVisibility,
  initPointerDepth,
  initRevealEffects,
  initScrollProgress,
  initSignalCanvas,
} from "/assets/site-effects.mjs";

const root = document.documentElement;
const themeToggle = document.querySelector("#theme-toggle");
const navToggle = document.querySelector("#nav-toggle");
const nav = document.querySelector("#site-nav");
const searchToggle = document.querySelector("#search-toggle");
const searchDialog = document.querySelector("#search-dialog");
const searchClose = document.querySelector("#search-close");
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const renderedContent = document.querySelector(".rendered-content");

let mermaidScriptPromise;
initMotionVisibility();
const signalScene = initSignalCanvas();

function loadMermaid() {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  mermaidScriptPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/assets/mermaid.min.js";
    script.async = true;
    script.addEventListener("load", () => resolve(window.mermaid), { once: true });
    script.addEventListener("error", () => reject(new Error("Mermaid failed to load")), { once: true });
    document.head.append(script);
  });
  return mermaidScriptPromise;
}

function renderArticleMermaid() {
  if (!renderedContent) return Promise.resolve();
  return renderMermaidBlocks(renderedContent, {
    loadMermaid,
    theme: root.dataset.theme === "dark" ? "dark" : "neutral",
  });
}

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
document.querySelector("#icon-library")?.addEventListener("load", renderIcons, { once: true });

function updateThemeButton() {
  const isDark = root.dataset.theme === "dark";
  themeToggle.setAttribute("aria-label", isDark ? "切换到浅色主题" : "切换到深色主题");
  themeToggle.innerHTML = `<i data-lucide="${isDark ? "moon" : "sun"}" aria-hidden="true"></i>`;
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#090e0d" : "#eef1ef";
  renderIcons();
  signalScene.refresh();
}

function closeNavigation() {
  nav.classList.remove("is-open");
  nav.inert = window.innerWidth <= 860;
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "打开导航");
  navToggle.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';
  renderIcons();
}

themeToggle.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = nextTheme;
  try { localStorage.setItem("theme", nextTheme); } catch { /* Theme still works without storage. */ }
  updateThemeButton();
  void renderArticleMermaid();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    themeToggle.querySelector("svg, i")?.animate?.(
      [{ opacity: 0.3, transform: "rotate(-30deg) scale(0.8)" }, { opacity: 1, transform: "rotate(0) scale(1)" }],
      { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }
});

navToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  nav.inert = !isOpen;
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
  navToggle.innerHTML = `<i data-lucide="${isOpen ? "x" : "menu"}" aria-hidden="true"></i>`;
  renderIcons();
});

nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNavigation));
nav.inert = window.innerWidth <= 860;
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && nav.classList.contains("is-open")) {
    closeNavigation();
    navToggle.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 860 && nav.classList.contains("is-open")) {
    closeNavigation();
  }
  nav.inert = window.innerWidth <= 860 && !nav.classList.contains("is-open");
});

let searchIndex = [];

function createSearchResult(post) {
  const link = document.createElement("a");
  const title = document.createElement("strong");
  const category = document.createElement("span");
  const description = document.createElement("small");

  link.className = "search-result";
  link.href = post.url;
  title.textContent = post.title;
  category.textContent = post.category;
  description.textContent = post.description;
  link.append(title, category, description);
  return link;
}

function renderSearchResults(query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  searchResults.replaceChildren();

  if (!normalizedQuery) {
    const message = document.createElement("p");
    message.className = "search-empty";
    message.textContent = "输入关键词开始搜索。";
    searchResults.append(message);
    return;
  }

  const matches = searchIndex.filter((post) =>
    [post.title, post.description, post.category]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery),
  );

  if (!matches.length) {
    const message = document.createElement("p");
    message.className = "search-empty";
    message.textContent = "没有找到相关文章。";
    searchResults.append(message);
    return;
  }

  matches.forEach((post) => searchResults.append(createSearchResult(post)));
}

searchToggle.addEventListener("click", async () => {
  searchDialog.showModal();
  searchInput.focus();

  if (!searchIndex.length) {
    try {
      const response = await fetch("/search-index.json");
      if (!response.ok) throw new Error("Search index request failed");
      searchIndex = await response.json();
    } catch {
      searchResults.innerHTML = '<p class="search-empty">搜索暂时不可用。</p>';
    }
  }
});

searchClose.addEventListener("click", () => searchDialog.close());
searchDialog.addEventListener("click", (event) => {
  const bounds = searchDialog.getBoundingClientRect();
  if (event.target === searchDialog &&
    (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) {
    searchDialog.close();
  }
});
searchInput.addEventListener("input", (event) => renderSearchResults(event.target.value));

async function loadCodeforcesProfile() {
  const ratingNodes = document.querySelectorAll("[data-cf-rating]");
  if (!ratingNodes.length) return;

  try {
    const response = await fetch("https://codeforces.com/api/user.info?handles=Zinc-acetate");
    if (!response.ok) throw new Error("Codeforces request failed");
    const payload = await response.json();
    const profile = payload.result?.[0];
    if (!profile) return;

    ratingNodes.forEach((node) => {
      node.textContent = profile.rating;
    });

    const rank = profile.rank
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    document.querySelectorAll("[data-cf-rank]").forEach((node) => {
      node.textContent = rank;
    });
  } catch {
    // The verified build-time value remains visible when the API is unavailable.
  }
}

document.querySelector("#current-year").textContent = new Date().getFullYear();
updateThemeButton();
renderIcons();
loadCodeforcesProfile();
initRevealEffects();
initScrollProgress();
initPointerDepth();
if (renderedContent) {
  enhanceCodeBlocks(renderedContent);
  void renderArticleMermaid();
}
