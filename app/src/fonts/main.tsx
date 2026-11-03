import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FontsApp } from './FontsApp';
import { fonts } from './store';
import { applyLook } from '../lib/look';
import { applySansOption } from '../themes/reading-room/sans-switch'; // temporary: ?rrsans comparison
// the tool's stylesheets in the tool's order (its compact control sizes, the looks, the controls' feel), so the
// shared controls here are the home page's, size for size
import '../index.css';
import '../density.css';
import '../archive/archive.css';
import '../themes/reading-room.css';
import '../themes/postmarked.css';
import '../components/ui/controls.css';
import './fonts.css';

// the look being compared (?look=…), kept for the tab like the tool and the library
applyLook();
applySansOption();

// the workers load the engine while the page lays out its rows
fonts.warm();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FontsApp />
  </StrictMode>,
);
