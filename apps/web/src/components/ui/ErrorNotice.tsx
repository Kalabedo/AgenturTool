import { messageOf } from '../../lib/errorMessage.js';
import { Button } from './Button.js';

interface ErrorNoticeProps {
  /** Der Fehler selbst — die Meldung wird daraus gewonnen. */
  error: unknown;
  /** Was nicht geklappt hat, in einem Satzanfang: „Die Rechnung konnte nicht …". */
  title?: string;
  /** Wenn es sich wiederholen lässt: der Knopf dafür. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Eine Fehlermeldung, überall gleich.
 *
 * `role="alert"` sorgt dafür, dass ein Screenreader sie vorliest, sobald sie
 * erscheint — sonst wäre der Fehler für jemanden, der nicht auf die Stelle
 * schaut, unsichtbar. Der Wiederholen-Knopf steht nur dort, wo ein zweiter
 * Versuch überhaupt Sinn ergibt: Bei einem abgelehnten Formular hilft er
 * nicht, bei einer abgerissenen Verbindung schon.
 */
export function ErrorNotice({
  error,
  title,
  onRetry,
  className = '',
}: ErrorNoticeProps): JSX.Element {
  return (
    <div
      role="alert"
      className={`rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 ${className}`}
    >
      {title !== undefined && <p className="font-medium text-rose-900">{title}</p>}
      <p className={title === undefined ? '' : 'mt-1'}>{messageOf(error)}</p>
      {onRetry !== undefined && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}
