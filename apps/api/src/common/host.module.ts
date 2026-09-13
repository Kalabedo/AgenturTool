import { Global, Module, type DynamicModule } from '@nestjs/common';
import { PDF_RENDERER_HOST, type PdfRenderer } from '../pdf/pdf-renderer';
import { MAIL_HANDOFF_HOST, type MailHandoff } from '../mail/mail-handoff';
import { SECRET_STORE_HOST, type SecretStore } from '../mail/secret-store';
import { THEME_HOST, type ThemeHost } from '../app-theme/theme-host';
import { UPDATE_HOST, type UpdateHost } from '../app-update/update-host';

/** Was der Gastgeber der Anwendung mitbringen kann. */
export interface HostOptions {
  /**
   * Der Renderer für PDFs.
   *
   * Die Desktop-Anwendung reicht hier ihren Electron-Renderer herein.
   * Bleibt es leer — der Kommandozeilenbetrieb —, gibt es keinen: Die
   * PDF-Routen antworten dann mit einer Meldung statt mit einem Dokument.
   */
  pdfRenderer?: PdfRenderer;

  /**
   * Der Weg zur Mail-Anwendung dieses Rechners.
   *
   * Aus demselben Grund von außen wie der Renderer: Einen Entwurf im
   * Standard-Mailprogramm zu öffnen und einen Ordner im Dateimanager zu
   * zeigen, kann nur ein Prozess, der auf diesem Rechner ein Fenster hat.
   * Bleibt es leer, sagt der Versandweg „Mail-Anwendung" das, statt es zu
   * versuchen.
   */
  mailHandoff?: MailHandoff;

  /**
   * Die Ablage für das SMTP-Passwort.
   *
   * Die Desktop-Anwendung reicht hier den Schlüsselbund des Betriebssystems
   * herein. Ohne Angabe greift die Schlüsseldatei neben der Datenbank
   * (`mail/secret-store.ts`).
   */
  secretStore?: SecretStore;

  /**
   * Wohin die Wahl des Erscheinungsbilds gemeldet wird.
   *
   * Die Desktop-Anwendung schreibt sie in die Fensterdatei, damit das
   * Fenster beim nächsten Start gleich im richtigen Ton aufgeht. Im
   * Browserbetrieb gibt es kein Fenster und deshalb auch niemanden, dem
   * das zu melden wäre.
   */
  themeHost?: ThemeHost;

  /**
   * Wer nach einer neueren Fassung sieht.
   *
   * Nur die Desktop-Anwendung hat einen: Sie ist die einzige Form, die
   * installiert wird und deshalb veralten kann. Bleibt es leer, meldet der
   * Endpunkt „nicht unterstützt", und die Oberfläche zeigt nichts davon.
   */
  updateHost?: UpdateHost;
}

/**
 * Die Brücke von außen in die Anwendung.
 *
 * Global, damit Module wie `PdfModule` das Angebot lesen können, ohne dass
 * jedes Modul dazwischen dynamisch werden müsste — dieselbe Bauweise wie
 * beim `AuthModule`, dessen Guard ebenfalls überall gilt.
 *
 * Der Grund für den Umweg: Der Electron-Hauptprozess kann keinen Provider
 * in ein fertig gebautes Modul hineinreichen; er muss ihn vor dem Start
 * anbieten. Genau das ist hier die eine Stelle dafür.
 */
@Global()
@Module({})
export class HostModule {
  static forRoot(options: HostOptions = {}): DynamicModule {
    const providers = [
      { provide: PDF_RENDERER_HOST, useValue: options.pdfRenderer ?? null },
      { provide: MAIL_HANDOFF_HOST, useValue: options.mailHandoff ?? null },
      { provide: SECRET_STORE_HOST, useValue: options.secretStore ?? null },
      { provide: THEME_HOST, useValue: options.themeHost ?? null },
      { provide: UPDATE_HOST, useValue: options.updateHost ?? null },
    ];

    return {
      module: HostModule,
      providers,
      exports: providers,
    };
  }
}
