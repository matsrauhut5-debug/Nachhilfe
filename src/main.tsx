import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

// Invite/reset links (?token_hash=…) always open "Set password",
// even if the hash route got lost or the page came from an old cache.
if (new URLSearchParams(window.location.search).has('token_hash')) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/set-password')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
