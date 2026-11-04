import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { FontsNew } from './new/FontsNew';
import { applyFontsSwitch, FONTS_NEW } from './new/switch';
import { fonts } from './store';
import { applyLook } from '../lib/look';
import { applyLayout } from '../lib/layout';
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
// the site's layout (the Ruler): its running head and quiet grid here too; the page's own content isn't restyled
applyLayout('fonts');
// the page (the redesign; ?fonts=old the earlier one for now) and its night colours (?theme=dark)
applyFontsSwitch();

// the workers load the engine while the page lays out its rows
fonts.warm();

// the earlier page comes in its own small file, only when it's asked for (?fonts=old), so the page everyone gets
// loads nothing it doesn't show
const FontsApp = lazy(() => import('./FontsApp').then((m) => ({ default: m.FontsApp })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {FONTS_NEW ? <FontsNew /> : <Suspense fallback={null}><FontsApp /></Suspense>}
  </StrictMode>,
);
