import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArchiveApp } from './ArchiveApp';
import { cards } from './cards';
import '../index.css';
import './archive.css';

// the card workers load the engine while the page loads the letters
if (!location.hash.startsWith('#/letter/')) cards.warm();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArchiveApp />
  </StrictMode>,
);
