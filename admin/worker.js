const STATE_COOKIE = "__Host-oauth_state";
const SESSION_COOKIE = "__Host-admin_session";
const MAX_REQUEST_BYTES = 220_000;
const MAX_MARKDOWN_BYTES = 200_000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64EncodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function parseCookies(request) {
  const cookies = new Map();
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function cookie(name, value, { maxAge, sameSite = "Strict" } = {}) {
  const attributes = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    `SameSite=${sameSite}`,
  ];
  if (maxAge !== undefined) attributes.push(`Max-Age=${maxAge}`);
  return attributes.join("; ");
}

function clearCookie(name) {
  return cookie(name, "", { maxAge: 0 });
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function sessionKey(secret) {
  const keyBytes = Uint8Array.from(atob(secret), (character) => character.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error("Invalid session secret");
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSession(payload, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sessionKey(secret), plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return base64UrlEncode(combined);
}

async function decryptSession(value, secret) {
  try {
    const combined = base64UrlDecode(value);
    if (combined.length < 29) return null;
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await sessionKey(secret),
      ciphertext,
    );
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function securityHeaders(contentType) {
  const headers = {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'none'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "form-action 'self' https://github.com",
      "frame-ancestors 'none'",
      "img-src 'self' https: data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'none'",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...securityHeaders("application/json; charset=UTF-8"),
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      ...securityHeaders(null),
      "Cache-Control": "no-store",
      Location: location,
      ...extraHeaders,
    },
  });
}

async function staticAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(null))) headers.set(name, value);
  const path = new URL(request.url).pathname;
  headers.set("Cache-Control", path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function githubHeaders(accessToken) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "zinc-blog-admin",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubUser(accessToken) {
  const response = await fetch("https://api.github.com/user", {
    headers: githubHeaders(accessToken),
  });
  if (!response.ok) throw new Error("GitHub user request failed");
  return response.json();
}

async function verifyRepositoryAccess(accessToken, env) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, {
    headers: githubHeaders(accessToken),
  });
  if (!response.ok) return false;
  const repository = await response.json();
  return repository.permissions?.push === true;
}

async function currentSession(request, env) {
  const encryptedSession = parseCookies(request).get(SESSION_COOKIE);
  if (!encryptedSession) return null;
  const session = await decryptSession(encryptedSession, env.SESSION_SECRET);
  if (
    !session ||
    String(session.id) !== String(env.ALLOWED_GITHUB_USER_ID) ||
    session.tokenKind !== "github_app_user" ||
    typeof session.accessToken !== "string" ||
    typeof session.csrf !== "string"
  ) {
    return null;
  }
  return session;
}

function validOrigin(request, env) {
  return request.headers.get("Origin") === env.ADMIN_ORIGIN;
}

function validMutationRequest(request, env, session, { requireJson = false } = {}) {
  if (!validOrigin(request, env)) return false;
  if (request.headers.get("Sec-Fetch-Site") !== "same-origin") return false;
  if (!constantTimeEqual(request.headers.get("X-CSRF-Token"), session.csrf)) return false;
  if (requireJson && !request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return false;
  return true;
}

async function readJsonBody(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new HttpError(413, "请求内容过大。");
  if (!request.body) throw new HttpError(400, "请求内容为空。");

  const reader = request.body.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalLength += value.byteLength;
    if (totalLength > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "请求内容过大。");
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined));
  } catch {
    throw new HttpError(400, "JSON 格式无效。");
  }
}

function singleLine(value, field, maxLength) {
  if (typeof value !== "string") throw new HttpError(400, `${field}格式无效。`);
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > maxLength) throw new HttpError(400, `${field}长度无效。`);
  return normalized;
}

