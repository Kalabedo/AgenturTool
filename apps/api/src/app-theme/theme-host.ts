/**
 * Wohin die Wahl des Erscheinungsbilds gemeldet wird.
 *
 * Electron legt die Hintergrundfarbe eines Fensters bei seiner Erzeugung
 * fest und kann sie danach nicht mehr ändern. Damit ein Fenster im
 * richtigen Ton aufgeht statt kurz weiß aufzublitzen, muss die Vorliebe
 * schon vor dem Öffnen bekannt sein — also gespeichert, nicht erfragt.
 *
 * Der Weg führt über die API und nicht über IPC, weil es keine gibt: Das
 * Fenster lädt die Oberfläche über HTTP vom eigenen eingebetteten Server,
 * ohne Preload-Skript und ohne `ipcMain`. Dieselbe Brücke, die schon den
 * PDF-Renderer und die Mail-Übergabe hereinreicht, trägt auch das hier.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_PREFERENCE_VALUES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export interface ThemeHost {
  /** Die Wahl merken und das native Erscheinungsbild nachziehen. */
  setPreference(preference: ThemePreference): void;
}

export const THEME_HOST = Symbol('THEME_HOST');
