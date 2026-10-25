// Model weights (~94MB) are fetched on first use and persisted with the Cache
// API, so later visits load them from disk instead of the network. Bump the
// cache name when the published weights change to force a fresh download.
export const MODEL_CACHE = 'model-v1';

export interface DownloadProgress {
  loaded: number;
  /** Null when the server doesn't send Content-Length. */
  total: number | null;
}

function cacheAvailable(): boolean {
  return typeof caches !== 'undefined';
}

/** True if `url` is already stored in the model cache (no body is read). */
export async function isModelCached(url: string): Promise<boolean> {
  if (!cacheAvailable()) return false;
  try {
    const cache = await caches.open(MODEL_CACHE);
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/** Return the model bytes from the cache, or download them (reporting
 *  progress) and store them for next time. */
export async function fetchModelCached(
  url: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  let cache: Cache | null = null;
  if (cacheAvailable()) {
    try {
      cache = await caches.open(MODEL_CACHE);
      const hit = await cache.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch (e) {
      // Private mode / storage disabled: fall through to a plain download.
      console.warn('Model cache unavailable:', e);
      cache = null;
    }
  }

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`model download failed: HTTP ${resp.status}`);
  const header = Number(resp.headers.get('Content-Length'));
  const total = Number.isFinite(header) && header > 0 ? header : null;

  if (cache) {
    // clone() tees the body: the cache streams one branch to disk while we read
    // the other, so the model is downloaded once and never copied for storage.
    cache
      .put(url, resp.clone())
      .catch((e) => console.warn('Could not cache model (storage quota?):', e));
  }

  if (!resp.body) {
    const bytes = new Uint8Array(await resp.arrayBuffer());
    onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength });
    return bytes;
  }

  // Chunks are written straight into one buffer sized from Content-Length. It
  // only grows when the header is missing or reports a compressed size.
  const reader = resp.body.getReader();
  let bytes = new Uint8Array(total ?? 0);
  let loaded = 0;
  onProgress?.({ loaded, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.byteLength > bytes.byteLength) {
      const grown = new Uint8Array(Math.max(bytes.byteLength * 2, loaded + value.byteLength));
      grown.set(bytes.subarray(0, loaded));
      bytes = grown;
    }
    bytes.set(value, loaded);
    loaded += value.byteLength;
    onProgress?.({ loaded, total });
  }
  return loaded === bytes.byteLength ? bytes : bytes.slice(0, loaded);
}