function validatePost(input) {
  const allowedFields = new Set([
    "category",
    "content",
    "description",
    "pinOrder",
    "pinned",
    "publishedAt",
    "readingMinutes",
    "slug",
    "tags",
    "title",
  ]);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "文章数据无效。");
  if (Object.keys(input).some((field) => !allowedFields.has(field))) throw new HttpError(400, "文章包含未知字段。");

  const title = singleLine(input.title, "标题", 120);
  const description = singleLine(input.description, "摘要", 240);
  const category = singleLine(input.category, "分类", 40);
  const slug = singleLine(input.slug, "文件标识", 80).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, "文件标识只能包含小写字母、数字和单个连字符。");

  const publishedAt = new Date(input.publishedAt);
  if (Number.isNaN(publishedAt.getTime()) || publishedAt.getUTCFullYear() < 2020 || publishedAt.getUTCFullYear() > 2100) {
    throw new HttpError(400, "发布时间无效。");
  }

  const readingMinutes = Number(input.readingMinutes);
  if (!Number.isInteger(readingMinutes) || readingMinutes < 1 || readingMinutes > 999) {
    throw new HttpError(400, "阅读时间无效。");
  }

  const pinned = input.pinned === true;
  const pinOrder = pinned ? Number(input.pinOrder) : null;
  if (pinned && (!Number.isInteger(pinOrder) || pinOrder < 1 || pinOrder > 999)) {
    throw new HttpError(400, "置顶顺序无效。");
  }

  if (!Array.isArray(input.tags) || input.tags.length > 10) throw new HttpError(400, "标签格式无效。");
  const tags = [...new Set(input.tags.map((tag) => singleLine(tag, "标签", 30)).filter((tag) => tag !== "posts"))];

  if (typeof input.content !== "string") throw new HttpError(400, "正文格式无效。");
  const content = input.content.replaceAll("\u0000", "").trim();
  const contentBytes = new TextEncoder().encode(content).byteLength;
  if (!content || contentBytes > MAX_MARKDOWN_BYTES) throw new HttpError(400, "正文长度无效。");

  return {
    category,
    content,
    description,
    pinOrder,
    pinned,
    publishedAt: publishedAt.toISOString(),
    readingMinutes,
    slug,
    tags,
    title,
  };
}

function yamlScalar(value) {
  return JSON.stringify(value);
}

function shanghaiDate(isoDate) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(new Date(isoDate));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function postDocument(post) {
  const tagLines = ["posts", ...post.tags].map((tag) => `  - ${yamlScalar(tag)}`).join("\n");
  const frontMatter = [
    "---",
    "layout: layouts/post.njk",
    `title: ${yamlScalar(post.title)}`,
    `description: ${yamlScalar(post.description)}`,
    `date: ${post.publishedAt}`,
    `category: ${yamlScalar(post.category)}`,
    `readingTime: ${yamlScalar(`${post.readingMinutes} min`)}`,
    `pinned: ${post.pinned}`,
    ...(post.pinned ? [`pinOrder: ${post.pinOrder}`] : []),
    "tags:",
    tagLines,
    "---",
    "",
  ].join("\n");
  return `${frontMatter}${post.content}\n`;
}

