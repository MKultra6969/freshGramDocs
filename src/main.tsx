import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme, readTheme } from './theme'
import './styles/base.css'
import './styles/layout.css'
import './styles/content.css'

applyTheme(readTheme())

const container = document.getElementById('root')
if (!container) {
  throw new Error('Не найден элемент #root')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
