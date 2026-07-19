import {
  enhanceCodeBlocks,
  renderMermaidBlocks,
} from "/assets/content-enhancements.mjs";

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

function updateThemeButton() {
  const isDark = root.dataset.theme === "dark";
  themeToggle.setAttribute("aria-label", isDark ? "切换到浅色主题" : "切换到深色主题");
  themeToggle.innerHTML = `<i data-lucide="${isDark ? "moon" : "sun"}" aria-hidden="true"></i>`;
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#121411" : "#f3f3ef";
  renderIcons();
}

function closeNavigation() {
  nav.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "打开导航");
  navToggle.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';
  renderIcons();
}

themeToggle.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = nextTheme;
  localStorage.setItem("theme", nextTheme);
  updateThemeButton();
  void renderArticleMermaid();
});

navToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
  navToggle.innerHTML = `<i data-lucide="${isOpen ? "x" : "menu"}" aria-hidden="true"></i>`;
  renderIcons();
});

nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNavigation));

window.addEventListener("resize", () => {
  if (window.innerWidth > 760 && nav.classList.contains("is-open")) {
    closeNavigation();
  }
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
  if (event.target === searchDialog) searchDialog.close();
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
if (renderedContent) {
  enhanceCodeBlocks(renderedContent);
  void renderArticleMermaid();
}
