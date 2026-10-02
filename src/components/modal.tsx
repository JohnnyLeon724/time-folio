import { useRef, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  side = false,
  confirmation = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  side?: boolean;
  confirmation?: boolean;
}) {
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const restoreFocus = (event: Event) => {
    if (previousFocus.current?.isConnected) {
      event.preventDefault();
      previousFocus.current.focus();
    }
  };
  const change = (open: boolean) => {
    if (!open) onClose();
  };
  if (side)
    return (
      <Sheet open onOpenChange={change}>
        <SheetContent className="entry-sheet-panel" onCloseAutoFocus={restoreFocus}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="sheet-body">{children}</div>
        </SheetContent>
      </Sheet>
    );
  if (confirmation)
    return (
      <AlertDialog open onOpenChange={change}>
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {children}
        </AlertDialogContent>
      </AlertDialog>
    );
  return (
    <Dialog open onOpenChange={change}>
      <DialogContent
        onCloseAutoFocus={restoreFocus}
        className={wide ? 'sm:max-w-2xl max-h-[90vh] overflow-y-auto' : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
