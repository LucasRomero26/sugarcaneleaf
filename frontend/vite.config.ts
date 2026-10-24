import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// @ultralytics/yolo imports @litertjs/core via *indirect* dynamic import —
// `const pkg = '@litertjs/core'; await import(pkg)`. Vite can't statically
// resolve that bare specifier, so it ends up in the bundle verbatim, and the
// browser fails with "Failed to resolve module specifier '@litertjs/core'".
//
// We fix this with a browser-native <script type="importmap"> in index.html
// that maps the bare specifier to the LiteRT.js package on the jsDelivr CDN
// (the same CDN the LiteRT wasm defaults to). The dep stays out of our
// bundle, and the import() resolves at runtime via the import map.
//
// IMPORTANT: jsDelivr serves the package with `cross-origin-resource-policy:
// cross-origin` and `access-control-allow-origin: *`, so it loads cleanly
// under our COOP/COEP cross-origin isolation headers.

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  build: {
    // Never publish source maps: they would expose the original TS/TSX source.
    // scripts/prerender.mjs fails the build if any .map file or
    // sourceMappingURL reference ends up in dist/.
    sourcemap: false,
    // The SSR bundle only feeds the build-time prerender; skip copying the
    // ~40MB public/ dir (LiteRT wasm) into it.
    copyPublicDir: !isSsrBuild,
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // Keep @ultralytics/yolo out of the dep optimizer (it injects *runtime*
    // dynamic imports for peer deps that we want resolved by importmap, not
    // by Vite). Don't include @litertjs/core anywhere — it loads from CDN.
    exclude: ['@ultralytics/yolo', '@litertjs/core'],
  },
}))
