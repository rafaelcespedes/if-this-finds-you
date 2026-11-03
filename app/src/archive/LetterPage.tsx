// A letter: the whole letter on paper in its hand, written out in front of you when it opens (the tool's reader:
// the engine's timeline + playSVG, about 3x a real hand, a tap finishes it), what is known about it, and what you
// can do with it: write a reply, turn to the next one, share it, keep it as an image.
// Loaded on demand (its own chunk, with the engine); the index never waits for it.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, Link2, PenLine, RefreshCw, RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaperCanvas, PaperGuide } from '@/components/PaperCanvas';
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
import { clamp, cn } from '@/lib/utils';
import { cards } from './cards';
import { circumstanceLabel, filterLetters, fromTo, opening } from './data';
import type { ArchiveLetter, Look } from './model';
import { lookFor, renderingOf } from './look';
import { indexHash, letterHash, randomHand, randomIndex, type Filters } from './route';
import { ARCHIVE_URL, headerLink, SiteHeader, toolHref } from './SiteHeader';

const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;

/** The look's slider values as the tool's seed-relative offsets (lib/controls.ts), so the tool draws the same hand. */
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

  // the sheet fills its column, up to about real size on a laptop
  const colRef = useRef<HTMLDivElement>(null);
  const colW = useElementWidth(colRef);
  const pxPerMm = r && colW ? Math.min(MAX_PX_PER_MM, colW / r.paper.w) : 0;

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
      if (e.key === 'Escape') { back(); return; }
      const t = e.target as HTMLElement | null;
      const typing = t && /^(input|textarea|select)$/i.test(t.tagName) && (t as HTMLInputElement).type !== 'checkbox';
      if (!typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); turn(e.key === 'ArrowLeft' ? -1 : 1); return; }
      setFinish((n) => n + 1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [back, turn]);

  // phones: a sideways swipe on the letter turns to the next or previous one; a tap still finishes the writing
  const swipe = useRef<{ x: number; y: number; turned: boolean } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) { swipe.current = null; return; }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, turned: false };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s0 = swipe.current;
    if (!s0) return;
    const dx = e.changedTouches[0].clientX - s0.x, dy = e.changedTouches[0].clientY - s0.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) { s0.turned = true; turn(dx < 0 ? 1 : -1); }
  };
  const onSheetClick = () => {
    if (swipe.current?.turned) { swipe.current = null; return; }
    setFinish((n) => n + 1);
  };

  // a new letter: screen readers start at its title
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [letter?.id]);

  useEffect(() => {
    if (letter) document.title = `${letter.title ?? 'A letter'} – ${APP_NAME}`;
    return () => { document.title = `All letters – ${APP_NAME}`; };
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
    toast(ok ? 'Link copied' : 'Couldn’t copy the link', {
      id: 'share',
      description: ok ? 'It opens this letter in this hand.' : url,
      action: canShareLinks() ? { label: 'Share…', onClick: () => shareLink(url, title) } : undefined,
    });
  };
  const [saving, setSaving] = useState(false);
  const download = async () => {
    if (!ready || !r || !letter) return;
    setSaving(true);
    try {
      const { blob } = await renderLiveNote(ready.live, ready.extras, r.inkKey ?? 'currentColor', r.inkColor, pxPerMm || 2);
      const file = `${APP_NAME} – ${letter.title ?? letter.id}`;
      const result = await saveNote(blob, file, coarse);
      if (result === 'saved') toast('Image saved', { id: 'download', description: 'A JPEG of the letter as shown.' });
      else if (result === 'needs-tap') toast('The image is ready', { id: 'download', action: { label: 'Save', onClick: () => saveNote(blob, file, true) } });
    } catch (e) {
      toast('The image couldn’t be made', { id: 'download', description: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!letters || !letter || !look || !r) {
    return (
      <div className="min-h-dvh">
        <SiteHeader>
          <a href={backHref} className={`${headerLink} font-medium text-foreground/80`}>All letters</a>
        </SiteHeader>
        <main className="mx-auto max-w-[1180px] px-4 pt-28 sm:px-8 lg:px-10">
          {error ? (
            <Missing title="The letters didn’t load." action={<Button variant="outline" onClick={onRetry}>Try again</Button>}>Check your connection, then try again.</Missing>
          ) : letters ? (
            <Missing title="This letter isn’t in the library." action={<Button variant="outline" asChild><a href={backHref}>See all letters</a></Button>}>
              The link may be mistyped, or the letter may have been taken out of the collection.
            </Missing>
          ) : null}
        </main>
      </div>
    );
  }

  const sheetH = r.paper.h * pxPerMm;
  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <a href={backHref} className={`${headerLink} font-medium text-foreground/80`}>All letters</a>
        {list.length > 1 && at >= 0 && (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={() => turn(-1)} aria-label={`Previous letter: ${neighbour(-1)?.title ?? ''}`} className="size-8 text-muted-foreground pointer-coarse:size-11">
              <ChevronLeft aria-hidden />
            </Button>
            <span className="min-w-[4.5rem] text-center tabular" aria-label={`Letter ${at + 1} of ${list.length}`}>{at + 1} of {list.length}</span>
            <Button variant="ghost" size="icon" onClick={() => turn(1)} aria-label={`Next letter: ${neighbour(1)?.title ?? ''}`} className="size-8 text-muted-foreground pointer-coarse:size-11">
              <ChevronRight aria-hidden />
            </Button>
          </div>
        )}
      </SiteHeader>
      <main className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-x-14 px-4 pt-[calc(4.5rem+env(safe-area-inset-top,0px))] pb-28 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:grid-rows-[auto_1fr] lg:px-10 lg:pt-16">
        {/* title: above the sheet on phones, beside it on wide screens */}
        <header className="pt-2 pb-5 lg:col-start-2 lg:row-start-1 lg:pt-8 lg:pb-6">
          <p className="text-[12.5px] text-[var(--ink-soft)]">{circumstanceLabel(letter)}</p>
          <h1 ref={titleRef} tabIndex={-1} className="font-letter mt-1.5 text-[calc(28px*var(--letter-scale))] leading-[1.1] font-normal tracking-[-0.012em] text-foreground text-balance outline-none sm:text-[calc(33px*var(--letter-scale))]">
            {letter.title ?? opening(letter.text, 60)}
          </h1>
          <p className="mt-2 text-[14.5px] leading-[1.45] text-muted-foreground text-pretty">{fromTo(letter)}</p>
        </header>

        <div ref={colRef} className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:pt-8">
          <div
            className="flex touch-pan-y flex-col items-center"
            onClick={onSheetClick}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            role="img"
            aria-label={`The letter, written out by hand on ${r.paper.name.toLowerCase()} paper`}
          >
            {/* a sent letter: no guide sheet under the paper */}
            <PaperGuide value={false}>
              {pxPerMm > 0 && (ready ? (
                <ReaderSheets live={ready.live} extras={ready.extras} inkKey={r.inkKey} ink={r.inkColor} pxPerMm={pxPerMm} gapPx={SHEET_GAP} token={token} finishToken={finish} />
              ) : (
                <div className="relative isolate shrink-0 rounded-[1.5px]" style={{ width: r.paper.w * pxPerMm, height: sheetH, boxShadow: sheetShadow(r.paper) }}>
                  <PaperCanvas paper={r.paper} pxPerMm={pxPerMm} className="absolute inset-0 rounded-[1.5px]" />
                </div>
              ))}
            </PaperGuide>
          </div>

          <div className="mx-auto mt-5 flex max-w-[640px] flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
            <span>In {name}’s hand</span>
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={newHand}>
                <RefreshCw aria-hidden /> New hand
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setFinish(0); setToken((n) => n + 1); }} disabled={!ready}>
                <RotateCcw aria-hidden /> Replay
              </Button>
            </span>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 select-none pointer-coarse:py-2.5">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-3.5 accent-[var(--ink)]" />
              Keep this hand
            </label>
          </div>
          <Transcript letter={letter} />
        </div>

        <aside className="provenance mt-10 min-w-0 lg:col-start-2 lg:row-start-2 lg:mt-0">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Button size="lg" asChild className="sm:col-span-2 lg:col-span-1">
              <a href={replyHref(letter, look, replier)}>
                <PenLine aria-hidden /> Write a reply
              </a>
            </Button>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2 lg:col-span-1">
              <Button variant="outline" onClick={another} className="px-2">
                <Shuffle aria-hidden /> <span className="truncate">Another</span><span className="sr-only"> letter</span>
              </Button>
              <Button variant="outline" onClick={share} className="px-2">
                <Link2 aria-hidden /> Share
              </Button>
              <Button variant="outline" onClick={download} disabled={!ready || saving} className="px-2">
                <Download aria-hidden /> <span className="truncate">{saving ? 'Saving…' : 'Image'}</span><span className="sr-only"> download</span>
              </Button>
            </div>
          </div>

          <Provenance letter={letter} />

          <p className="mt-6 border-t border-border pt-4 text-[12.5px] leading-[1.5] text-faint text-pretty">
            The words are the original writer’s. The handwriting is not: {name} is a fictional writer, and every hand here is drawn fresh.
          </p>
        </aside>
      </main>
    </div>
  );
}

