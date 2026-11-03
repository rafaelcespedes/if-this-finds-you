// A calm note in place of the letter, when there's no letter to show: a link cut short on its way, or a pen
// (the writing worker) that couldn't load. Says what happened and the one thing to do about it.
import type { ReactNode } from 'react';

export function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="mx-auto mt-[12vh] w-full max-w-[380px] rounded-[6px] border border-border bg-panel px-6 py-6 text-center shadow-[0_1px_2px_rgba(60,45,20,0.06),0_12px_32px_-16px_rgba(60,45,20,0.3)]">
      <h2 className="text-[16px] leading-snug font-medium text-foreground">{title}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{children}</p>
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}
