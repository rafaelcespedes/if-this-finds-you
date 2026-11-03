// The running head's middle on a found letter (house rule 2 of the Reading Room layouts): its catalogue number, place
// and year, from the same source as the marks printed on the sheet (themes/reading-room/catalogue.ts). The full form
// for the header's middle on desktops and tablets (phones keep the head minimal).
import { useEffect, useState } from 'react';
import { catalogueReady, loadCatalogue, marksOf } from '@/themes/reading-room/catalogue';

/** A letter's folio for SiteHeader's `centre`; nothing without an id (the collection loads only then). */
export function useFolio(id: string | null | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!id || catalogueReady()) return;
    let on = true;
    loadCatalogue().then(() => on && tick((n) => n + 1));
    return () => { on = false; };
  }, [id]);
  const m = id ? marksOf(id) : undefined;
  if (!m) return { centre: undefined };
  const dot = (
    <>
      <span aria-hidden="true">{' · '}</span>
      <span className="sr-only">, </span>
    </>
  );
  return {
    centre: (
      <span data-site-folio>
        <span className="sr-only">Letter </span>
        <span data-site-number>{m.number}</span>
        {m.place && <>{dot}{m.place}</>}
        {m.year != null && <>{dot}{m.year}</>}
      </span>
    ),
  };
}
