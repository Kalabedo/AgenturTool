import { Global, Module, type DynamicModule } from '@nestjs/common';
import { PDF_RENDERER_HOST, type PdfRenderer } from '../pdf/pdf-renderer';

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
    const provider = { provide: PDF_RENDERER_HOST, useValue: options.pdfRenderer ?? null };

    return {
      module: HostModule,
      providers: [provider],
      exports: [provider],
    };
  }
}
