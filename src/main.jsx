import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const rootElement = document.getElementById('root')

// If a prerendered snapshot is present, let React own a clean container.
if (rootElement.hasChildNodes()) {
  rootElement.replaceChildren()
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
