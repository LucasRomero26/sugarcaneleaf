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

  let bytes: Uint8Array<ArrayBuffer>;
  if (resp.body) {
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    onProgress?.({ loaded, total });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
    }
    bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
  } else {
    bytes = new Uint8Array(await resp.arrayBuffer());
    onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength });
  }

  if (cache) {
    // Response() copies the bytes, so this can run while the model initializes.
    cache
      .put(url, new Response(bytes, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) },
      }))
      .catch((e) => console.warn('Could not cache model (storage quota?):', e));
  }
  return bytes;
}
