import { describe, expect, it } from 'vitest';
import {
  codeSignToolArguments,
  powershellLiteral,
  redactedCommandLine,
  skipReason,
  WINDOWS_SIGN_SECRETS,
} from '../scripts/signieren-windows.mjs';

const zugangsdaten = {
  SSL_COM_USERNAME: 'tom@example.org',
  SSL_COM_PASSWORD: 'sehr geheim',
  SSL_COM_CREDENTIAL_ID: 'abc123',
  SSL_COM_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
};

describe('Windows-Signatur', () => {
  it('baut den Aufruf mit Eingabedatei und getrenntem Ausgabeverzeichnis', () => {
    expect(
      codeSignToolArguments(zugangsdaten, 'C:\\bau\\AgenturTool.exe', 'C:\\temp\\signiert'),
    ).toEqual([
      'sign',
      '-username=tom@example.org',
      '-password=sehr geheim',
      '-credential_id=abc123',
      '-totp_secret=JBSWY3DPEHPK3PXP',
      '-input_file_path=C:\\bau\\AgenturTool.exe',
      '-output_dir_path=C:\\temp\\signiert',
    ]);
  });

  it('schreibt kein Geheimnis in die Ausgabe', () => {
    const zeile = redactedCommandLine(
      codeSignToolArguments(zugangsdaten, 'C:\\bau\\AgenturTool.exe', 'C:\\temp\\signiert'),
    );

    for (const wert of Object.values(zugangsdaten)) {
      expect(zeile).not.toContain(wert);
    }

    // Was ohne Geheimnis zur Fehlersuche taugt, bleibt stehen.
    expect(zeile).toContain('-input_file_path=C:\\bau\\AgenturTool.exe');
    expect(zeile).toContain('-output_dir_path=C:\\temp\\signiert');
  });

  it('nennt alle vier Geheimnisse, die der Haken braucht', () => {
    expect(WINDOWS_SIGN_SECRETS).toEqual([
      'SSL_COM_USERNAME',
      'SSL_COM_PASSWORD',
      'SSL_COM_CREDENTIAL_ID',
      'SSL_COM_TOTP_SECRET',
    ]);
  });

  it('signiert nur im Release-Lauf', () => {
    expect(skipReason({ AGENTUR_TOOL_RELEASE: '1' })).toBeNull();
    expect(skipReason({ AGENTUR_TOOL_RELEASE: '0' })).toBe('kein Release-Lauf');
    expect(skipReason({})).toBe('kein Release-Lauf');
  });

  it('maskiert Apostrophe in Pfaden für PowerShell', () => {
    expect(powershellLiteral('C:\\bau\\AgenturTool.exe')).toBe("'C:\\bau\\AgenturTool.exe'");
    expect(powershellLiteral("C:\\Toms' Bau\\a.exe")).toBe("'C:\\Toms'' Bau\\a.exe'");
  });
});
