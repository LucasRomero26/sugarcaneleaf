import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'

// Old shared links pointed at the hash route `#/dashboard`; upgrade them to
// the real path before the first render.
if (window.location.hash === '#/dashboard') {
  window.history.replaceState(null, '', '/dashboard')
}

// The prerendered HTML in #root is for crawlers and first paint; createRoot
// replaces it on the first commit (no hydration, so client-only state such as
// cached metrics in localStorage can't cause mismatches).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
