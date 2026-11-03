// Controls research prototype (Nov 2026): ?controls=1…6 (combine with commas, e.g. ?controls=1,2,3) tries the
// control patterns in controls.css, on the Rubric palette. Kept for the tab like ?look, never in share links.
// Temporary.
//   1 ink-bar sliders: the row is the slider, its name and word inside the bar
//   2 the writer's own value catches: a detent at the natural mark, a settle on a tap, a give at the ends
//   3 a sliding face: Print/Joined, the pen tip and the paper kinds move one face between choices
//   4 words, not switches: "Neat hands only" becomes Neat only / Any hand
//   5 locks on the groups: a padlock beside Paper, Pen and Ink keeps that choice through Find another
//   6 pressed and settled: pen cards press in, the chosen ink's ring draws in

let picked: Set<string> | null = null;

export function controlsLab(): Set<string> {
  if (picked) return picked;
  let raw: string | null = null;
  try {
    const asked = new URLSearchParams(location.search).get('controls');
    if (asked != null && /^[0-9,]*$/.test(asked)) sessionStorage.setItem('seedhand:controls', asked);
    raw = sessionStorage.getItem('seedhand:controls');
  } catch {
    /* private window: nothing kept */
  }
  picked = new Set((raw ?? '').split(',').filter((n) => /^[1-6]$/.test(n)));
  return picked;
}

export const hasControl = (n: number) => controlsLab().has(String(n));

export function applyControlsLab() {
  const on = controlsLab();
  if (!on.size) return;
  const root = document.documentElement;
  root.dataset.controls = [...on].join(' ');
  if (on.has('3')) slidingFaces();
}

// 3: one face slides to the chosen segment (DialKit's segmented pill), measured from the chosen item
function slidingFaces() {
  const SEL = "[data-slot='segmented']:is([aria-label='Print or joined'], [aria-label^='Kind of']), [role='radiogroup'][aria-label='Tip'], [data-lab-words]";
  const place = (group: HTMLElement) => {
    let face = group.querySelector<HTMLElement>(':scope > .lab-face');
    if (!face) {
      face = document.createElement('span');
      face.className = 'lab-face';
      face.setAttribute('aria-hidden', 'true');
      group.prepend(face);
    }
    const on = group.querySelector<HTMLElement>(":scope > [data-state='on'], :scope > [aria-checked='true']");
    if (!on) { face.style.opacity = '0'; return; }
    const moved = face.dataset.placed === '1';
    face.style.transition = moved ? '' : 'none';
    face.style.opacity = '1';
    face.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    face.style.width = `${on.offsetWidth}px`;
    face.style.height = `${on.offsetHeight}px`;
    face.dataset.placed = '1';
  };
  const sweep = () => document.querySelectorAll<HTMLElement>(SEL).forEach(place);
  // one sweep per burst of changes; a timer, not a frame callback, so it also runs in a tab that isn't showing yet
  let queued = 0;
  const soon = () => { if (!queued) queued = window.setTimeout(() => { queued = 0; sweep(); }, 0); };
  new MutationObserver(soon).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'aria-checked'] });
  window.addEventListener('resize', soon);
  soon();
}