/** Who, to whom, where, when, the story, the source and the rights: the curator's record, as it is. */
function Provenance({ letter }: { letter: ArchiveLetter }) {
  const f = letter.found;
  const [rightsOpen, setRightsOpen] = useState(false);
  const lang = useMemo(() => {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(letter.lang) ?? letter.lang; } catch { return letter.lang; }
  }, [letter.lang]);
  const rights = f?.rights;
  const rightsLine = rights?.us && rights?.eu ? 'Public domain in the US and the EU' : rights?.us ? 'Public domain in the US' : rights?.eu ? 'Public domain in the EU' : f?.source?.licence ?? '';
  return (
    <div className="mt-8">
      {f?.story && <p className="font-letter text-[calc(16px*var(--letter-scale))] leading-[1.6] text-foreground/90 text-pretty">{f.story}</p>}
      <dl className="mt-6 grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3 text-[13.5px] leading-[1.5]">
        {letter.author && <Row term="Written by">{letter.author}{f?.heritage && <span className="block text-muted-foreground">{f.heritage}</span>}</Row>}
        {letter.recipient && <Row term="To">{letter.recipient}</Row>}
        {letter.place && <Row term="From">{letter.place}</Row>}
        {letter.year != null && <Row term="When"><span className="tabular">{letter.year}</span>{f?.dateNote && <span className="block text-muted-foreground">{f.dateNote}</span>}</Row>}
        <Row term="Language">{lang}</Row>
        {f?.translator && <Row term="Translated by">{f.translator.url ? <a href={f.translator.url} target="_blank" rel="noreferrer">{f.translator.name}</a> : f.translator.name}</Row>}
        {f?.source && (
          <Row term="Source">
            {f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer" className="break-words">{f.source.name}</a> : f.source.name}
          </Row>
        )}
        {(rightsLine || rights?.basis) && (
          <Row term="Rights">
            {rightsLine}
            {rights?.basis && (
              <>
                {' '}
                <button type="button" aria-expanded={rightsOpen} onClick={() => setRightsOpen((o) => !o)} className="text-muted-foreground underline decoration-[#cfc8b9] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground">
                  {rightsOpen ? 'Less' : 'How we know'}
                </button>
                {rightsOpen && <span className="mt-1.5 block text-[12.5px] text-muted-foreground">{rights.basis}</span>}
              </>
            )}
          </Row>
        )}
      </dl>
    </div>
  );
}

