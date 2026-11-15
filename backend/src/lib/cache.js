// In-memory TTL cache with de-duplication of concurrent requests.
// Shields InfluxDB when many visitors hit the public page.

export class TtlCache {
  constructor({ maxEntries = 200 } = {}) {
    this.map = new Map();
    this.maxEntries = maxEntries;
  }

  async wrap(key, ttlMs, fn) {
    const now = Date.now();
    const hit = this.map.get(key);
    if (hit && hit.expires > now) return hit.promise;

    const promise = Promise.resolve().then(fn);
    this.map.set(key, { promise, expires: now + ttlMs });
    if (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value);
    // Errors are not cached.
    promise.catch(() => {
      if (this.map.get(key)?.promise === promise) this.map.delete(key);
    });
    return promise;
  }

  clear() {
    this.map.clear();
  }
}
