import React from 'react'
import ReactDOM from 'react-dom/client'
import RepoVisualizer from './RepoVisualizer'
import { ErrorBoundary } from './ErrorBoundary'
import { LanguageProvider } from './hooks/useTranslation'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'

// Remove qualquer margem padrão do navegador
document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <RepoVisualizer />
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
)