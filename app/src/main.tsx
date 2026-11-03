import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './density.css';
import { applyLook } from './lib/look';
import './themes/reading-room.css';
import './themes/postmarked.css';

// the look being compared (?look=…); today's design when none
applyLook();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
