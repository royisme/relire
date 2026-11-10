/** Base UI modal with Relire's task-dialog surface and built-in focus containment/restoration. */
import { Dialog } from '@base-ui/react/dialog';
import { cn } from '../../lib/utils';

export { Dialog };
export function DialogContent({ className, children, ...props }: Dialog.Popup.Props) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim/40 anim-fade" />
      <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-4">
        <Dialog.Popup
          className={cn(
            'max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-ink-200 bg-surface p-5 text-ink-900 shadow-lg',
            className,
          )}
          {...props}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  );
}
