// Share: the note as a picture to post (share.ts makes it). A preview, its shape, then Post on X, Copy picture, Save.
// X's post link can fill in words and a link but can't carry a picture, so Post on X is two moves made one: on a phone
// the share sheet with the picture in it (pick X); on a computer the picture is copied and X's post box opens with the
// words in, to paste it into. Made on this device and kept nowhere; the post links to the writing page, not the note.
//
// Each opening starts clean: the pictures belong to the note as it is now, never to the note shared before (a stale
// one was briefly postable, QA 7 Nov). While a shape's picture is made, the last one stays, dimmed, and can't be used.
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { toast } from 'sonner';
import { Copy, Download, X } from 'lucide-react';
import { PhoneSheet } from '@/components/ui/sheet';
import { Button, Keys, Segmented, tip, useDone } from './controls';
import type { SheetShot } from '@/lib/actions';
import { fileSafe, saveBlob } from '@/lib/utils';
import { SHARE_ADDRESS, SHARE_SHAPES, sharePicture, toPng, xIntent, type ShareShape } from './share';

const SHAPE_KEY = 'seedhand:write:share-shape';
const POST_TEXT = 'Written by hand';

/** X's mark (the letter X as X draws it), for its button */
function XMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="wr-x-mark">
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the note's first sheet, painted, and how many sheets it has (asked for each time it opens) */
  sheets: () => Promise<{ shots: SheetShot[]; total: number }>;
  /** the note has no words yet */
  blank: () => boolean;
  writer: string;
  fileName: string;
  coarse: boolean;
  mod: string;
  /** a phone: a sheet from the bottom, as More is, instead of a window in the middle */
  sheet?: boolean;
}
type Pic = { blob: Blob; url: string };

