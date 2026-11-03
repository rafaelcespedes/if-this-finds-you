import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './density.css';
import { applyLook } from './lib/look';
import { applySansOption } from './themes/reading-room/sans-switch'; // temporary: ?rrsans comparison
import './themes/reading-room.css';
import './themes/postmarked.css';
// the controls' feel (ink-bar sliders, sliding faces, locks, pressed cards), after the looks it builds on
import './components/ui/controls.css';

// the look being compared (?look=…); today's design when none
applyLook();
applySansOption();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
