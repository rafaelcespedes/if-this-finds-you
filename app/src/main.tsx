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
// the editorial layout being explored (?layout=editorial-1/2): a frame on top of the Reading Room, after its sheets
import { applyLayout } from './lib/layout';
import './themes/editorial.css';

// the look being compared (?look=…); today's design when none
applyLook();

applyLayout('desk');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
