import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WriteApp } from './WriteApp';
import { reloadOnNewVersion } from '../lib/stale-build';
import '../index.css';
import './write.css';

// its own app: none of the site's looks (the Reading Room), its own frame (write.css)
document.documentElement.setAttribute('data-app', 'write');

// a tab left open across a new version reloads onto it when a file it asks for is gone
reloadOnNewVersion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WriteApp />
  </StrictMode>,
);
