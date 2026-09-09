import fs from 'node:fs';
import path from 'node:path';
import { Module, type DynamicModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';

/**
 * Liefert das gebaute Frontend mit aus (Abschnitt 6 und 18).
 *
 * Im Produktivbetrieb — lokal wie im Container — läuft alles unter einer
 * Adresse: Ein zweiter Webserver nur für statische Dateien wäre ein zweites
 * Ding, das gestartet, überwacht und abgesichert werden müsste, und CORS
 * gäbe es obendrein.
 *
 * In der Entwicklung übernimmt das Vite mit seinem Proxy; dann existiert
 * `apps/web/dist` gar nicht, und das Modul hält sich heraus, statt beim
 * Start über ein fehlendes Verzeichnis zu stolpern.
 */
@Module({})
export class WebModule {
  static forRoot(): DynamicModule {
    const root = resolveWebRoot();

    if (root === null) {
      return { module: WebModule };
    }

    return {
      module: WebModule,
      imports: [
        ServeStaticModule.forRoot({
          rootPath: root,
          // Die API bleibt die API: Ohne diese Ausnahme beantwortete der
          // statische Server einen unbekannten API-Pfad mit der index.html,
          // und ein Tippfehler in einer Route sähe im Frontend aus wie ein
          // kaputtes JSON.
          exclude: ['/api/(.*)'],
        }),
      ],
    };
  }
}

/**
 * Sucht das gebaute Frontend.
 *
 * Zwei Orte, weil die Anwendung in zwei Formen läuft: im Repository neben
 * `apps/api/dist`, im Container unter `/app/web`. `WEB_ROOT` sticht beides.
 */
function resolveWebRoot(): string | null {
  const candidates = [
    process.env.WEB_ROOT,
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'web'),
  ].filter((candidate): candidate is string => candidate !== undefined);

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ?? null;
}
