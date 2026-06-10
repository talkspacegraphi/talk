import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Suppress Vite HMR WebSocket errors in Electron
// (HMR doesn't work in Electron, only polling reload works)
if (typeof window !== 'undefined' && (window as any).electronAPI) {
  window.addEventListener('error', (e: ErrorEvent) => {
    const msg = e.message || '';
    if (msg.includes('WebSocket closed without opened') || msg.includes('WebSocket handshake')) {
      e.preventDefault();
    }
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const msg = String(e.reason?.message || e.reason || '');
    if (msg.includes('WebSocket')) {
      e.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
