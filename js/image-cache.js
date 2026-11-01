/**
 * Athyx Network Persistent Image Cache
 * Caches remote images (game icons, app icons, gifs, assets) in the browser's CacheStorage
 * and memory cache for instantaneous 0ms loading on subsequent visits.
 */
(function () {
  const CACHE_NAME = 'athyx-image-cache-v1';
  const memoryBlobCache = new Map();
  let cachePromise = null;

  function hasCacheSupport() {
    return typeof window !== 'undefined' && 'caches' in window;
  }

  function getCache() {
    if (!cachePromise && hasCacheSupport()) {
      cachePromise = caches.open(CACHE_NAME).catch(err => {
        console.warn('[ImageCache] Storage open error:', err);
        return null;
      });
    }
    return cachePromise;
  }

  /**
   * Applies cached image to <img> element.
   * If cached in memory -> sets objectUrl synchronously.
   * If cached in CacheStorage -> sets objectUrl as soon as retrieved from disk.
   * If not cached -> sets original src and saves to cache in background.
   */
  function applyToImage(imgEl, originalUrl, onLoad) {
    if (!imgEl || !originalUrl) return;

    // 1. Instant synchronous Memory Cache
    if (memoryBlobCache.has(originalUrl)) {
      imgEl.src = memoryBlobCache.get(originalUrl);
      if (typeof onLoad === 'function') onLoad(imgEl);
      return;
    }

    // 2. Persistent Browser CacheStorage
    if (hasCacheSupport()) {
      getCache().then(async (cache) => {
        if (!cache) {
          imgEl.src = originalUrl;
          return;
        }

        try {
          const match = await cache.match(originalUrl);
          if (match) {
            const blob = await match.blob();
            if (blob && blob.size > 0) {
              const blobUrl = URL.createObjectURL(blob);
              memoryBlobCache.set(originalUrl, blobUrl);
              imgEl.src = blobUrl;
              if (typeof onLoad === 'function') onLoad(imgEl);
              return;
            }
          }
        } catch (e) {
          // If match failed, proceed to normal load
        }

        // Not cached yet: show image normally via network
        imgEl.src = originalUrl;

        // Background cache for next time
        if (/^https?:\/\//i.test(originalUrl)) {
          fetch(originalUrl, { mode: 'cors' })
            .then(async (res) => {
              if (res.ok) {
                try {
                  await cache.put(originalUrl, res.clone());
                  const blob = await res.blob();
                  if (blob && blob.size > 0) {
                    memoryBlobCache.set(originalUrl, URL.createObjectURL(blob));
                  }
                } catch (e) {}
              }
            })
            .catch(() => {});
        }
      }).catch(() => {
        imgEl.src = originalUrl;
      });
    } else {
      imgEl.src = originalUrl;
    }
  }

  /**
   * Background pre-caching during browser idle time
   */
  function precacheImages(urls) {
    if (!urls || !urls.length || !hasCacheSupport()) return;

    const queue = Array.from(new Set(urls.filter(Boolean)));
    const scheduleNext = (fn) => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(fn, { timeout: 2000 });
      } else {
        setTimeout(fn, 150);
      }
    };

    function processQueue() {
      if (!queue.length) return;
      const batch = queue.splice(0, 4);

      Promise.all(
        batch.map(async (url) => {
          if (!url || memoryBlobCache.has(url)) return;
          const cache = await getCache();
          if (!cache) return;
          try {
            const exists = await cache.match(url);
            if (!exists) {
              const res = await fetch(url, { mode: 'cors' });
              if (res.ok) {
                await cache.put(url, res.clone());
                const blob = await res.blob();
                if (blob && blob.size > 0) {
                  memoryBlobCache.set(url, URL.createObjectURL(blob));
                }
              }
            } else {
              const blob = await exists.blob();
              if (blob && blob.size > 0) {
                memoryBlobCache.set(url, URL.createObjectURL(blob));
              }
            }
          } catch (e) {}
        })
      ).finally(() => {
        if (queue.length > 0) {
          scheduleNext(processQueue);
        }
      });
    }

    scheduleNext(processQueue);
  }

  window.AthyxImageCache = {
    applyToImage,
    precacheImages,
    has: (url) => memoryBlobCache.has(url)
  };
})();
