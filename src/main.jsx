import React from 'react'
import ReactDOM from 'react-dom/client'
import RepoVisualizer from './RepoVisualizer'

// Remove qualquer margem padrão do navegador
document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RepoVisualizer />
  </React.StrictMode>,
)