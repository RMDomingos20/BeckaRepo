import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 40, color: '#f43f5e', background: '#050810', height: '100vh', fontFamily: 'monospace' }}>
        <h2>❌ Erro Crítico na Interface</h2>
        <p>Ocorreu um problema inesperado ao renderizar o grafo.</p>
        <pre style={{ fontSize: 11, opacity: 0.6, background: '#020408', padding: 10 }}>{this.state.error?.message}</pre>
        <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', cursor: 'pointer' }}>Reiniciar Aplicativo</button>
      </div>
    );
    return this.props.children;
  }
}