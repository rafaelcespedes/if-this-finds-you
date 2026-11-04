import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './density.css';
import { applyLook } from './lib/look';
import './themes/reading-room.css';
import './themes/reading-room/type-switch'; // temporary: the ?type pairing comparison
import './themes/postmarked.css';
// the controls' feel (ink-bar sliders, sliding faces, locks, pressed cards), after the looks it builds on
import './components/ui/controls.css';

// the look being compared (?look=…); today's design when none
applyLook();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
