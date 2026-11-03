import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FontsApp } from './FontsApp';
import { fonts } from './store';
import '../index.css';
import '../archive/archive.css';
import './fonts.css';

// the workers load the engine while the page lays out its rows
fonts.warm();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FontsApp />
  </StrictMode>,
);
