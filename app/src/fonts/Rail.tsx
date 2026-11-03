// The filters as a quiet rail on the left (the Reading Room on wide screens; Proposal 4 of the layout study, the Fonts
// page as a specimen book): what to show, a new set, and every filter as the tool's ¶ groups, ruled, never boxed. The
// same controls as the dock's panel (FilterGroups); phones and the classic look keep the dock.
import { Heart, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Group } from '@/components/ui/group';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { FilterGroups, withFamily } from './Dock';
import { filterCount, NO_FILTERS, type Catalogue, type Filters } from './filters';

interface Props {
  filters: Filters;
  onFilters: (f: Filters, neatOnly?: boolean) => void;
  neatOnly: boolean;
  onNeatOnly: (v: boolean) => void;
  catalogue: Catalogue;
  view: 'set' | 'saved';
  onView: (v: 'set' | 'saved') => void;
  savedCount: number;
  onNewSet: () => void;
}

export function FontsRail(p: Props) {
  const family = p.filters.family[0] ?? 'any';
  const n = filterCount({ ...p.filters, family: [] }) + (p.neatOnly ? 0 : 1);
  return (
    <aside aria-label="Choose the fonts" className="font-rail panel-scroll">
      <Group label="Show" first>
        <Segmented slide type="single" aria-label="Joined or print" value={p.view === 'saved' ? '' : family}
          onValueChange={(v) => v && p.onFilters(withFamily(p.filters, v, p.catalogue))}>
          <SegmentedItem value="any">All</SegmentedItem>
          <SegmentedItem value="print">Print</SegmentedItem>
          <SegmentedItem value="script">Joined</SegmentedItem>
        </Segmented>
        <Button variant="ghost" size="sm" aria-pressed={p.view === 'saved'} onClick={() => p.onView(p.view === 'saved' ? 'set' : 'saved')}
          className={cn('justify-start gap-2 px-2', p.view === 'saved' && 'bg-accent')}>
          <Heart aria-hidden className={cn(p.view === 'saved' && 'fill-current')} />
          {p.view === 'saved' ? 'Kept hands (back to the set)' : `Kept hands${p.savedCount ? ` (${p.savedCount})` : ''}`}
        </Button>
        <Button onClick={p.onNewSet} className="dock-primary justify-start">
          <RefreshCw aria-hidden />
          Draw another set
        </Button>
      </Group>
      {p.view === 'set' && (
        <>
          <FilterGroups filters={p.filters} onFilters={p.onFilters} neatOnly={p.neatOnly} onNeatOnly={p.onNeatOnly} catalogue={p.catalogue} pad="0px" flush />
          {n > 0 && (
            <Button variant="ghost" size="sm" onClick={() => p.onFilters({ ...NO_FILTERS, family: p.filters.family }, true)} className="mt-2 justify-start px-2 text-muted-foreground">
              Clear filters
            </Button>
          )}
        </>
      )}
    </aside>
  );
}
