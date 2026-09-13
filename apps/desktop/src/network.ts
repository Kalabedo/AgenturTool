/**
 * Was das Fenster nach draußen darf: nichts.
 *
 * Die Anwendung ist selbst gehostet. Alles, was sie anzeigt, kommt vom
 * eigenen Server auf der Rückschleife — es gibt keine Schriftart, kein
 * Bild und kein Skript, das von woanders geladen werden müsste. Damit ist
 * jede Anfrage nach außen entweder überflüssig oder unerwünscht, und die
 * Unterscheidung braucht niemand zu treffen.
 *
 * Dass die Anwendung selbst nach Updates sieht, ändert daran nichts: Diese
 * eine Anfrage stellt der Hauptprozess mit Nodes `fetch`, an dieser
 * Session und damit am Fenster vorbei (`update/update-service.ts`). Was
 * das Fenster darf, bleibt hier vollständig beschrieben.
 *
 * Zwei Chromium-Schalter in `main.ts` nehmen den größten Teil weg, aber
 * eben nicht alles: Gemessen blieb ein Versuch beim Start übrig. Dieser
 * Filter schließt die Lücke — dieselbe Sperre, die der PDF-Renderer für
 * seine eigene Session schon hat (`pdf-renderer.ts`), nur mit der
 * Erlaubnisliste, die ein Fenster braucht.
 */
import type { Session } from 'electron';

/**
 * Erlaubt ist die Rückschleife und was im Fenster selbst entsteht.
 *
 * Der Server hört auf 127.0.0.1 mit wechselndem Port, im
 * Entwicklungsbetrieb kommt Vite auf 5173 dazu, samt WebSocket für das
 * Nachladen. Statt diese Adressen einzeln zu pflegen — der Port steht
 * beim Aufbau des Filters noch gar nicht fest — gilt die Herkunft: die
 * eigene Maschine, und sonst keine.
 */
export function allowed(url: string): boolean {
  // Kein Netzverkehr: das Dokument spricht mit sich selbst.
  if (
    url.startsWith('devtools://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('file://') ||
    url.startsWith('chrome-extension://')
  ) {
    return true;
  }

  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  } catch {
    // Was sich nicht als URL lesen lässt, wird auch nicht durchgelassen.
    return false;
  }
}

/**
 * Hängt die Sperre an eine Session.
 *
 * @param onBlocked Wird für jede abgewiesene Anfrage gerufen. Wie beim
 *   PDF-Renderer ist das nicht bloß Diagnose: Eine Anwendung, die ohne
 *   Anlass nach außen greift, soll auffallen — und der Rauchprobe dient
 *   die leere Liste als Beleg.
 */
export function blockOutboundRequests(session: Session, onBlocked: (url: string) => void): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    if (allowed(details.url)) {
      callback({ cancel: false });
      return;
    }

    onBlocked(details.url);
    callback({ cancel: true });
  });
}
