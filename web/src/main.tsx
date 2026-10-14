import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { keepACopy } from './services/offline';
import './styles.css';

// index.html always carries the root element, so the app has somewhere to draw.
const root = document.getElementById('root') as HTMLElement;

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// the built site keeps a copy of itself on the device, so it still opens where the desktop can't be reached.
keepACopy(navigator.serviceWorker, __BUILT__);