export function ShareDialog({ open, onOpenChange, sheets, blank, writer, fileName, coarse, mod, sheet }: Props) {
  const [shape, setShapeNow] = useState<ShareShape>(() => {
    try { const s = localStorage.getItem(SHAPE_KEY); return SHARE_SHAPES.some((x) => x.id === s) ? (s as ShareShape) : 'square'; } catch { return 'square'; }
  });
  const [source, setSource] = useState<{ shot: SheetShot; total: number } | null>(null);
  const [pics, setPics] = useState<Partial<Record<ShareShape, Pic>>>({});
  const [last, setLast] = useState<Pic | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const setShape = (s: ShareShape) => { setShapeNow(s); setFailed(null); try { localStorage.setItem(SHAPE_KEY, s); } catch { /* not kept */ } };
  const urls = useRef<string[]>([]);
  // Copied and Saved: said on the button itself, for a moment
  const [copied, flashCopied] = useDone();
  const [saved, flashSaved] = useDone();
  const forget = () => { for (const u of urls.current.splice(0)) URL.revokeObjectURL(u); };

  // each opening: nothing from before, then the note's first sheet, painted
  useEffect(() => {
    setSource(null); setPics({}); setLast(null); setFailed(null); setEmpty(false); forget();
    if (!open) return;
    if (blank()) { setEmpty(true); return; }
    let live = true;
    sheets().then(
      (s) => {
        if (!live) return;
        if (!s.shots[0]?.ink) { setFailed('The picture couldn’t be made.'); return; }
        setSource({ shot: s.shots[0], total: s.total });
      },
      () => { if (live) setFailed('The picture couldn’t be made.'); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => forget, []);

  // the picture for the shape, made once per opening
  useEffect(() => {
    if (!source || empty || pics[shape]) return;
    let live = true;
    sharePicture(source.shot, shape, writer)
      .then(toPng)
      .then((blob) => {
        if (!live) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setPics((p) => ({ ...p, [shape]: { blob, url } }));
        setLast({ blob, url });
      }, () => { if (live) setFailed('The picture couldn’t be made.'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, shape]);

  const pic = pics[shape] ?? null;
  const ready = !!pic && !empty;
  const shown = pic ?? last;
  const name = `${fileSafe(fileName || 'Note')}.png`;
  const file = () => new File([pic!.blob], name, { type: 'image/png' });
  // a phone's share sheet, with the picture in it (null where there isn't one that takes files)
  const sheetFile = () => {
    if (!coarse || typeof navigator.canShare !== 'function') return null;
    const f = file();
    return navigator.canShare({ files: [f] }) ? f : null;
  };
  const copy = () => navigator.clipboard.write([new ClipboardItem({ 'image/png': pic!.blob })]).then(() => true, () => false);

  const post = async () => {
    if (!ready) return;
    const f = sheetFile();
    if (f) {
      try { await navigator.share({ files: [f], text: `${POST_TEXT} · ${SHARE_ADDRESS}` }); onOpenChange(false); } catch { /* cancelled */ }
      return;
    }
    // the copy first, while this page has the focus; then X's post box
    const copied = await copy();
    const x = window.open(xIntent(POST_TEXT), '_blank');
    if (x) x.opener = null;
    toast(copied ? 'Picture copied' : 'The picture couldn’t be copied', {
      id: 'share-x',
      description: copied ? `Paste it into your post on X (${mod}V).` : 'Save it, then add it to your post on X.',
      duration: 8000,
      ...(x ? {} : { action: { label: 'Open X', onClick: () => window.open(xIntent(POST_TEXT), '_blank', 'noopener,noreferrer') } }),
    });
  };
  const copyPicture = async () => {
    if (!ready) return;
    const ok = await copy();
    if (ok) flashCopied();
    else toast('This browser won’t copy pictures', { id: 'share-copy', description: 'Save it instead.', duration: 3000 });
  };
  const save = async () => {
    if (!ready) return;
    const f = sheetFile();
    if (f) {
      try { await navigator.share({ files: [f], title: fileName || 'Note' }); flashSaved(); return; } catch (e) {
        const n = (e as DOMException).name;
        if (n === 'AbortError') return;
        if (n === 'NotAllowedError') { toast('Tap Save again', { id: 'share-save' }); return; }
      }
    }
    saveBlob(pic!.blob, name);
    flashSaved();
  };

  const status = failed ?? (empty ? 'Nothing written yet.' : null);
  const preview = (
    <div className="wr-share-preview" data-shape={shape}>
      {status ? <span className="wr-share-wait">{status}</span>
        : shown ? <img src={shown.url} alt={ready ? 'The picture to share' : ''} data-making={ready ? undefined : ''} />
          : <span className="wr-share-wait">Making the picture…</span>}
    </div>
  );
  const choices = (
    <>
      <div>
        <h3 className="wr-share-label" id="share-shape">Shape</h3>
        <Segmented<ShareShape> aria-labelledby="share-shape" cols={SHARE_SHAPES.length} value={shape} onChange={setShape} options={SHARE_SHAPES.map((s) => ({ value: s.id, label: s.label }))} />
        {source && source.total > 1 && <p className="wr-share-hint">Page {source.shot.sheet + 1} of {source.total}.</p>}
      </div>
      <div className="wr-share-actions">
        <Button variant="primary" className="wr-share-post" disabled={!ready} onClick={post} icon={<XMark />}>Post on X</Button>
        <p className="wr-share-hint">{coarse ? 'Opens the share sheet with the picture in it: choose X.' : <>Copies the picture and opens X. Paste it into your post <Keys keys={[mod.replace(/\+$/, ''), 'V']} />.</>}</p>
        <div className="wr-share-row">
          <Button disabled={!ready} onClick={copyPicture} icon={<Copy aria-hidden />} done={copied} doneLabel="Copied">Copy picture</Button>
          <Button disabled={!ready} onClick={save} icon={<Download aria-hidden />} done={saved} doneLabel="Saved">Save</Button>
        </div>
      </div>
      <p className="wr-share-note">Made on this device, and we keep no copy. The post links to the writing page, not to your note.</p>
    </>
  );

  // a phone: a sheet from the bottom, as More is (Rafael, 7 Nov); its title is the sheet's, and a swipe down closes it
  if (sheet) {
    return (
      <PhoneSheet title="Share this note" open={open} onOpenChange={onOpenChange}>
        <div className="wr-share-sheet">
          {preview}
          <div className="wr-share-side">{choices}</div>
        </div>
      </PhoneSheet>
    );
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wr-dialog-scrim" />
        <Dialog.Content className="wr-dialog wr-share" aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
          {preview}
          <div className="wr-share-side">
            <div className="wr-dialog-head">
              <Dialog.Title>Share this note</Dialog.Title>
              <Dialog.Close className="wr-icon" aria-label="Close" {...tip('Close', ['esc'])}><X aria-hidden /></Dialog.Close>
            </div>
            {choices}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
