// Bounded process-local cache for the few Cache API calls used by the Worker handler.
export class MemoryCache {
  constructor({ maxEntries = 250, maxTtlSeconds = 3600, now = Date.now } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || !Number.isInteger(maxTtlSeconds) || maxTtlSeconds < 1) {
      throw new Error("invalid_cache_limits");
    }
    this.maxEntries = maxEntries;
    this.maxTtlMs = maxTtlSeconds * 1000;
    this.now = now;
    this.sequence = 0;
    this.entries = new Map();
  }

  key(request) {
    const url = typeof request === "string" ? request : request?.url;
    if (typeof url !== "string" || !url) throw new Error("invalid_cache_key");
    return url;
  }

  async match(request) {
    const key = this.key(request);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    entry.lastUsedAt = ++this.sequence;
    return entry.response.clone();
  }

  async put(request, response) {
    if (!(response instanceof Response) || response.status !== 200) return;
    const cacheControl = response.headers.get("cache-control") || "";
    if (/\b(?:no-store|no-cache|private)\b/i.test(cacheControl)) return;
    const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
    const ttlSeconds = Math.min(Number(match?.[1] || 0), this.maxTtlMs / 1000);
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return;

    const key = this.key(request);
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      let oldestKey;
      let oldest = Infinity;
      for (const [candidate, entry] of this.entries) {
        if (entry.lastUsedAt < oldest) {
          oldest = entry.lastUsedAt;
          oldestKey = candidate;
        }
      }
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }

    const now = this.now();
    this.entries.set(key, {
      response: response.clone(),
      expiresAt: now + ttlSeconds * 1000,
      lastUsedAt: ++this.sequence
    });
  }

  async delete(request) {
    return this.entries.delete(this.key(request));
  }

  async keys() {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    return [...this.entries.keys()].map(url => new Request(url));
  }
}

export function installDefaultCache(options) {
  if (!globalThis.caches) {
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      writable: true,
      value: {}
    });
  }
  if (!globalThis.caches.default) {
    Object.defineProperty(globalThis.caches, "default", {
      configurable: true,
      writable: true,
      value: new MemoryCache(options)
    });
  }
  return globalThis.caches.default;
}
