import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ExportLab } from './ExportLab';
import '../../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExportLab />
  </StrictMode>,
);
