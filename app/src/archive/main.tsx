import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArchiveApp } from './ArchiveApp';
import { cards } from './cards';
import { keepForOffline } from './offline';
import { applySerif } from './serif';
import '../index.css';
import './archive.css';
import { applyLook } from '../lib/look';
import '../themes/reading-room.css';
import '../themes/postmarked.css';
// the library in the Reading Room (the layout study's proposals 2 and 3), after the look's own sheet
import '../themes/reading-room/library.css';
// the editorial layout being explored (?layout=editorial-1/2): a frame on top of the Reading Room (its sheet comes with lib/layout.ts)
import { applyLayout } from '../lib/layout';

// the letter face (?serif=1…4), loaded beside the page
applySerif();
// the card workers load the engine while the page loads the letters
if (!location.hash.startsWith('#/letter/')) cards.warm();

// the look being compared (?look=…); today's design when none
applyLook();

applyLayout('letters');

// opened once online, the library opens again offline (public/letters-sw.js)
keepForOffline();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArchiveApp />
  </StrictMode>,
);
