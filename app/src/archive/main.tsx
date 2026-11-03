import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArchiveApp } from './ArchiveApp';
import { cards } from './cards';
import { applySerif } from './serif';
import '../index.css';
import './archive.css';

// the letter face (?serif=1…4), loaded beside the page
applySerif();
// the card workers load the engine while the page loads the letters
if (!location.hash.startsWith('#/letter/')) cards.warm();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArchiveApp />
  </StrictMode>,
);
