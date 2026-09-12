import type { ReactNode } from 'react';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Was geschieht, wenn bestätigt wird — ein Satz, keine Aufzählung. */
  description?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  /** `danger` für alles, was sich nicht zurücknehmen lässt. */
  tone?: 'primary' | 'danger';
  isPending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

/**
 * Die Rückfrage vor einer folgenreichen Handlung.
 *
 * Statt `window.confirm`: Das native Fenster kommt in der Sprache des
 * Betriebssystems, trägt dessen Schaltflächen („OK"/„Abbrechen" — nie
 * „Stornieren"), lässt sich nicht gestalten und stellt die zerstörende
 * Antwort genauso dar wie die harmlose. Vor allem aber friert es den
 * Browser ein: Solange es steht, kann die Anwendung nicht zeigen, dass sie
 * arbeitet, und der Knopf kann nicht warten, bis der Server geantwortet hat.
 *
 * Hier gilt dieselbe Ordnung wie in jedem anderen Dialog der Anwendung:
 * Abbrechen links, die bestätigende Handlung rechts, und sie trägt ihren
 * eigenen Namen — „Löschen" und nicht „OK".
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Abbrechen',
  tone = 'primary',
  isPending = false,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isPending) onClose();
      }}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            pending={isPending}
            pendingLabel={pendingLabel}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description !== undefined && <p className="text-sm text-ink-muted">{description}</p>}
      {children}
    </Dialog>
  );
}
