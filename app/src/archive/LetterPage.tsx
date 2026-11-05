// A letter: the whole letter on paper in its hand, written out in front of you when it opens (the tool's reader:
// the engine's timeline + playSVG, about 3x a real hand, a tap finishes it), what is known about it, and what you
// can do with it: write a reply, turn to the next one, share it, keep it as an image.
// Loaded on demand (its own chunk, with the engine); the index never waits for it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PaperCanvas, PaperGuide, PaperLetter } from '@/components/PaperCanvas';
import { ReaderSheets } from '@/components/ReaderSheets';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { canShareLinks, copyText, renderLiveNote, saveNote, shareLink } from '@/lib/actions';
import { makeHand } from '@engine';
import { APP_NAME } from '@/lib/brand';
import { CONTROLS, naturalValue } from '@/lib/controls';
import { DEFAULT_STATE, encodeState, type ReplyTo } from '@/lib/state';
import { writerName } from '@/lib/hands';
import { LIVE, liveExtras, liveLayout, type Live } from '@/lib/live';
import { sheetShadow } from '@/lib/papers';
import { clamp } from '@/lib/utils';
import { cards } from './cards';
import { filterLetters, letterDescription } from './data';
import { DETAIL, Editorial, HandMenu, LetterDock, TitleBlock, type DockActions } from './LetterParts';
import type { ArchiveLetter, Look } from './model';
import { lookFor, renderingOf } from './look';
import { indexHash, letterHash, randomHand, randomIndex, type Filters } from './route';
import { ARCHIVE_URL, Missing, SiteHeader, toolHref } from './SiteHeader';
// the Reading Room: its own letter layout (ReadingSpread.tsx) and, where the spread doesn't fit, its slip dock (SlipDock.tsx)
import { LOOK } from '@/lib/look';
import { SlipDock } from './SlipDock';
import { copyCitation, LetterCounter, ReadingSpread, SPREAD_QUERY } from './ReadingSpread';
import { marksOf } from '@/themes/reading-room/catalogue';
const Dock: (a: DockActions & { id?: string }) => ReactNode = LOOK === 'reading-room' ? SlipDock : LetterDock;
import { LetterArrival } from '@/themes/postmarked/letter';

const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;

