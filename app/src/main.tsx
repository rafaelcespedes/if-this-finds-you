import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './density.css';
import { applyLook } from './lib/look';
import { applySansOption } from './themes/reading-room/sans-switch'; // temporary: ?rrsans comparison
import './themes/reading-room.css';
import './themes/postmarked.css';
import './controls.css';
import { applyControlsLab } from './controls-lab';

// the look being compared (?look=…); today's design when none
applyLook();
applySansOption();
// control patterns being tried (?controls=1…6)
applyControlsLab();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
