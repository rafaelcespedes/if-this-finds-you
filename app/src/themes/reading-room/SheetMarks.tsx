// The Reading Room's marks on a sheet: the letter's catalogue number stamped in archival red (the look's signature),
// beside one postal detail borrowed from Postmarked, a postmark with the letter's place and year, both in the top-left
// margin. Both are decoration (aria-hidden): the card beside the letter says the same in words. Their data comes from
// catalogue.ts (marksOf), the one source anything that prints them should read.
// They never take a click, so a tap on the sheet still writes (the tool) or finishes the writing (the library).
import { useId } from 'react';
import { callNo, type LetterMarks } from './catalogue';
import { useMarks } from './useCatalogue';

export function SheetMarks({ marks, pxPerMm }: { marks: LetterMarks | undefined; pxPerMm: number }) {
  if (!pxPerMm || !marks) return null;
  const { no, place, year } = marks;
  // sized in millimetres of paper, so the marks keep their size on the sheet as it scales (a little larger on a phone,
  // so the place stays legible); both sit in the top margin, left, clear of the first line and of the tool's hints
  const mark = Math.round(Math.min(80, Math.max(54, 18.5 * pxPerMm)));
  const stamp = Math.min(13.5, Math.max(9.5, 2.9 * pxPerMm));
  const edge = 4 * pxPerMm;
  const hasMark = !!place || year != null;
  return (
    <div aria-hidden className="rr-marks pointer-events-none absolute inset-x-0 top-0">
      {hasMark && <Postmark place={place} year={year} size={mark} style={{ left: edge - mark * 0.06, top: 2.5 * pxPerMm }} />}
      {no != null && (
        <span className="rr-stamp" style={{ fontSize: stamp, left: hasMark ? edge + mark * 0.92 : edge + pxPerMm, top: 2.5 * pxPerMm + mark * 0.3 }}>
          No. <span className="rr-stamp-n">{callNo(no)}</span>
        </span>
      )}
    </div>
  );
}

/** A round postmark: the place along the top of the ring, the year across the middle. */
export function Postmark({ place, year, size, style }: { place: string; year?: number; size: number; style?: React.CSSProperties }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const len = Math.max(place.length, 4);
  const fs = Math.min(14.5, 120 / (len * 0.66));
  return (
    <svg className="rr-postmark" viewBox="0 0 100 100" width={size} height={size} style={style}>
      <defs>
        <path id={`${id}-top`} d="M 14 50 A 36 36 0 0 1 86 50" />
        {/* a worn stamp: the ring and letters lose a little ink here and there */}
        <filter id={`${id}-ink`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 0 0 0 -1.7" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id}-ink)`} fill="currentColor" stroke="currentColor">
        <circle cx="50" cy="50" r="47" fill="none" strokeWidth="2.6" />
        <circle cx="50" cy="50" r="27" fill="none" strokeWidth="1.3" />
        {place && (
          <text fontSize={fs} letterSpacing="0.12em" stroke="none" className="rr-postmark-text">
            <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">{place.toUpperCase()}</textPath>
          </text>
        )}
        <path d="M 46 85 l 4 -4 l 4 4 l -4 4 z" stroke="none" />
        {year != null && (
          <text x="50" y="57" fontSize="19" textAnchor="middle" stroke="none" className="rr-postmark-year">{year}</text>
        )}
        <line x1="29" y1="38" x2="71" y2="38" strokeWidth="1" />
        <line x1="29" y1="63" x2="71" y2="63" strokeWidth="1" />
      </g>
    </svg>
  );
}

/** The number on a library card's sheet: the same stamp, small. */
export function CardStamp({ id }: { id: string }) {
  const no = useMarks(id)?.no;
  if (no == null) return null;
  return (
    <span aria-hidden className="rr-stamp rr-stamp--card">
      No. <span className="rr-stamp-n">{callNo(no)}</span>
    </span>
  );
}

/** The tool's found letter: its marks, from its catalogue card. */
export function SampleMarks({ id, pxPerMm }: { id: string; pxPerMm: number }) {
  return <SheetMarks key={id} marks={useMarks(id)} pxPerMm={pxPerMm} />;
}
