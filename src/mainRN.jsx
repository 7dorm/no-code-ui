// Полифилл для process (нужен для @babel/types и других Node.js модулей)
if (typeof process === 'undefined') {
  window.process = {
    env: {},
    version: '',
    versions: {},
    browser: true,
    nextTick: (fn) => setTimeout(fn, 0),
    cwd: () => '/',
    platform: 'browser'
  };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRN from './AppRN';
import './index.css';

// React Native Web можно использовать напрямую с ReactDOM
ReactDOM.createRoot(document.getElementById('root')).render(
  <AppRN />
);
