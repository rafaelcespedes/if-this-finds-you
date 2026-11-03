# Sample exports

Four clips made with the export lab (`/export-lab.html`), on a desktop Mac (Chrome, M-series GPU).
The media files stay out of git (see `.gitignore`); remake any of them from its lab link below.

| # | File | Shape · framing | Letter | Hand · pen · paper | Size | Made in |
|---|---|---|---|---|---|---|
| 1 | `01-stockdell-1838-4x5-first-lines.mp4` | 4:5 · First lines | Barbary Stockdell, 1838, Millsburg, Liberia | Yara Rowe, a meticulous joined hand · her own pen · plain letter paper | 3.9 MB, 18 s, 1080×1350, 30 fps, H.264 | 4.7 s |
| 2 | `02-julia-1924-9x16-first-lines.mp4` | 9:16 · First lines | "Julia", 1924, Buenos Aires, to the Reyes Magos (Spanish) | Viggo Marsh, a careful print · blue ballpoint · college-ruled filler paper | 3.3 MB, 18 s, 1080×1920, 30 fps, H.264 | 4.3 s |
| 3 | `03-maria-celeste-1623-4x5-whole-letter.mp4` | 4:5 · Whole letter | Suor Maria Celeste (Virginia Galilei), 1623, to her father Galileo (Italian) | Anouk Belmonte, a hurried Italian chancery hand (Arrighi) · italic nib, iron-gall ink · cream laid paper | 2.7 MB, 18 s, 1080×1350, 30 fps, H.264 | 7.3 s |
| 4 | `04-wheatley-1779-9x16-first-lines.gif` | 9:16 · First lines | Phillis Wheatley (Peters), 1779, Boston, to Obour Tanner | Noor Achterberg, a relaxed Spencerian hand · fountain pen, royal blue · British feint-ruled paper | 0.9 MB, 15 s loop, 562×998, 20 fps | 3.2 s |

## What each one looks like

1. **Stockdell, 4:5, first lines.** A close-up on plain cream letter paper: the opening seven lines in a fine black
   joined hand, written large enough to read on a phone ("I take this opportunity of writing to you a few lines,
   informing you that I arrived safe on the shores of Africa…"). It starts at about three times a real hand for two
   seconds, so you see how she writes, then eases up to about 7×. A three-second hold on the finished lines, and the
   credit fades in at the bottom: "Letter: Barbary Stockdell, 1838" on the left, "If This Finds You" on the right.
2. **Julia, 9:16, first lines.** A tall story frame filled with ruled school paper (blue rules, red margin line), a
   child's letter to the Three Kings in blue ballpoint print sitting on the rules: "Para entregarle a los Reyes Magos
   lo más pronto posible…" Eight lines, same pacing as #1. The credit sits on the paper at the foot of the frame.
3. **Maria Celeste, 4:5, whole letter.** The whole first sheet of cream laid paper (its faint chain lines visible),
   lying on the warm desk with a soft shadow. All seventeen lines of her letter about mending his shirts are written
   in an italic nib with iron-gall ink, sped up to fit (about 16× by the end), then held. The credit sits under the
   sheet like a label: "Letter: Suor Maria Celeste (Virginia Galilei), 1623".
4. **Wheatley GIF, 9:16, first lines.** Feint-ruled paper with a pink margin, royal-blue fountain pen ink in a
   Spencerian hand: "Dr. Obour,—By this opportunity I have the pleasure to inform that I am well and hope you are
   so…" Seven lines, a short hold with the credit, then the ink fades back to the blank sheet, so the loop is
   seamless (the first and last frames are identical).

## Checks

- MP4s: macOS reads them (`avmediainfo`: "System support for decoding this track: Yes", 0 errors), and every frame
  decodes through AVFoundation, the framework QuickTime uses. Chrome plays them (`<video>`).
- GIF: loops forever (NETSCAPE loop 0), one 255-colour palette for the whole clip, decodes in Chrome.
- Same note, same file: frames are stepped through the engine's timeline, never the wall clock.

## Lab links (run `npm run dev` in app/, then open)

1. `/export-lab.html?sample=stockdell-1838&seed=quiet-heron-17&style=script&paper=plain&pen=auto&ink=auto&aspect=4:5&framing=lines&format=mp4`
2. `/export-lab.html?sample=critica-1924-julia&seed=linen-otter-41&style=quebec-print&paper=college&pen=ballpoint&ink=ballpoint-blue&aspect=9:16&framing=lines&format=mp4`
3. `/export-lab.html?sample=maria-celeste-1623&seed=amber-wren-24&style=arrighi&paper=laid&pen=italic&ink=iron-gall&aspect=4:5&framing=page&format=mp4`
4. `/export-lab.html?sample=wheatley-1779&seed=still-harbor-58&style=spencerian&paper=feint&pen=fountain&ink=royal-blue&aspect=9:16&framing=lines&format=gif`