async function handleLogin(request, env) {
  if (new URL(request.url).origin !== env.ADMIN_ORIGIN) return json({ error: "Invalid origin" }, 403);
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET) {
    return json({ error: "OAuth is not configured" }, 503);
  }

  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", `${env.ADMIN_ORIGIN}/api/auth/callback`);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("allow_signup", "false");

  return redirect(authorizeUrl.toString(), {
    "Set-Cookie": cookie(STATE_COOKIE, state, { maxAge: 600, sameSite: "Lax" }),
  });
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  if (url.origin !== env.ADMIN_ORIGIN) return json({ error: "Invalid origin" }, 403);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const storedState = parseCookies(request).get(STATE_COOKIE);
  const clearState = clearCookie(STATE_COOKIE);

  if (!code || !constantTimeEqual(returnedState, storedState)) {
    return json({ error: "Invalid OAuth state" }, 400, { "Set-Cookie": clearState });
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${env.ADMIN_ORIGIN}/api/auth/callback`,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token || String(tokenData.token_type).toLowerCase() !== "bearer") {
      throw new Error("Token exchange failed");
    }

    const user = await githubUser(tokenData.access_token);
    if (String(user.id) !== String(env.ALLOWED_GITHUB_USER_ID)) {
      return json({ error: "This GitHub account is not allowed" }, 403, { "Set-Cookie": clearState });
    }
    if (!(await verifyRepositoryAccess(tokenData.access_token, env))) {
      return json({ error: "GitHub App cannot write to the configured repository" }, 403, {
        "Set-Cookie": clearState,
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const configuredTtl = Number(env.ADMIN_SESSION_TTL_SECONDS) || 3600;
    const tokenTtl = Number(tokenData.expires_in) || configuredTtl;
    const ttl = Math.min(configuredTtl, tokenTtl);
    const encryptedSession = await encryptSession(
      {
        accessToken: tokenData.access_token,
        avatarUrl: user.avatar_url,
        csrf: base64UrlEncode(crypto.getRandomValues(new Uint8Array(24))),
        exp: now + ttl,
        id: user.id,
        login: user.login,
        name: user.name,
        tokenKind: "github_app_user",
      },
      env.SESSION_SECRET,
    );

    const response = redirect(`${env.ADMIN_ORIGIN}/`);
    response.headers.append("Set-Cookie", clearState);
    response.headers.append("Set-Cookie", cookie(SESSION_COOKIE, encryptedSession, { maxAge: ttl }));
    return response;
  } catch {
    return json({ error: "GitHub authentication failed" }, 502, { "Set-Cookie": clearState });
  }
}

async function handleSession(request, env) {
  const session = await currentSession(request, env);
  if (!session) {
    return json({ authenticated: false }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
  }
  return json({
    authenticated: true,
    csrfToken: session.csrf,
    user: {
      avatarUrl: session.avatarUrl,
      id: session.id,
      login: session.login,
      name: session.name,
    },
  });
}

async function revokeGitHubToken(accessToken, env) {
  try {
    await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
        "Content-Type": "application/json",
        "User-Agent": "zinc-blog-admin",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
  } catch {
    // Cookie invalidation still ends the local session if GitHub revocation is unavailable.
  }
}

async function handleLogout(request, env, context) {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: true }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
  if (!validMutationRequest(request, env, session)) return json({ error: "Invalid request" }, 403);
  context.waitUntil(revokeGitHubToken(session.accessToken, env));
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
}

async function handleCreatePost(request, env) {
  const session = await currentSession(request, env);
  if (!session) return json({ error: "登录已过期。" }, 401, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
  if (!validMutationRequest(request, env, session, { requireJson: true })) {
    return json({ error: "请求验证失败。" }, 403);
  }

  try {
    const post = validatePost(await readJsonBody(request));
    if (!(await verifyRepositoryAccess(session.accessToken, env))) {
      return json({ error: "仓库写入权限不可用。" }, 403);
    }

    const datePrefix = shanghaiDate(post.publishedAt);
    const fileName = `${datePrefix}-${post.slug}.md`;
    const path = `src/posts/${fileName}`;
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
    const githubResponse = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        ...githubHeaders(session.accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: "main",
        content: base64EncodeUtf8(postDocument(post)),
        message: `Add post: ${post.title}`,
      }),
    });

    if (githubResponse.status === 401) return json({ error: "GitHub 登录已失效。" }, 401);
    if (githubResponse.status === 403) return json({ error: "GitHub 拒绝了仓库写入。" }, 403);
    if (githubResponse.status === 422) return json({ error: "同名文章已经存在，请更换文件标识。" }, 409);
    if (!githubResponse.ok) return json({ error: "GitHub 提交失败，请稍后重试。" }, 502);

    const result = await githubResponse.json();
    return json(
      {
        commitUrl: result.commit?.html_url,
        fileUrl: result.content?.html_url,
        postUrl: `https://zinc-acetate.github.io/posts/${datePrefix}-${post.slug}/`,
      },
      201,
    );
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "文章提交失败。" }, 500);
  }
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/auth/login") return handleLogin(request, env);
    if (request.method === "GET" && url.pathname === "/api/auth/callback") return handleCallback(request, env);
    if (request.method === "GET" && url.pathname === "/api/session") return handleSession(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/logout") return handleLogout(request, env, context);
    if (request.method === "POST" && url.pathname === "/api/posts") return handleCreatePost(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);

    return staticAsset(request, env);
  },
};

export { HttpError, postDocument, shanghaiDate, validatePost };
