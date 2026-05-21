if (typeof process === 'undefined') {
  (window as any).process = {
    env: {},
    nextTick: (fn: () => void) => setTimeout(fn, 0),
    cwd: () => '/'
  };
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import AppRN from './AppRN';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
    <StrictMode>
      <AppRN />
    </StrictMode>
);
