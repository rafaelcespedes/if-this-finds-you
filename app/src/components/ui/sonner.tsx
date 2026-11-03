import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-[4px] !border !border-[var(--ink-soft)] !bg-[var(--text)] !text-[var(--panel)] !shadow-[0_10px_30px_-10px_rgba(20,15,5,0.45)] !font-sans !text-[13px] !py-3 !px-4',
          description: '!text-[#bdb7aa]',
          icon: '!text-[var(--panel)]',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
