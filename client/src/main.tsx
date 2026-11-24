import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hudStore } from './game/core/hudStore';
import { network } from './multiplayer/NetworkClient';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado no index.html');

// Ganchos de depuração apenas em desenvolvimento (usados nos testes automatizados de navegador).
if (import.meta.env.DEV) {
  (window as unknown as { __hh: unknown }).__hh = { network, hudStore };
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
