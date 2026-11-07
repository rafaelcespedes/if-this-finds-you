// Share: the note as a picture to post (share.ts makes it). A preview, its shape, then Post on X, Copy image, Save.
// X's post link can fill in words and a link but can't carry a picture, so Post on X is two moves made one: on a phone
// the share sheet with the picture in it (pick X); on a computer the picture goes on the clipboard and X's post box
// opens with the words in, for a ⌘V. Made on this device; the post links to the writing page, not to the note.
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { toast } from 'sonner';
import { Copy, Download, X } from 'lucide-react';
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
  /** the note's sheets, painted (asked for each time it opens: the note may have changed) */
  sheets: () => Promise<SheetShot[]>;
  writer: string;
  fileName: string;
  coarse: boolean;
  mod: string;
}

export function ShareDialog({ open, onOpenChange, sheets, writer, fileName, coarse, mod }: Props) {
  const [shape, setShapeNow] = useState<ShareShape>(() => {
    try { const s = localStorage.getItem(SHAPE_KEY); return SHARE_SHAPES.some((x) => x.id === s) ? (s as ShareShape) : 'square'; } catch { return 'square'; }
  });
  const setShape = (s: ShareShape) => { setShapeNow(s); try { localStorage.setItem(SHAPE_KEY, s); } catch { /* not kept */ } };
  const [shots, setShots] = useState<SheetShot[] | null>(null);
  const [pic, setPic] = useState<{ blob: Blob; url: string; shape: ShareShape } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // the sheets, painted once each time it opens
  useEffect(() => {
    if (!open) { setShots(null); return; }
    let live = true;
    setFailed(null);
    sheets().then((s) => { if (live) setShots(s); }, (e) => { if (live) setFailed(String((e as Error)?.message ?? e)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // the picture for the shape
  useEffect(() => {
    if (!shots) return;
    let live = true;
    sharePicture(shots, shape, writer)
      .then(toPng)
      .then((blob) => {
        if (!live) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPic({ blob, url, shape });
      }, (e) => { if (live) setFailed(String((e as Error)?.message ?? e)); });
    return () => { live = false; };
  }, [shots, shape, writer]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const ready = !!pic && pic.shape === shape;
  const file = () => new File([pic!.blob], `${fileSafe(fileName || 'Note')}.png`, { type: 'image/png' });
  // a phone's share sheet, with the picture in it (null where there isn't one that takes files)
  const sheetFile = () => {
    if (!coarse || typeof navigator.canShare !== 'function') return null;
    const f = file();
    return navigator.canShare({ files: [f] }) ? f : null;
  };
  const viaSheet = (f: File) =>
    navigator.share({ files: [f], text: `${POST_TEXT} · ${SHARE_ADDRESS}` }).then(() => true, () => false);
  // the clipboard write starts inside the press (Safari wants that), with nothing awaited before it
  const copy = () => navigator.clipboard.write([new ClipboardItem({ 'image/png': pic!.blob })]).then(() => true, () => false);

  const post = () => {
    if (!ready) return;
    const f = sheetFile();
    if (f) { void viaSheet(f).then((shared) => { if (shared) onOpenChange(false); }); return; }
    const copying = copy();
    window.open(xIntent(POST_TEXT), '_blank', 'noopener,noreferrer');
    void copying.then((copied) => toast(copied ? `Image copied. In X, press ${mod}V to add it.` : 'X is open. Save the image and add it to your post.', { id: 'share-x', duration: 8000 }));
  };
  const copyImage = () => {
    if (!ready) return;
    void copy().then((ok) => toast(ok ? 'Image copied' : 'This browser won’t copy images. Save it instead.', { id: 'share-copy', duration: 3000 }));
  };
  const save = () => {
    if (!ready) return;
    const f = sheetFile();
    if (f) { void viaSheet(f); return; }
    saveBlob(pic!.blob, `${fileSafe(fileName || 'Note')}.png`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wr-dialog-scrim" />
        <Dialog.Content className="wr-dialog wr-share" aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
          <div className="wr-share-preview" data-shape={shape}>
            {ready ? <img src={pic!.url} alt="The picture to share" /> : <span className="wr-share-wait">{failed ?? 'Making the picture…'}</span>}
          </div>
          <div className="wr-share-side">
            <div className="wr-dialog-head">
              <Dialog.Title>Share this note</Dialog.Title>
              <Dialog.Close className="wr-icon" aria-label="Close"><X aria-hidden /></Dialog.Close>
            </div>
            <div>
              <h3 className="wr-share-label" id="share-shape">Shape</h3>
              <div className="wr-seg" role="radiogroup" aria-labelledby="share-shape">
                {SHARE_SHAPES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={shape === s.id} className="wr-seg-item" onClick={() => setShape(s.id)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="wr-share-actions">
              <button type="button" className="wr-share-post" disabled={!ready} onClick={post}><XMark /> Post on X</button>
              <div className="wr-share-row">
                <button type="button" className="wr-btn" disabled={!ready} onClick={copyImage}><Copy aria-hidden /> Copy image</button>
                <button type="button" className="wr-btn" disabled={!ready} onClick={save}><Download aria-hidden /> Save</button>
              </div>
            </div>
            <p className="wr-share-note">Made on this device. Nothing is uploaded: the post links to the writing page, not to your note.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
