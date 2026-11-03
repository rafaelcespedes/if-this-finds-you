import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Told the page's direction, sonner doesn't look it up on every render: without it, each render (each keystroke in
// the tool) asks the browser for the page's computed style, a style recalculation on the spot. Pages never change it.
const DIR: ToasterProps['dir'] = typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      dir={DIR}
      position="bottom-center"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-[4px] !border !border-[var(--ink-soft)] !bg-[var(--text)] !text-[var(--panel)] !shadow-[0_10px_30px_-10px_rgba(20,15,5,0.45)] !font-sans !text-[0.8125rem] !py-3 !px-4',
          description: '!text-[#bdb7aa]',
          icon: '!text-[var(--panel)]',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