/** The look's slider values as the tool's seed-relative offsets (lib/controls.ts), so the tool draws the same hand. */
// ---------- the sideways swipe on a phone (LetterPage's touch handlers) ----------
const SWIPE = {
  /** px before the swipe picks its way, and how much more sideways than up or down it must go to be the letter's */
  engage: 8, axis: 1.6,
  /** it turns past this (px), or at a flick faster than this (px/ms) */
  turn: 56, flick: 0.11,
  /** touches starting this near the screen's edges are the browser's back and forward */
  edge: 20,
};
/** How far the sheet goes for the finger's dx: 0.35 of it up to the turning point, 0.15 beyond (it holds back). */
function pull(dx: number) {
  const a = Math.abs(dx);
  return Math.sign(dx) * (a <= SWIPE.turn ? a * 0.35 : SWIPE.turn * 0.35 + (a - SWIPE.turn) * 0.15);
}
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** A motion token from index.css (the curves live there, once). */
function motionToken(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
/** Stop whatever the sheet is doing where it is on screen (its presented value) and say where that is (px). */
function catchMotion(el: HTMLElement) {
  for (const a of el.getAnimations()) {
    try { a.commitStyles(); } catch { /* not rendered: nothing to keep */ }
    a.cancel();
  }
  return parseFloat(getComputedStyle(el).translate) || 0;
}
/** Back to rest from wherever the sheet is (a swipe that fell short, a second finger): the drawer's curve, 300 ms. */
function settle(el: HTMLElement) {
  const from = el.style.translate || '0px 0px';
  const opacity = el.style.opacity || '1';
  el.style.translate = '';
  el.style.opacity = '';
  if (parseFloat(from) === 0 && opacity === '1') { el.style.willChange = ''; return; }
  const run = el.animate([{ translate: from, opacity }, { translate: '0px 0px', opacity: 1 }], { duration: 300, easing: motionToken('--ease-drawer', 'cubic-bezier(0.32, 0.72, 0, 1)') });
  run.onfinish = () => { el.style.willChange = ''; };
}

function lookOffsets(look: Look) {
  const natural = makeHand(look.seed, look.style);
  const out: Record<string, number> = {};
  for (const c of CONTROLS) {
    const v = look.params[c.key];
    if (v == null || c.app) continue;
    const off = clamp(v, c.min, c.max) - naturalValue(c, natural);
    if (Math.abs(off) > (c.max - c.min) * 0.002) out[c.key] = +off.toFixed(3);
  }
  return out;
}

/**
 * "Write a reply": the tool opens on the two-letter desk, a blank sheet for you (a writer of your own, never this
 * letter's) with this letter beside it, exactly as it was shown here. The link is the tool's own note state
 * (lib/state.ts encodeState), so its format lives in one place.
 */
export function replyHref(l: ArchiveLetter, look: Look, replier: string) {
  const [seed, style] = replier.split('~');
  const replyTo: ReplyTo = {
    id: l.id, seed: look.seed, style: look.style, paper: look.paper as ReplyTo['paper'],
    pen: look.pen, ink: look.ink, tip: look.tip as ReplyTo['tip'], size: look.size, offsets: lookOffsets(look),
  };
  return `${toolHref}#${encodeState({ ...DEFAULT_STATE, seed, style, text: '', sample: null, inkLog: null, marks: [], replyTo })}`;
}

interface Props {
  letters: ArchiveLetter[] | null;
  error: boolean;
  onRetry: () => void;
  id: string;
  hand: string | null;
  keep: boolean;
  /** the index's filters: the way back, and the letters Previous and Next turn through */
  backFilters: Filters;
}

/** The window's height, kept current. */
/** A paper's name as words after "on": "laid paper", "a notebook page", "an aerogramme" (never "laid paper paper"). */
function paperWords(name: string) {
  const n = name.toLowerCase();
  return /paper$/.test(n) ? n : `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
}

function useWindowHeight() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}

export default function LetterPage({ letters, error, onRetry, id, hand, keep, backFilters }: Props) {
  const letter = letters?.find((l) => l.id === id) ?? null;
  const look = useMemo(
    () => (letter ? cards.lookOf(letter.id, hand ?? undefined) ?? lookFor(letter, hand, (x) => letters?.find((l) => l.id === x)) : null),
    [letter, hand, letters],
  );
  const r = useMemo(() => (look ? renderingOf(look) : null), [look]);
  const name = look ? writerName(look.seed) : '';
  // the reply's writer: someone new (two letters in one hand on one desk would read oddly), fixed for this view
  const replier = useMemo(() => {
    let h = randomHand();
    while (look && h.split('~')[0] === look.seed) h = randomHand();
    return h;
  }, [id, look]);
  const coarse = useMediaQuery('(pointer: coarse)');

  // the sheet fills its column, up to about real size on a laptop. The Reading Room's spread (desktop, a window at
  // least 760 px tall) fits the whole sheet to the window's height too, so it stays put beside the page
  const colRef = useRef<HTMLDivElement>(null);
  const colW = useElementWidth(colRef);
  const spread = useMediaQuery(SPREAD_QUERY) && LOOK === 'reading-room';
  const vh = useWindowHeight();
  const rem = typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  const fitH = spread && vh >= 760 ? vh - 10.25 * rem : 0;
  const pxPerMm = r && colW ? Math.min(MAX_PX_PER_MM, colW / r.paper.w, fitH ? fitH / r.paper.h : Infinity) : 0;

  // the writing is laid out once the paper is on screen (the first layout of a hand takes a moment)
  const lookKey = look ? JSON.stringify(look) : '';
  const [page, setPage] = useState<{ key: string; live: Live; extras: string[] } | null>(null);
  useEffect(() => {
    if (!letter || !r || !LIVE) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => setTimeout(() => {
      if (cancelled) return;
      const live = liveLayout(r.p, letter.text, r.paper, r.size, r.lineSpacing, false);
      const extras = liveExtras(live, { marks: [], signed: false, writerName: name, text: live.page.text });
      setPage({ key: letter.id + lookKey, live, extras });
    }, 0));
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [letter, r, lookKey, name]);
  const ready = page && letter && page.key === letter.id + lookKey ? page : null;

  // write-on: plays when the writing is ready; a tap or a key finishes it; Replay plays it again
  const [token, setToken] = useState(1);
  const [finish, setFinish] = useState(0);
  const backHref = indexHash(backFilters);
  // back to the index as it was left (filters and scroll)
  const back = useCallback(() => { window.location.hash = backHref; }, [backHref]);

  // Previous and Next turn through the letters the index was showing (all of them when this one isn't among them),
  // round and round. Turning replaces the page in the history, so Back still goes to the index.
  const list = useMemo(() => {
    if (!letters) return [];
    const shown = filterLetters(letters, backFilters);
    return shown.some((l) => l.id === id) ? shown : letters;
  }, [letters, backFilters, id]);
  const at = list.findIndex((l) => l.id === id);
  const neighbour = (d: 1 | -1) => (list.length > 1 && at >= 0 ? list[(at + d + list.length) % list.length] : null);
  const thisHand = hand ?? `of:${id}`;
  const turn = useCallback((d: 1 | -1) => {
    const to = neighbour(d);
    if (!to) return;
    history.replaceState(null, '', letterHash(to.id, keep ? thisHand : null, keep));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [list, at, keep, thisHand]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // a menu or sheet that's open takes its own keys (Escape closes it, and only it)
      if ((e.target as Element | null)?.closest?.('[role=menu], [role=dialog], [data-vaul-drawer]') || document.querySelector('[role=menu], [data-vaul-drawer]')) return;
      if (e.key === 'Escape') { back(); return; }
      const t = e.target as HTMLElement | null;
      const typing = t && /^(input|textarea|select)$/i.test(t.tagName) && (t as HTMLInputElement).type !== 'checkbox';
      if (!typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); turn(e.key === 'ArrowLeft' ? -1 : 1); return; }
      setFinish((n) => n + 1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [back, turn]);

  // phones: a sideways swipe on the letter turns to the next or previous one; a tap still finishes the writing. The
  // sheet goes with the finger, held back (a page to turn, not a card to throw: 0.35 of the finger's way, 0.15 past
  // the turning point), so it's plain from the first move that the swipe was felt; a flick turns as well as a long
  // drag; the next letter comes in from the side the finger is heading, and a swipe that falls short settles back.
  // Touch only: the arrow keys and the dock's ‹ › turn at once. Transform and opacity only, set on the sheet itself;
  // whatever is moving is caught where it is on screen, so a second swipe can take it mid-flight.
  const sheetRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; t: number; base: number; on: boolean | null; trail: { x: number; t: number }[] } | null>(null);
  // a drag isn't a tap: the click a browser may still send after it doesn't skip the writing
  const dragged = useRef(false);
  // the way the next letter comes in, set by a swipe that turned (+1: from the right, the finger going left)
  const arrive = useRef<0 | 1 | -1>(0);
  const onTouchStart = (e: TouchEvent) => {
    dragged.current = false;
    const el = sheetRef.current;
    // a second finger: a pinch, not a turn
    if (e.touches.length !== 1) { if (swipe.current?.on && el) settle(el); swipe.current = null; return; }
    const f = e.touches[0];
    // zoomed in, a sideways drag is someone looking closer; from the screen's very edges it's the browser's own back
    // and forward
    if ((window.visualViewport?.scale ?? 1) > 1.01 || f.clientX < SWIPE.edge || f.clientX > window.innerWidth - SWIPE.edge) { swipe.current = null; return; }
    swipe.current = { x: f.clientX, y: f.clientY, t: e.timeStamp, base: 0, on: null, trail: [] };
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = swipe.current, el = sheetRef.current;
    if (!s || !el) return;
    if (e.touches.length !== 1) { if (s.on) settle(el); swipe.current = null; return; }
    const f = e.touches[0];
    const dx = f.clientX - s.x, dy = f.clientY - s.y;
    if (s.on === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE.engage) return;
      // sideways: the letter's to turn; otherwise the page is scrolling, and the rest of this touch is left to it
      s.on = Math.abs(dx) > Math.abs(dy) * SWIPE.axis;
      if (!s.on) return;
      dragged.current = true;
      if (!reducedMotion()) {
        s.base = catchMotion(el);
        el.style.willChange = 'translate';
      }
    }
    if (!s.on) return;
    s.trail.push({ x: f.clientX, t: e.timeStamp });
    while (s.trail.length > 2 && e.timeStamp - s.trail[0].t > 100) s.trail.shift();
    if (!reducedMotion()) el.style.translate = `${s.base + pull(dx)}px 0px`;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = swipe.current, el = sheetRef.current;
    swipe.current = null;
    if (!s?.on || !el) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const ms = Math.max(1, e.timeStamp - s.t);
    // the last tenth of a second: a finger heading back the other way is taking the turn back
    const a = s.trail[0], b = s.trail[s.trail.length - 1];
    const recent = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : dx / ms;
    const takenBack = Math.sign(recent) === -Math.sign(dx) && Math.abs(recent) > SWIPE.flick;
    const d: 1 | -1 = dx < 0 ? 1 : -1;
    const turns = !takenBack && (Math.abs(dx) > SWIPE.turn || Math.abs(dx) / ms > SWIPE.flick)
      && (window.visualViewport?.scale ?? 1) <= 1.01 && !!neighbour(d);
    if (!turns) { settle(el); return; }
    arrive.current = d;
    turn(d);
  };
  const onTouchCancel = () => {
    const el = sheetRef.current;
    if (swipe.current?.on && el) settle(el);
    swipe.current = null;
  };
  const onSheetClick = () => {
    if (dragged.current) { dragged.current = false; return; }
    setFinish((n) => n + 1);
  };
  // the next letter, after a swipe: in from the side the finger was heading (reduced motion: it fades in where it is),
  // and then it's written out as ever
  useLayoutEffect(() => {
    const d = arrive.current, el = sheetRef.current;
    arrive.current = 0;
    if (!d || !el) return;
    for (const a of el.getAnimations()) a.cancel();
    el.style.translate = '';
    el.style.opacity = '';
    const ease = motionToken('--ease-out', 'cubic-bezier(0.23, 1, 0.32, 1)');
    const run = reducedMotion()
      ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: ease })
      : el.animate([{ translate: `${24 * d}px 0px`, opacity: 0 }, { translate: '0px 0px', opacity: 1 }], { duration: 240, easing: ease });
    run.onfinish = () => { el.style.willChange = ''; };
  }, [letter?.id]);

  // a new letter: screen readers start at its title
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [letter?.id]);

  // the tab, and the page's description while this letter is open (naming-and-copy §2.11); link previews can't
  // follow (they read letters.html's own tags), so they show All letters
  useEffect(() => {
    if (!letter) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const before = meta?.content;
    document.title = `${letter.title ?? 'A letter'} · ${APP_NAME}`;
    meta?.setAttribute('content', letterDescription(letter));
    return () => {
      document.title = `All letters · ${APP_NAME}`;
      if (meta && before != null) meta.setAttribute('content', before);
    };
  }, [letter]);

  // ---------- actions ----------
  const go = (hash: string, replace = false) => {
    if (replace) {
      history.replaceState(null, '', hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else window.location.hash = hash;
  };
  const newHand = () => go(letterHash(id, randomHand(), keep), true);
  // "this hand", exactly: a chosen hand as it is, or this letter's own hand (thisHand, above)
  const setKeep = (on: boolean) => go(letterHash(id, on ? thisHand : hand, on), true);
  const another = () => {
    if (!letters?.length) return;
    const others = letters.filter((l) => l.id !== id && l.origin === (letter?.origin ?? 'found'));
    const next = others[randomIndex(others.length)] ?? letters[0];
    go(letterHash(next.id, keep ? thisHand : null, keep));
  };
  // the link opens this letter in this hand (a letter's own hand needs no more than its id)
  const shareUrl = () => {
    const u = new URL(ARCHIVE_URL, window.location.href);
    u.hash = letterHash(id, hand);
    return u.toString();
  };
  const share = async () => {
    const url = shareUrl();
    const ok = await copyText(url);
    const title = `${letter?.title ?? 'A letter'} – ${APP_NAME}`;
    if (coarse && canShareLinks()) { await shareLink(url, title); return; }
    // the desk's toasts (App.tsx): a success with its icon, an error with its own
    const action = canShareLinks() ? { label: 'Share…', onClick: () => shareLink(url, title) } : undefined;
    if (ok) toast.success('Link copied', { id: 'share', description: 'It opens this letter in this hand.', action });
    else toast.error('Couldn’t copy the link', { id: 'share', description: url, action });
  };
  const [saving, setSaving] = useState(false);
  // the letter as text, open or folded (the dock's "Read as text" opens it)
  const [textOpen, setTextOpen] = useState(false);
  const download = async () => {
    if (!ready || !r || !letter) return;
    setSaving(true);
    try {
      const { blob, width, height } = await renderLiveNote(ready.live, ready.extras, r.inkKey ?? 'currentColor', r.inkColor, pxPerMm || 2);
      const file = `${APP_NAME} – ${letter.title ?? letter.id}`;
      // the desk's words and toasts (App.tsx): "Image downloaded" with its icon, or a fresh tap to save it
      const description = `JPEG, ${width} × ${height} px`;
      const done = (res: string) => { if (res === 'saved') toast.success('Image downloaded', { id: 'download', description }); };
      const result = await saveNote(blob, file, coarse);
      if (result === 'needs-tap') {
        toast('Your image is ready', {
          id: 'download',
          description,
          action: { label: 'Save image', onClick: () => void saveNote(blob, file, true).then(done) },
          duration: 10000,
        });
      } else done(result);
    } catch (e) {
      console.error(e);
      toast.error('Couldn’t make the image', { id: 'download', description: 'Something went wrong while it was being made. Try again in a moment.' });
    } finally {
      setSaving(false);
    }
  };

  if (!letters || !letter || !look || !r) {
    return (
      <div className="min-h-dvh">
        <SiteHeader current="letters" inside hrefs={{ letters: backHref }} />
        <main className="mx-auto max-w-[1180px] px-4 pt-28 sm:px-8 lg:px-10">
          {error ? (
            <Missing title="The letters didn’t load" action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}>Check your connection, then try again.</Missing>
          ) : letters ? (
            <Missing title="This letter isn’t in the collection" action={<Button variant="secondary" asChild><a href={backHref}>See all letters</a></Button>}>
              The link may be mistyped, or the letter may have been taken out of the collection.
            </Missing>
          ) : null}
        </main>
      </div>
    );
  }

  const sheetH = r.paper.h * pxPerMm;
  const sheet = (
    <div
      ref={sheetRef}
      className="flex touch-pan-y touch-pinch-zoom flex-col items-center"
      onClick={onSheetClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      role="img"
      aria-label={`The letter, written out by hand on ${paperWords(r.paper.name)}`}
    >
      {/* a sent letter: no guide sheet under the paper */}
      <PaperGuide value={false}>
        {/* worn as this letter is everywhere (its card, the desk) */}
        <PaperLetter value={letter ? { id: letter.id, year: letter.year } : null}>
        {pxPerMm > 0 && (ready ? (
          <ReaderSheets live={ready.live} extras={ready.extras} inkKey={r.inkKey} ink={r.inkColor} pxPerMm={pxPerMm} gapPx={SHEET_GAP} token={token} finishToken={finish} />
        ) : (
          <div className="relative isolate shrink-0 rounded-[1.5px]" style={{ width: r.paper.w * pxPerMm, height: sheetH, boxShadow: sheetShadow(r.paper) }}>
            <PaperCanvas paper={r.paper} pxPerMm={pxPerMm} className="absolute inset-0 rounded-[1.5px]" />
          </div>
        ))}
        </PaperLetter>
      </PaperGuide>
    </div>
  );
  const handMenu = (
    <div className="mt-4 flex justify-center">
      <HandMenu name={name} keep={keep} onKeep={setKeep} onNewHand={newHand} onReplay={() => { setFinish(0); setToken((n) => n + 1); }} canReplay={!!ready} />
    </div>
  );
  const editorial = <Editorial letter={letter} name={name} textOpen={textOpen} onText={setTextOpen} centred={DETAIL === '2'} />;
  const turnProps = { at, total: at >= 0 ? list.length : 0, prev: neighbour(-1), next: neighbour(1), onPrev: () => turn(-1), onNext: () => turn(1) };
  return (
    <div className="min-h-dvh">
      {/* the Reading Room's spread: the counter is the running head's middle (on phones the slip dock carries it) */}
      <SiteHeader
        current="letters" inside hrefs={{ letters: backHref }}
        centre={spread ? <LetterCounter id={id} turn={turnProps} /> : undefined}
      />
      {LOOK === 'reading-room' ? (
        // the Reading Room: the letter as a spread (ReadingSpread.tsx, the layout study's proposal 3)
        <ReadingSpread
          letter={letter} name={name} hand={look.seed} sheet={sheet} colRef={colRef} titleRef={titleRef} pxPerMm={pxPerMm}
          paper={r.paper} sheets={ready?.live.sheets.length ?? 1} frameH={fitH ? r.paper.h * pxPerMm : null} gap={SHEET_GAP}
          keep={keep} onKeep={setKeep} onNewHand={newHand} onReplay={() => { setFinish(0); setToken((n) => n + 1); }} canReplay={!!ready}
          onShare={share} onImage={download} imageReady={!!ready && !saving} onRandom={another} reply={replyHref(letter, look, replier)}
          turn={turnProps}
        />
      ) : DETAIL === '1' ? (
        // 1 side by side: the letter on the left, the reading on the right (above it on phones)
        <main className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-x-16 px-4 pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-36 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:grid-rows-[auto_1fr] lg:px-10 lg:pt-24">
          <div className="pb-7 lg:col-start-2 lg:row-start-1 lg:pb-8">
            <TitleBlock letter={letter} titleRef={titleRef} />
          </div>
          <div ref={colRef} className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {sheet}
            {handMenu}
          </div>
          <div className="mt-10 min-w-0 lg:col-start-2 lg:row-start-2 lg:mt-0">{editorial}</div>
        </main>
      ) : (
        // 2 letter first: one column, like a feature: title, the letter, then the story and the record
        <main className="mx-auto w-full max-w-[860px] px-4 pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-36 sm:px-8 lg:pt-24">
          <TitleBlock letter={letter} titleRef={titleRef} centred />
          <div ref={colRef} className="mt-9 min-w-0 sm:mt-11">
            {sheet}
            {handMenu}
          </div>
          <div className="mt-12 sm:mt-14">{editorial}</div>
        </main>
      )}
      {/* look C (?look=postmarked): the letter arrives in its envelope */}
      {LOOK === 'postmarked' && <LetterArrival letter={letter} />}
      {/* the Reading Room's spread has no dock on desktop: its counter is in the header, its actions on the page */}
      {!spread && <Dock
        id={id}
        reply={replyHref(letter, look, replier)}
        prev={neighbour(-1) ? { title: neighbour(-1)!.title ?? 'A letter' } : null}
        next={neighbour(1) ? { title: neighbour(1)!.title ?? 'A letter' } : null}
        at={at}
        total={at >= 0 ? list.length : 0}
        onPrev={() => turn(-1)}
        onNext={() => turn(1)}
        onNewHand={newHand}
        onShare={share}
        onImage={download}
        imageReady={!!ready && !saving}
        onRandom={another}
        onCite={() => void copyCitation(letter, marksOf(letter.id)?.no)}
        onText={() => {
          setTextOpen(true);
          requestAnimationFrame(() => document.querySelector('.ed-transcript, .sp-text')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
        }}
      />}
    </div>
  );
}

