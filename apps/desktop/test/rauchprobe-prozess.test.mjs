import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createLineCollector, waitForStartup } from '../scripts/rauchprobe-prozess.mjs';

describe('Rauchproben-Prozess', () => {
  it('setzt über mehrere Datenblöcke getrennte Zeilen zusammen', () => {
    const lines = [];
    const collector = createLineCollector((line) => lines.push(line));

    collector.write('PRIVATURA_');
    collector.write('URL http://127.0.0.1:1234\nzweite');
    collector.flush();

    expect(lines).toEqual(['PRIVATURA_URL http://127.0.0.1:1234', 'zweite']);
  });

  it('scheitert sofort, wenn das Kindprogramm nicht gestartet werden kann', async () => {
    const child = spawn(`nicht-vorhanden-${String(process.pid)}`);
    await expect(waitForStartup(child, new EventEmitter(), () => '', 5_000)).rejects.toThrow(
      'ließ sich nicht starten',
    );
  });

  it('meldet einen durch Signal beendeten Prozess vor dem Timeout', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const waiting = waitForStartup(child, new EventEmitter(), () => 'Kindausgabe', 5_000);
    child.kill('SIGTERM');

    await expect(waiting).rejects.toThrow(/endete vor dem Start mit (Signal|Code)/u);
  });
});
