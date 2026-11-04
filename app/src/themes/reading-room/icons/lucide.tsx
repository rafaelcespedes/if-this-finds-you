// The app's icons, through the Reading Room: vite.config.ts sends every `import { … } from 'lucide-react'` here, so no
// component changes. In the Reading Room an icon drawn with the engine's own fountain pen (engine-icons.ts, Rafael's
// pick from the type and icons study) takes the place of Lucide's; in the classic look, Lucide's own. An icon the app
// starts using later falls through to Lucide's until it's drawn here. The look is read once at load, so the classic
// look gets Lucide's components as they are, with nothing wrapped.
import { forwardRef, useCallback, type ComponentType, type SVGProps } from 'react';
import {
  ArrowLeft as LArrowLeft,
  CaseSensitive as LCaseSensitive,
  Check as LCheck,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  ChevronUp as LChevronUp,
  Download as LDownload,
  Ellipsis as LEllipsis,
  FileText as LFileText,
  Film as LFilm,
  Heart as LHeart,
  ImagePlay as LImagePlay,
  Info as LInfo,
  LayoutDashboard as LLayoutDashboard,
  LayoutGrid as LLayoutGrid,
  Link as LLink,
  Link2 as LLink2,
  List as LList,
  Loader2 as LLoader2,
  LoaderCircle as LLoaderCircle,
  Lock as LLock,
  LockOpen as LLockOpen,
  MailOpen as LMailOpen,
  Mails as LMails,
  Menu as LMenu,
  Moon as LMoon,
  Pause as LPause,
  PenLine as LPenLine,
  Play as LPlay,
  Pointer as LPointer,
  RefreshCw as LRefreshCw,
  RotateCcw as LRotateCcw,
  Search as LSearch,
  Share as LShare,
  Shuffle as LShuffle,
  SlidersHorizontal as LSlidersHorizontal,
  Sparkles as LSparkles,
  Sun as LSun,
  Undo2 as LUndo2,
  Users as LUsers,
  X as LX,
} from 'lucide-react/icons';
import { LOOK } from '@/lib/look';
import { ENGINE_ICONS } from './engine-icons';

export * from 'lucide-react/icons';

type P = SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean };
const PEN = LOOK === 'reading-room';

/** What the words beside an icon are set in: 'book' (the look's serif, --rr-book, whose capitals sit off its line box's
 * centre by --rr-book-cap-lift), 'ui' (the sans, or the serif's small capitals, which already centre), or nothing
 * when it stands alone. The serif is read from the token, so a new pairing needs no change here. */
function besideFace(el: SVGSVGElement): 'book' | 'ui' | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const book = getComputedStyle(document.documentElement).getPropertyValue('--rr-book').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  const walk = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim() || !n.parentElement) continue;
    const cs = getComputedStyle(n.parentElement);
    return !!book && cs.fontFamily.includes(book) && cs.fontVariantCaps === 'normal' ? 'book' : 'ui';
  }
  return null;
}

/** Lucide's icon, or in the Reading Room the one drawn with the pen (`drawn`: its name in engine-icons.ts). Lucide's
 * icons are imported by name, never looked up, so the bundle keeps only the ones the app uses. */
