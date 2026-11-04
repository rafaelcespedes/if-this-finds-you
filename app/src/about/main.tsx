import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AboutApp } from './AboutApp';
import { applySerif } from '../archive/serif';
import { applyLook } from '../lib/look';
import '../index.css';
import '../themes/reading-room.css';
import '../themes/reading-room/type-switch'; // temporary: the ?type pairing comparison
import '../themes/postmarked.css';
import './about.css';
// the editorial layout being explored (?layout=editorial-1/2): a frame on top of the Reading Room (its sheet comes with lib/layout.ts)
import { applyLayout } from '../lib/layout';

// the letter face for the page's reading text in today's look (the Reading Room sets its own book face)
applySerif();
// the look being compared (?look=…), kept for the tab like the other pages
applyLook();

applyLayout('about');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AboutApp />
  </StrictMode>,
);
