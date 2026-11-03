import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './density.css';
import './themes.css';
import './controls.css';
import { applyThemeLab } from './theme-lab';
import { applyControlsLab } from './controls-lab';

applyThemeLab();
applyControlsLab();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