/**
 * The letter as plain text. Screen readers always have it (the sheet is a picture of it); anyone can open it, for
 * hands that are hard to read.
 */
function Transcript({ letter }: { letter: ArchiveLetter }) {
  const [open, setOpen] = useState(false);
  const paras = letter.text.split(/\n{2,}/);
  return (
    <div className="mx-auto mt-2 flex max-w-[34rem] flex-col items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="transcript"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md py-1 text-[13.5px] text-foreground/85 underline decoration-[#cfc8b9] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-2.5"
      >
        {open ? 'Hide the text' : 'Read it as text'}
      </button>
      <div id="transcript" lang={letter.lang} className={cn(open ? 'font-letter mt-4 grid w-full gap-3 text-[calc(17px*var(--letter-scale))] leading-[1.65] whitespace-pre-line text-foreground/90' : 'sr-only')}>
        {paras.map((para, i) => <p key={i}>{para}</p>)}
      </div>
    </div>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-letter min-w-0 text-[calc(14.5px*var(--letter-scale))] leading-[1.45] text-foreground/90">{children}</dd>
    </>
  );
}

function Missing({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cn('flex max-w-[30rem] flex-col items-start gap-3 py-10')}>
      <h1 className="text-[22px] font-medium tracking-[-0.015em] text-foreground">{title}</h1>
      <p className="text-[14px] leading-[1.55] text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
