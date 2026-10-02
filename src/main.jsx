import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './i18n/index.js';
import './charts/setup.js';
import './index.css';
import App from './App.jsx';
import { AppProvider } from './context.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
