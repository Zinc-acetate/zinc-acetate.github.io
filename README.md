# Zinc Acetate 的 GitHub Pages

这是部署在 `https://zinc-acetate.github.io/` 的个人主页，使用原生 HTML、CSS 和 JavaScript 编写。

## 本地预览

在仓库目录运行：

```powershell
npx serve .
```

然后打开命令行显示的本地地址。

## 更新网站

1. 修改 `index.html`、`styles.css` 或 `script.js`。
2. 在浏览器中本地检查效果。
3. 提交并推送到 `main` 分支：

```powershell
git add .
git commit -m "描述这次修改"
git push
```

推送后，`.github/workflows/pages.yml` 会自动发布网站。通常 1 到 3 分钟后线上内容就会更新。

## 文件结构

- `index.html`：主页内容与结构
- `styles.css`：页面视觉样式和响应式布局
- `script.js`：主题切换、移动端导航等交互
- `404.html`：自定义未找到页面
- `assets/`：图片等静态资源
- `.github/workflows/pages.yml`：GitHub Pages 自动部署流程
