// Download a hand's font (.otf + .ttf in a zip, made in a worker of its own), with the toasts the current page shows.
import { useState } from 'react';
import { toast } from 'sonner';
import { saveBlob } from '@/lib/utils';
import type { FontEntry } from '../protocol';
import { fonts } from '../store';

export function useDownload(entry: FontEntry | undefined) {
  const [building, setBuilding] = useState(false);
  const download = async () => {
    if (!entry || building) return;
    setBuilding(true);
    const id = `font-${entry.id}`;
    toast('Making the font…', { id, description: `${entry.name}: the .otf and .ttf, about a second.` });
    try {
      const { zip, filename } = await fonts.download(entry);
      saveBlob(new Blob([zip], { type: 'application/zip' }), filename);
      toast('Font saved', { id, description: `${filename}. Free and open source (SIL Open Font License).` });
    } catch (err) {
      toast('The font couldn’t be made', { id, description: err instanceof Error ? err.message : undefined });
    } finally {
      setBuilding(false);
    }
  };
  return { building, download };
}
