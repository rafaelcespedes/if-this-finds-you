import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FontsApp } from './FontsApp';
import { fonts } from './store';
import { applyLook } from '../lib/look';
import '../index.css';
import '../archive/archive.css';
import '../themes/reading-room.css';
import '../themes/postmarked.css';
import './fonts.css';

// the look being compared (?look=…), kept for the tab like the tool and the library
applyLook();

// the workers load the engine while the page lays out its rows
fonts.warm();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FontsApp />
  </StrictMode>,
);
