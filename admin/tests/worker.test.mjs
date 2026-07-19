import assert from "node:assert/strict";
import test from "node:test";

import { postDocument, shanghaiDate, validatePost } from "../worker.js";

function validInput(overrides = {}) {
  return {
    category: "题解",
    content: "## 结论\n\n公式 $x^2$。",
    description: "一篇测试文章。",
    pinOrder: null,
    pinned: false,
    publishedAt: "2026-07-20T04:30:00.000Z",
    readingMinutes: 3,
    slug: "sample-post",
    tags: ["算法", "数学"],
    title: "示例文章",
    ...overrides,
  };
}

test("validates and serializes a normal post", () => {
  const post = validatePost(validInput());
  const document = postDocument(post);

  assert.equal(shanghaiDate(post.publishedAt), "2026-07-20");
  assert.match(document, /title: "示例文章"/);
  assert.match(document, /pinned: false/);
  assert.match(document, /  - "posts"/);
  assert.match(document, /公式 \$x\^2\$。/);
});

test("rejects path traversal and encoded path characters", () => {
  for (const slug of ["../secret", "a/b", "a\\b", "a%2fb", ".hidden", "two--dashes"]) {
    assert.throws(() => validatePost(validInput({ slug })), { status: 400 });
  }
});

test("rejects unknown front matter fields", () => {
  assert.throws(
    () => validatePost(validInput({ permalink: "/admin/" })),
    { status: 400 },
  );
});

test("quotes metadata and removes front matter line injection", () => {
  const post = validatePost(validInput({ title: "Title\npermalink: /owned" }));
  const document = postDocument(post);

  assert.match(document, /title: "Title permalink: \/owned"/);
  assert.doesNotMatch(document, /\npermalink: \/owned\n/);
});

test("writes pinned fields only for pinned posts", () => {
  const pinned = postDocument(validatePost(validInput({ pinned: true, pinOrder: 2 })));
  const normal = postDocument(validatePost(validInput()));

  assert.match(pinned, /pinned: true\npinOrder: 2/);
  assert.doesNotMatch(normal, /pinOrder:/);
});

test("rejects invalid size and scalar types", () => {
  assert.throws(() => validatePost(validInput({ content: "" })), { status: 400 });
  assert.throws(() => validatePost(validInput({ readingMinutes: 0 })), { status: 400 });
  assert.throws(() => validatePost(validInput({ tags: "算法" })), { status: 400 });
  assert.throws(() => validatePost(validInput({ title: "x".repeat(121) })), { status: 400 });
});
