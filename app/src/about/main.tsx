import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AboutApp } from './AboutApp';
import { applySerif } from '../archive/serif';
import { applyLook } from '../lib/look';
import { applySansOption } from '../themes/reading-room/sans-switch'; // temporary: ?rrsans comparison
import '../index.css';
import '../themes/reading-room.css';
import '../themes/postmarked.css';
import './about.css';
// the editorial layout being explored (?layout=editorial-1/2): a frame on top of the Reading Room, after its sheets
import { applyLayout } from '../lib/layout';
import '../themes/editorial.css';

// the letter face for the page's reading text in today's look (the Reading Room sets its own book face)
applySerif();
// the look being compared (?look=…), kept for the tab like the other pages
applyLook();
applySansOption();

applyLayout('about');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AboutApp />
  </StrictMode>,
);
