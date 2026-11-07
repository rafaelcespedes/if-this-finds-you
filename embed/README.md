# A hand, for any page

One line in a fictional writer's hand, written out stroke by stroke: the handwriting engine on a page of its own, to
put in an iframe anywhere. It needs nothing but `../engine` beside it, no build step and no network.

```html
<iframe src="/lab/if-this-finds-you/embed/?text=Dear%20Ada%2C" title="A line in a stranger's handwriting"
  style="width: 100%; height: 200px; border: 0"></iframe>
```

## Put it on a site

Copy `engine/` and `embed/` side by side, with the licence, from the live branch:

```bash
git -C /path/to/if-this-finds-you fetch origin
git -C /path/to/if-this-finds-you archive origin/preview engine embed LICENSE | tar -x -C public/lab/if-this-finds-you
```

About 1.2 MB of JavaScript modules (the letter shapes are most of it), loaded once and cached. The first line draws in
about a quarter of a second.

## What the address sets (all optional)

| Key | What | Values |
|---|---|---|
| `seed` | the writer | any words, e.g. `quiet-heron-17`; none: one is picked the way the site's *Bring another* picks (legible hands, a whole look) |
| `style` | the tradition | `palmer`, `spencerian`, `arrighi`, `suetterlin`, `kurrent-1849`, `norwegian-1849`, `polish-1906`, `spanish-1776`, `dutch-1618`, `quebec-print`, `adult-fr-2023`, or the families `script` and `print` |
| `pen`, `tip` | the pen | `ballpoint`, `gel`, `fountain`, `pointed`, `italic`, `felt`, `pencil`; `fine`, `medium`, `bold` |
| `ink` | the ink | `ballpoint-blue`, `royal-blue`, `blue-black`, `iron-gall`, `sepia`, `black`, `red`, `green`, `graphite` |
| `neat`, `hurry` | the hand | 0 … 1 |
| `haste` | the tempo of typing | -2 … 2, tidier … hastier (the writing app's "the hand keeps your tempo") |
| `text` | the words | default: a line of a letter |
| `em` | the size | px per em, default 44 |
| `play` | write it out | `0` shows it at once |
| `speed` | how fast | times a person's pace; by default a line takes about 5 seconds |
| `ui` | the controls | `0` for the hand alone |
| `color`, `bg` | colours | any CSS colour for the ink (in place of the pen's own), and for the page (transparent by default) |

The page around it can also change it with `postMessage({ type: 'itfy:set', …the same keys })`, and hears
`{ type: 'itfy:hand', seed, style, name, tradition }` whenever the writer changes.

## In your own code instead

```js
import * as E from './engine/index.js';

const look = E.sampleLook({ entropy: String(Math.random()) });       // or your own seed and style
const p = E.withOverrides(E.makeHand(look.seed, { style: look.style }, { neatOnly: true }),
  { ...look.params, pen: 'fountain', ink: 'blue-black', neatness: 0.8, hurry: 0.2 });
const em = 44, width = 640;
const page = E.layout(p, 'Dear Ada,', { maxWidth: width / (em / E.UPM), haste: 0 });
el.innerHTML = E.renderSVG(p, page, { width, emPx: em, strokeIds: true });
const timeline = E.timeline(page, { emPx: em });
E.playSVG(el.firstChild, page, { emPx: em, timeline, rate: timeline.duration / 5 }).play();
```

`haste` applies to the whole line. A different haste per word is the ink log's job: each `{ t: 'write', text, haste }`
event carries its own, and `E.replay(p, doc, opts).page` draws it (tools/qa/tempo.mjs shows one).

## Credits

The code is MIT. The letter shapes come from Dr. A. V. Hershey's fonts (U.S. National Bureau of Standards; data
format by James Hurt), from copybooks in the public domain (Arrighi 1522–24, Strick 1618, Palomares 1776, Brandt
1849, Spencer 1866, Prószyński 1906, Palmer 1915, Sütterlin 1917), and from present-day handwriting under CC BY 4.0:
*Copiste d'un jour*, Bibliothèque et Archives nationales du Québec (2024), and *CREMMA-Wikipedia* (HTR-United,
2022–23). A page that shows the hands should credit those two. Details: [LICENSES.md](../LICENSES.md) and the README's
Credits.
