import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { setupTelegram } from '@/lib/telegram';
import './index.css';

setupTelegram();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
