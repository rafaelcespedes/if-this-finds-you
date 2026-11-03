// The Reading Room's catalogue in React: a letter's card and its sheet marks, re-rendered once the collection is in.
import { useEffect, useState } from 'react';
import { catalogueReady, getRecord, loadCatalogue, marksOf, type CardRecord, type LetterMarks } from './catalogue';

function useCatalogue() {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (catalogueReady()) return;
    let on = true;
    loadCatalogue().then(() => on && setTick((n) => n + 1));
    return () => { on = false; };
  }, []);
}

/** The card for a letter id (undefined until the collection is in, or for a letter that isn't in it). */
export function useRecord(id: string | null | undefined): CardRecord | undefined {
  useCatalogue();
  return getRecord(id);
}

/** The number and postmark printed on a letter's sheet. */
export function useMarks(id: string | null | undefined): LetterMarks | undefined {
  useCatalogue();
  return marksOf(id);
}
