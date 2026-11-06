// A note in Clean: the hand used the way you'd use a font. Edit anything, anywhere; the words are laid out again in
// the writer's hand as you go, with no crossings-out (lib/live.ts, the letter desk's own live layout). ⌘B presses the
// words harder, ⌘U underlines them by hand. Switch the note back to Ink and it carries on in ink from here.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CAP, withOverrides } from '@engine';
import { toast } from 'sonner';
import { PaperEditor, type FormatCommand, type PaperEditorApi } from '@/components/PaperEditor';
import { LiveSheets } from '@/components/LiveSheets';
import { useElementWidth } from '@/hooks/useElementWidth';
import { cn } from '@/lib/utils';
import { UndoHistory, type Edit } from '@/lib/edits';
import { applyEdit, toggleMark, wordAt, type Mark } from '@/lib/doc';
import { engineGeometry, liveExtras, liveLayout, pageSetup } from '@/lib/live';
import { renderLiveNote } from '@/lib/actions';
import { getPaper } from '@/lib/papers';
import { inkColor } from '@/lib/inks';
import { effective, effectiveHand } from '@/lib/params';
import { handFor, placeholderFor } from '@/lib/request';
import { handOpts } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import type { DeskApi } from './Desk';
import { stateOf, type Note } from './notes';

const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;

interface Props {
  note: Note;
  coarse: boolean;
  onChange: (text: string, marks: Mark[]) => void;
  onTyped: () => void;
  onEditingChange?: (editing: boolean) => void;
  named?: boolean;
}

