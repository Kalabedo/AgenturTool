import type { DownloadedFile } from '../../lib/apiClient.js';

/**
 * Legt eine empfangene Datei im Downloads-Ordner ab.
 *
 * Der Umweg über einen unsichtbaren Link ist der einzige Weg, eine Datei
 * aus JavaScript heraus zu speichern. `window.open` wäre die Alternative,
 * wird aber von Browsern blockiert, sobald der Aufruf nicht unmittelbar aus
 * dem Klick kommt — und das PDF ist erst nach der Antwort des Servers da.
 *
 * Die Objekt-URL wird sofort wieder freigegeben: Sie hält den Blob im
 * Speicher, und ein Vorschau-PDF entsteht in einer Sitzung schnell dutzendfach.
 */
export function saveFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
