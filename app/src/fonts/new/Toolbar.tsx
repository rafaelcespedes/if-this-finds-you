// Wide screens: the page's one control surface, a single ruled line that stays under the header as you scroll, the
// way a foundry's tester bar does. Left, what to show (Joined or print, the filters in the shared Sheet); middle, what
// every hand writes (the line's menu and your own words) and how big; right, list or grid, your saved hands and New
// set. Phones and tablets keep the floating dock (../Dock.tsx) instead.
// Every control is the desk's own, as in its writing materials drawer (Rafael: "make sure the controls in the fonts
// page match what we're doing in the main page"): the sliding segmented face, the room's edged secondary buttons, the
// ink-bar SliderRow, the shared field and menu, and New set as the desk's main action (its own BringAnother button: a
// light red tint, its words in the action role, its key at the end). The row carries the drawer's control surface class
// (rr-slip-inner), so the room gives it the same control type role and sizes.
import { useState } from 'react';
import { Heart, LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { SliderRow } from '@/components/ui/slider-row';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BringAnother } from '@/themes/reading-room/BringAnother';
import { FilterGroups, withFamily } from '../Dock';
import { filterCount, NO_FILTERS, type Catalogue, type Filters } from '../filters';
import type { Line } from '../route';
import { LinePicker, WordsField } from '../SpecimenBar';

export type Layout = 'list' | 'grid';

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
  line: Line;
  onLine: (l: Line) => void;
  text: string;
  onText: (t: string) => void;
  placeholder: string;
  size: number;
  onSize: (px: number) => void;
  layout: Layout;
  onLayout: (l: Layout) => void;
}

export const SIZE = { min: 28, max: 120, step: 2 };

export function Toolbar(p: Props) {
  const [open, setOpen] = useState(false);
  const n = filterCount({ ...p.filters, family: [] }) + (p.neatOnly ? 0 : 1);
  const saved = p.view === 'saved';
  return (
    <div role="toolbar" aria-label="Choose the fonts and what they write" className="fx-toolbar rr-slip-inner">
      <div className="fx-tool-group">
        <Segmented slide type="single" aria-label="Joined or print" value={saved ? '' : p.filters.family[0] ?? 'any'}
          onValueChange={(v) => v && p.onFilters(withFamily(p.filters, v, p.catalogue))} className="fx-family">
          <SegmentedItem value="any">Any</SegmentedItem>
          <SegmentedItem value="print">Print</SegmentedItem>
          <SegmentedItem value="script">Joined</SegmentedItem>
        </Segmented>
        <Sheet title="Filters" open={open} onOpenChange={setOpen} side="bottom" align="start" className="w-[440px] overflow-hidden p-0"
          trigger={
            <Button variant="secondary" className="data-[state=open]:bg-[var(--st-press)]" aria-label={n ? `Filters, ${n} on` : 'Filters'} disabled={saved}>
              <SlidersHorizontal aria-hidden /> Filters
              {n > 0 && <span aria-hidden className="dock-badge tabular">{n}</span>}
            </Button>
          }>
          {(close) => (
            <div className="filter-panel flex max-h-[min(72dvh,640px,var(--radix-popover-content-available-height))] flex-col">
              <div className="panel-scroll min-h-0 overflow-y-auto overscroll-contain px-[var(--pad,1.25rem)]">
                <FilterGroups filters={p.filters} onFilters={p.onFilters} neatOnly={p.neatOnly} onNeatOnly={p.onNeatOnly} catalogue={p.catalogue} />
              </div>
              <div className="filter-panel-foot flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                <Button variant="ghost" disabled={!n} onClick={() => p.onFilters({ ...NO_FILTERS, family: p.filters.family }, true)} className="fx-quiet">Clear filters</Button>
                <BringAnother onClick={close} label="Done" shortcut="" className="rr-bring-button" />
              </div>
            </div>
          )}
        </Sheet>
      </div>

      <div className="fx-tool-group fx-tester">
        <LinePicker line={p.line} onLine={p.onLine} variant="secondary" />
        <WordsField text={p.text} onText={p.onText} placeholder={p.placeholder} escapeClears />
        <div className="fx-size">
          <SliderRow label="Size" value={p.size} min={SIZE.min} max={SIZE.max} step={SIZE.step} describe={(v) => `${v} px`} onChange={p.onSize} />
        </div>
      </div>

      <div className="fx-tool-group fx-tool-end">
        <Segmented slide type="single" aria-label="List or grid" value={p.layout} onValueChange={(v) => v && p.onLayout(v as Layout)} className="fx-layout">
          <Tooltip><TooltipTrigger asChild><SegmentedItem value="list" aria-label="List"><List aria-hidden className="size-4" /></SegmentedItem></TooltipTrigger><TooltipContent>List</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><SegmentedItem value="grid" aria-label="Grid"><LayoutGrid aria-hidden className="size-4" /></SegmentedItem></TooltipTrigger><TooltipContent>Grid</TooltipContent></Tooltip>
        </Segmented>
        {(p.savedCount > 0 || saved) && (
          <Button variant="ghost" aria-pressed={saved} onClick={() => p.onView(saved ? 'set' : 'saved')} className="fx-quiet fx-saved"
            aria-label={saved ? 'Back to the set' : `Saved hands (${p.savedCount})`}>
            <Heart aria-hidden className="fill-current" />
            <span className="tabular">{saved ? 'Back to the set' : p.savedCount}</span>
          </Button>
        )}
        {/* the desk's main action, its Bring another letter button: words alone, its key at the end */}
        <BringAnother onClick={p.onNewSet} label="New set" shortcut="N" className="rr-bring-button" />
      </div>
    </div>
  );
}