function icon(lucide: ComponentType<P>, name: string, drawn = name): ComponentType<P> {
  const d = ENGINE_ICONS[drawn];
  if (!PEN || !d) return lucide;
  const Inked = forwardRef<SVGSVGElement, P>(({ size = 24, strokeWidth: _s, absoluteStrokeWidth: _a, className, ...rest }, ref) => {
    // beside words set in the book face, the icon is lifted onto their capitals (reading-room.css, --rr-icon-dy)
    const setRef = useCallback((el: SVGSVGElement | null) => {
      if (el) {
        const face = besideFace(el);
        if (face) el.dataset.besideText = face;
        else delete el.dataset.besideText;
      }
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    }, [ref]);
    return (
      <svg ref={setRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width={size} height={size} fill="currentColor" className={className ? `rr-pen-icon ${className}` : 'rr-pen-icon'} {...rest}>
        <path d={d} />
      </svg>
    );
  });
  Inked.displayName = `Inked${name}`;
  return Inked;
}

export const ArrowLeft = icon(LArrowLeft as ComponentType<P>, 'ArrowLeft');
export const CaseSensitive = icon(LCaseSensitive as ComponentType<P>, 'CaseSensitive');
export const Check = icon(LCheck as ComponentType<P>, 'Check');
export const ChevronDown = icon(LChevronDown as ComponentType<P>, 'ChevronDown');
export const ChevronLeft = icon(LChevronLeft as ComponentType<P>, 'ChevronLeft');
export const ChevronRight = icon(LChevronRight as ComponentType<P>, 'ChevronRight');
export const ChevronUp = icon(LChevronUp as ComponentType<P>, 'ChevronUp');
export const Download = icon(LDownload as ComponentType<P>, 'Download');
export const Ellipsis = icon(LEllipsis as ComponentType<P>, 'Ellipsis');
export const FileText = icon(LFileText as ComponentType<P>, 'FileText');
export const Film = icon(LFilm as ComponentType<P>, 'Film');
export const Heart = icon(LHeart as ComponentType<P>, 'Heart');
export const ImagePlay = icon(LImagePlay as ComponentType<P>, 'ImagePlay');
export const Info = icon(LInfo as ComponentType<P>, 'Info');
export const LayoutDashboard = icon(LLayoutDashboard as ComponentType<P>, 'LayoutDashboard');
export const LayoutGrid = icon(LLayoutGrid as ComponentType<P>, 'LayoutGrid', 'LayoutDashboard');
export const Link = icon(LLink as ComponentType<P>, 'Link');
export const Link2 = icon(LLink2 as ComponentType<P>, 'Link2', 'Link');
export const List = icon(LList as ComponentType<P>, 'List', 'LayoutList');
export const Loader2 = icon(LLoader2 as ComponentType<P>, 'Loader2', 'Loader');
export const LoaderCircle = icon(LLoaderCircle as ComponentType<P>, 'LoaderCircle', 'Loader');
export const Lock = icon(LLock as ComponentType<P>, 'Lock');
export const LockOpen = icon(LLockOpen as ComponentType<P>, 'LockOpen');
export const MailOpen = icon(LMailOpen as ComponentType<P>, 'MailOpen');
export const Mails = icon(LMails as ComponentType<P>, 'Mails');
export const Menu = icon(LMenu as ComponentType<P>, 'Menu');
export const Moon = icon(LMoon as ComponentType<P>, 'Moon');
export const Pause = icon(LPause as ComponentType<P>, 'Pause');
export const PenLine = icon(LPenLine as ComponentType<P>, 'PenLine');
export const Play = icon(LPlay as ComponentType<P>, 'Play');
export const Pointer = icon(LPointer as ComponentType<P>, 'Pointer');
export const RefreshCw = icon(LRefreshCw as ComponentType<P>, 'RefreshCw', 'RotateCcw');
export const RotateCcw = icon(LRotateCcw as ComponentType<P>, 'RotateCcw');
export const Search = icon(LSearch as ComponentType<P>, 'Search');
export const Share = icon(LShare as ComponentType<P>, 'Share');
export const Shuffle = icon(LShuffle as ComponentType<P>, 'Shuffle');
export const SlidersHorizontal = icon(LSlidersHorizontal as ComponentType<P>, 'SlidersHorizontal');
export const Sparkles = icon(LSparkles as ComponentType<P>, 'Sparkles');
export const Sun = icon(LSun as ComponentType<P>, 'Sun');
export const Undo2 = icon(LUndo2 as ComponentType<P>, 'Undo2', 'RotateCcw');
export const Users = icon(LUsers as ComponentType<P>, 'Users');
export const X = icon(LX as ComponentType<P>, 'X');
