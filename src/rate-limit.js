class AttemptLimiter {
  constructor({ maxAttempts = 5, windowMs = 15 * 60 * 1000, maxEntries = 10000 } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  inspect(keys, now = Date.now()) {
    let retryAfterMs = 0;
    keys.forEach((key) => {
      const entry = this.entries.get(key);
      if (!entry) return;
      if (entry.resetAt <= now) {
        this.entries.delete(key);
        return;
      }
      if (entry.attempts >= this.maxAttempts) {
        retryAfterMs = Math.max(retryAfterMs, entry.resetAt - now);
      }
    });
    return { limited: retryAfterMs > 0, retryAfterMs };
  }

  recordFailure(keys, now = Date.now()) {
    keys.forEach((key) => {
      const current = this.entries.get(key);
      const entry = !current || current.resetAt <= now
        ? { attempts: 0, resetAt: now + this.windowMs }
        : current;
      entry.attempts += 1;
      this.entries.delete(key);
      this.entries.set(key, entry);
    });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  reset(keys) {
    keys.forEach((key) => this.entries.delete(key));
  }
}

module.exports = { AttemptLimiter };
