// The 404 (404.html): an address that isn't here. Its words and its two ways on are in the page itself, so they show
// before (and without) any script; this adds what every page has: the look, the Ruler, and the shared header, whose
// Menu is the app's bottom sheet on a phone.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteHeader } from '../components/SiteHeader';
import { applySerif } from '../archive/serif';
import { applyLook } from '../lib/look';
import { reloadOnNewVersion } from '../lib/stale-build';
import { withLogo } from '../lib/brand';
import { ARCHIVE_URL, TOOL_URL } from '../lib/places';
import '../index.css';
import '../themes/reading-room.css';
import '../themes/postmarked.css';
import './notfound.css';
// the site's layout, the Ruler (lib/layout.ts; ?layout=off goes back): a frame on top of the Reading Room
import { applyLayout } from '../lib/layout';

// the letter face for the earlier design's words (the Reading Room sets its own book face)
applySerif();
applyLook();
applyLayout('notfound');

// the two ways on, at the build's own addresses, keeping a logo being compared (?logo=)
const WAYS: Record<string, string> = { write: TOOL_URL, letters: ARCHIVE_URL };
for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-nf-way]')) {
  const to = WAYS[a.dataset.nfWay ?? ''];
  if (to) a.href = withLogo(to);
}

// a tab left open across a new version reloads onto it when a file it asks for is gone
reloadOnNewVersion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteHeader />
  </StrictMode>,
);
