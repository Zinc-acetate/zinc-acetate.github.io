# Blog Admin

管理后台由 Vite 静态界面和 Cloudflare Worker API 组成。GitHub App 用户令牌只存在于 AES-GCM 加密的 `HttpOnly` 会话 Cookie 中，不暴露给前端 JavaScript。

## 本地开发

```powershell
cd admin
npm install
npm run dev
```

仅在 Vite 开发模式下，可访问 `/?preview=editor` 检查编辑器界面。此入口会从生产构建中移除。

## 验证

```powershell
npm test
npm run build
npx --yes wrangler@4.86.0 deploy --dry-run --config wrangler.jsonc
```

## Worker 配置

非敏感变量保存在 `wrangler.jsonc`：

- `ALLOWED_GITHUB_USER_ID`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `ADMIN_ORIGIN`
- `ADMIN_SESSION_TTL_SECONDS`

以下值必须使用 Cloudflare Secret，不能写入仓库：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

查看 Secret 名称：

```powershell
npx --yes wrangler secret list --config admin/wrangler.jsonc
```

## 部署

```powershell
cd admin
npm run deploy
```

后台固定向 `src/posts/YYYY-MM-DD-slug.md` 创建文件，不接受客户端传入仓库、分支、路径、SHA 或 permalink。已存在的文件会返回冲突，不会被覆盖。
