import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WriteApp } from './WriteApp';
import { applyLook } from '../lib/look';
import { reloadOnNewVersion } from '../lib/stale-build';
import '../index.css';
import '../themes/reading-room.css';
import './write.css';

// the look being compared (?look=…), kept for the tab like the other pages
applyLook();

// a tab left open across a new version reloads onto it when a file it asks for is gone
reloadOnNewVersion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WriteApp />
  </StrictMode>,
);
