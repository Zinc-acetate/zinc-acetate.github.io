# Zinc Acetate 的算法竞赛博客

部署地址：<https://zinc-acetate.github.io/>

博客使用 [Eleventy](https://www.11ty.dev/) 生成。文章写成 Markdown，首页、归档、搜索索引、RSS 和站点地图会在构建时自动更新。

## 本地预览

```powershell
npm install
npm run dev
```

打开命令行显示的本地地址。修改文件后，页面会自动重新构建。

## 发布新文章

在 `src/posts/` 新建 Markdown 文件：

```markdown
---
title: 文章标题
description: 一句话摘要
date: 2026-07-19
category: 题解
readingTime: 6 min
tags:
  - posts
  - 题解
---

从这里开始写正文。
```

文件名建议使用 `年-月-日-英文短标题.md`。完成后提交并推送：

```powershell
git add .
git commit -m "Add a new post"
git push
```

GitHub Actions 会自动构建并发布。

## 主要目录

- `src/posts/`：Markdown 文章
- `src/_includes/layouts/`：公共页面模板
- `src/assets/styles.css`：全站样式
- `src/assets/script.js`：导航、搜索、实时数据和项目加载
- `src/index.njk`：首页
- `src/archive.njk`：文章归档
- `src/about.njk`：关于页面
