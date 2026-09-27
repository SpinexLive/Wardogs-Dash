// Shared, deduplicated read cache. Retain recent results during a background
// refresh, but stop serving them after maxAgeMs. Failures have a short cooldown.
function cachedRead(load, { freshMs = 30_000, maxAgeMs = 120_000, retryMs = 15_000 } = {}) {
  let value;
  let fetchedAt = 0;
  let pending;
  let error;
  let retryAt = 0;
  return async function read() {
    const age = Date.now() - fetchedAt;
    if (fetchedAt && age < freshMs) return value;
    if (!pending && Date.now() >= retryAt) {
      pending = Promise.resolve().then(load).then((result) => {
        value = result;
        fetchedAt = Date.now();
        error = null;
        return value;
      }).catch((failure) => {
        error = failure;
        retryAt = Date.now() + retryMs;
        throw failure;
      }).finally(() => { pending = null; });
      // A stale reader returns immediately; still handle a rejected refresh.
      pending.catch(() => {});
    }
    if (fetchedAt && age < maxAgeMs) return value;
    if (pending) return pending;
    throw error;
  };
}

module.exports = cachedRead;
