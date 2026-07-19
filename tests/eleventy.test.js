const assert = require("node:assert/strict");
const test = require("node:test");

const { compareBlogPosts } = require("../eleventy.config.js");

function post(date, data = {}) {
  return { data, date: new Date(date) };
}

test("pinned posts sort before newer normal posts", () => {
  const posts = [
    post("2026-07-20T12:00:00Z"),
    post("2025-01-01T12:00:00Z", { pinned: true, pinOrder: 10 }),
  ].sort(compareBlogPosts);

  assert.equal(posts[0].data.pinned, true);
});

test("pinned posts use ascending pin order", () => {
  const posts = [
    post("2026-07-20T12:00:00Z", { pinned: true, pinOrder: 20 }),
    post("2025-01-01T12:00:00Z", { pinned: true, pinOrder: 2 }),
  ].sort(compareBlogPosts);

  assert.equal(posts[0].data.pinOrder, 2);
});

test("normal posts use descending publication time", () => {
  const posts = [
    post("2025-01-01T12:00:00Z"),
    post("2026-07-20T12:00:00Z"),
  ].sort(compareBlogPosts);

  assert.equal(posts[0].date.toISOString(), "2026-07-20T12:00:00.000Z");
});
