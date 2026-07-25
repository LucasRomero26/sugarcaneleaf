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

export default defineConfig({
  plugins: [react()],
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
})
