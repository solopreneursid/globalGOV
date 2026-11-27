import test from "node:test";
import assert from "node:assert/strict";
import { MemoryCache } from "./memory-cache.mjs";

test("cache clones responses and expires entries at max-age", async () => {
  let now = 1000;
  const cache = new MemoryCache({ now: () => now });
  const request = new Request("https://example.test/api/check?id=upsc");
  await cache.put(request, new Response("reachable", { headers: { "Cache-Control": "public, max-age=2" } }));
  const first = await cache.match(request);
  assert.equal(await first.text(), "reachable");
  now += 2001;
  assert.equal(await cache.match(request), undefined);
});

test("does not cache private, no-store, non-200, or unbounded responses", async () => {
  const cache = new MemoryCache();
  const request = new Request("https://example.test/private");
  await cache.put(request, new Response("x", { headers: { "Cache-Control": "private, max-age=30" } }));
  await cache.put(request, new Response("x", { headers: { "Cache-Control": "no-store, max-age=30" } }));
  await cache.put(request, new Response("x", { status: 503, headers: { "Cache-Control": "public, max-age=30" } }));
  await cache.put(request, new Response("x"));
  assert.equal(await cache.match(request), undefined);
});

test("evicts the least recently used entry at the configured bound", async () => {
  const cache = new MemoryCache({ maxEntries: 2 });
  const a = new Request("https://example.test/a");
  const b = new Request("https://example.test/b");
  const c = new Request("https://example.test/c");
  const response = () => new Response("x", { headers: { "Cache-Control": "public, max-age=60" } });
  await cache.put(a, response());
  await cache.put(b, response());
  await cache.match(a);
  await cache.put(c, response());
  assert.ok(await cache.match(a));
  assert.equal(await cache.match(b), undefined);
});
