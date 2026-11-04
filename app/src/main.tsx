import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './density.css';
import { applyLook } from './lib/look';
import './themes/reading-room.css';
import './themes/postmarked.css';
// the controls' feel (ink-bar sliders, sliding faces, locks, pressed cards), after the looks it builds on
import './components/ui/controls.css';
// the site's layout, the Ruler (lib/layout.ts; ?layout=off goes back): a frame on top of the Reading Room
import { applyLayout } from './lib/layout';

// the look being compared (?look=…); today's design when none
applyLook();

applyLayout('desk');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
