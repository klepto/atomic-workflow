import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app.tsx';
import '@/index.css';
import { applyStoredTheme } from '@/theme/theme.ts';

applyStoredTheme();

/**
 * Element of `index.html` that the app renders into.
 */
const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