export const CleanDesk = forwardRef<DeskApi, Props>(function CleanDesk({ note, coarse, onChange, onTyped, onEditingChange, named = true }, ref) {
  const look = note.look;
  // a blank note just put on the desk settles into place (once, as it mounts)
  const [fresh] = useState(() => (note.mode === 'clean' ? !note.text : !note.ink) && Date.now() - note.created < 1500);
  const state = useMemo(() => stateOf(look), [look]);
  const natural = useMemo(() => handFor(state.seed, state.style, handOpts(state)), [state]);
  const eff = useMemo(() => effective(natural, state), [natural, state]);
  // Clean is a clean copy: the writer adds no slips of their own (the letter desk's Mistakes, at none)
  const p = useMemo(() => withOverrides(effectiveHand(natural, eff), { mistakes: 0 }) as typeof natural, [natural, eff]);
  const paper = getPaper(state.paper);
  const ink = inkColor(state.ink);
  const name = useMemo(() => writerName(state.seed), [state.seed]);
  const startCaret = useMemo(() => {
    const { opts } = pageSetup(p, paper, eff.size, eff.lineSpacing);
    return { sheet: 0, x: opts.marginLeft as number, y: opts.firstBaseline as number, line: 0 };
  }, [p, paper, eff.size, eff.lineSpacing]);

  const [doc, setDoc] = useState(() => ({ text: note.text ?? '', marks: note.marks ?? [], signed: false }));
  const docRef = useRef(doc);
  docRef.current = doc;
  const [editing, setEditing] = useState(false);
  const undoHistory = useMemo(() => new UndoHistory(), []);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onTypedRef = useRef(onTyped);
  onTypedRef.current = onTyped;
  const put = useCallback((next: typeof doc) => {
    docRef.current = next;
    setDoc(next);
    onChangeRef.current(next.text, next.marks);
  }, []);

  const live = useMemo(() => liveLayout(p, doc.text, paper, eff.size, eff.lineSpacing, false, !editing), [p, doc.text, paper, eff.size, eff.lineSpacing, editing]);
  const extras = useMemo(
    () => liveExtras(live, { marks: doc.marks, signed: false, writerName: name, placeholder: placeholderFor(state.paper), text: live.page.text }),
    [live, doc.marks, name, state.paper],
  );
  const geometry = useMemo(() => engineGeometry(live), [live]);

  const editor = useRef<PaperEditorApi>(null);
  const onEdit = useCallback((e: Edit) => {
    if (e.kind === 'undo') { onHistoryRef.current('undo'); return; }
    const before = docRef.current.text;
    const next = applyEdit(docRef.current, e);
    undoHistory.record(before, next.text, e);
    onTypedRef.current();
    put(next);
  }, [put, undoHistory]);
  const onHistory = useCallback((dir: 'undo' | 'redo') => {
    const cur = docRef.current.text;
    const e = dir === 'undo' ? undoHistory.undo(cur) : undoHistory.redo(cur);
    if (!e) return;
    put(applyEdit(docRef.current, e));
    requestAnimationFrame(() => editor.current?.setSelection(e.at + e.ins.length));
  }, [put, undoHistory]);
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;
  const onFormat = useCallback((cmd: FormatCommand, from: number, to: number) => {
    if (cmd === 'ps') return;
    // Clean has the marks a text can carry (underlined, pressed harder); the rest is written in ink for now
    if (cmd !== 'underline' && cmd !== 'press' && cmd !== 'weight') {
      toast('That’s written in ink for now', { id: 'clean-format', description: 'Switch the note to In ink for titles, lists, checklists, leaning and the highlighter.' });
      return;
    }
    const [a, b] = from === to ? wordAt(docRef.current.text, from) : [from, to];
    put(toggleMark(docRef.current, cmd === 'underline' ? 'underline' : 'press', a, b));
  }, [put]);

  const deskRef = useRef<HTMLDivElement>(null);
  const deskW = useElementWidth(deskRef);
  const pxPerMm = deskW > 0 ? Math.min(MAX_PX_PER_MM, deskW / paper.w) : 0;
  useEffect(() => {
    if (coarse || !pxPerMm) return;
    editor.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coarse, !!pxPerMm]);

  const shown = useRef({ live, extras, pxPerMm });
  shown.current = { live, extras, pxPerMm };
  useImperativeHandle(ref, () => ({
    focus: () => editor.current?.focus(),
    focusEnd: () => { editor.current?.focus(); editor.current?.setSelection(docRef.current.text.length); },
    flush: () => null,
    format: (cmd) => { const [a, b] = editor.current?.selection() ?? [0, 0]; onFormat(cmd, a, b); },
    history: (dir) => onHistoryRef.current(dir),
    write: (t) => {
      const at = docRef.current.text.length;
      onEdit({ at, del: 0, ins: t, kind: 'paste', t: Date.now(), source: 'paper' });
    },
    text: () => docRef.current.text,
    selection: () => editor.current?.selection() ?? [0, 0],
    style: () => null,
    lines: () => docRef.current.text.split('\n').map((text) => ({ text, as: 'body' })),
    command: (cmd) => { const [a, b] = editor.current?.selection() ?? [0, 0]; onFormat(cmd, a, b); if (!coarse) editor.current?.focus(); },
    image: async () => {
      const { live: l, extras: x, pxPerMm: k } = shown.current;
      return (await renderLiveNote(l, x, eff.inkKey ?? undefined, ink, k || 2)).blob;
    },
  }), [onFormat, onEdit, eff.inkKey, ink, coarse]);

  return (
    <div
      className="wr-desk"
      ref={deskRef}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('[data-paper], button, a, input, textarea, select, [role="dialog"]')) return;
        e.preventDefault();
        editor.current?.focus();
        if (coarse) editor.current?.setSelection(docRef.current.text.length);
      }}
    >
      <div className={cn('wr-sheet', fresh && 'wr-sheet-fresh')} style={{ viewTransitionName: named ? `sheet-${note.id}` : undefined }}>
        {pxPerMm > 0 && (
          <PaperEditor
            ref={editor}
            text={doc.text}
            mode="fair"
            onEdit={onEdit}
            onHistory={onHistory}
            start={startCaret}
            onFormat={onFormat}
            writerName={name}
            geometry={geometry}
            pxPerMm={pxPerMm}
            sheetW={live.paper.w}
            sheetH={live.paper.h}
            gapPx={SHEET_GAP}
            ink={ink}
            penWidthU={p.penWidth as number}
            xHeightU={(p.xHeight as number) * CAP}
            onEditingChange={(on) => { setEditing(on); onEditingChange?.(on); }}
          >
            <LiveSheets
              live={live}
              pxPerMm={pxPerMm}
              gapPx={SHEET_GAP}
              ink={ink}
              inkKey={eff.inkKey}
              extras={extras}
              handKey={[note.id, state.seed, state.style, look.pen, look.penSize, look.paper, look.size, look.ink].join(':')}
              hold="word"
            />
          </PaperEditor>
        )}
      </div>
    </div>
  );
});
