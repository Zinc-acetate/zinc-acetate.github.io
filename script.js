const root = document.documentElement;
const themeToggle = document.querySelector("#theme-toggle");
const navToggle = document.querySelector("#nav-toggle");
const nav = document.querySelector("#site-nav");

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function updateThemeButton() {
  const isDark = root.dataset.theme === "dark";
  themeToggle.setAttribute("aria-label", isDark ? "切换到浅色主题" : "切换到深色主题");
  themeToggle.innerHTML = `<i data-lucide="${isDark ? "moon" : "sun"}" aria-hidden="true"></i>`;
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#121514" : "#f4f5f2";
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
});

navToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
  navToggle.innerHTML = `<i data-lucide="${isOpen ? "x" : "menu"}" aria-hidden="true"></i>`;
  renderIcons();
});

nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeNavigation);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 720 && nav.classList.contains("is-open")) {
    closeNavigation();
  }
});

document.querySelector("#current-year").textContent = new Date().getFullYear();
updateThemeButton();
renderIcons();
