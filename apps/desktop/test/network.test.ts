import { describe, expect, it } from 'vitest';
import { allowed } from '../src/network';

/**
 * Die Erlaubnisliste des Fensters.
 *
 * Ein Test für vier Zeilen Code — aber es sind die vier Zeilen, die
 * entscheiden, ob Kundendaten den Rechner verlassen können. Ein zu weit
 * gefasstes Muster fiele sonst niemandem auf: Die Anwendung sähe genauso
 * aus, sie spräche nur mit mehr Leuten.
 */
describe('allowed', () => {
  it('lässt den eigenen Server durch, auf jedem Port', () => {
    expect(allowed('http://127.0.0.1:41133/api/invoices')).toBe(true);
    expect(allowed('http://127.0.0.1:3000/assets/index.js')).toBe(true);
    expect(allowed('http://localhost:5173/@vite/client')).toBe(true);
    expect(allowed('ws://127.0.0.1:5173/')).toBe(true);
  });

  it('lässt durch, was im Fenster selbst entsteht', () => {
    expect(allowed('devtools://devtools/bundled/inspector.html')).toBe(true);
    expect(allowed('blob:http://127.0.0.1:41133/8f2c')).toBe(true);
    expect(allowed('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true);
    expect(allowed('file:///tmp/dokument.html')).toBe(true);
  });

  it('weist alles ab, was den Rechner verlassen würde', () => {
    expect(allowed('https://fonts.googleapis.com/css2?family=Inter')).toBe(false);
    expect(allowed('https://example.com/telemetrie')).toBe(false);
    expect(allowed('http://192.168.1.10/')).toBe(false);
  });

  it('fällt nicht auf einen Namen herein, der wie die Rückschleife aussieht', () => {
    // `startsWith('http://127.0.0.1')` hätte hier ja gesagt — deshalb
    // entscheidet der Hostname und nicht der Anfang der Zeichenkette.
    expect(allowed('http://127.0.0.1.angreifer.example/')).toBe(false);
    expect(allowed('http://localhost.angreifer.example/')).toBe(false);
    expect(allowed('https://user@127.0.0.1:1/../evil')).toBe(true);
  });

  it('weist ab, was sich nicht als Adresse lesen lässt', () => {
    expect(allowed('kein-schema')).toBe(false);
    expect(allowed('')).toBe(false);
  });
});
