import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import type { HostOptions } from './common/host.module';

/**
 * Die laufende Anwendung samt der Adresse, unter der sie tatsächlich hört.
 *
 * Die Adresse steht erst nach `listen` fest — bei Port 0 sucht das
 * Betriebssystem einen freien aus, und nur der Server selbst weiß danach,
 * welcher es geworden ist.
 */
export interface RunningApi {
  readonly app: INestApplication;
  readonly url: string;
}

/**
 * Baut die Anwendung auf und lässt sie hören.
 *
 * Exportiert, weil es zwei Aufrufer gibt: die Kommandozeile (unten, wenn
 * diese Datei der Einstiegspunkt ist) und der Electron-Hauptprozess, der die
 * Anwendung in seinem eigenen Prozess hochzieht und die Fenster-URL aus dem
 * Rückgabewert nimmt.
 */
export async function bootstrap(options: HostOptions = {}): Promise<RunningApi> {
  const app = await NestFactory.create(AppModule.forRoot(options));
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.setGlobalPrefix('api');

  // Einheitliches Fehlerformat für alles, was aus der API herauskommt.
  app.useGlobalFilters(new ApiExceptionFilter());

  // Nötig, damit onModuleDestroy beim Beenden läuft: Sonst überlebt der
  // Chromium-Prozess der PDF-Erzeugung die Anwendung.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);

  // 0 ist ausdrücklich erlaubt und heißt „such dir einen freien": So startet
  // die Desktop-Anwendung, die keinen festen Port braucht und sich mit einer
  // zweiten Instanz auch keinen teilen soll.
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(
      `PORT muss eine ganze Zahl zwischen 0 und 65535 sein (erhalten: ${String(process.env.PORT)}).`,
    );
  }

  // Bewusst an 127.0.0.1 gebunden, nicht an 0.0.0.0: Die Anwendung enthält
  // Geschäfts- und Kundendaten und soll lokal nicht im Netzwerk hängen.
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);

  const url = `http://${host}:${listeningPort(app, port)}`;
  new Logger('Bootstrap').log(`API läuft auf ${url}/api`);

  return { app, url };
}

/**
 * Der Port, auf dem wirklich gehört wird.
 *
 * Bei einem fest vorgegebenen Port ist das der vorgegebene; bei Port 0 muss
 * er vom Server erfragt werden. `address()` liefert bei einem TCP-Server ein
 * Objekt, bei einem Unix-Socket eine Zeichenkette — hier immer Ersteres.
 */
function listeningPort(app: INestApplication, requested: number): number {
  if (requested !== 0) {
    return requested;
  }

  const address = (app.getHttpServer() as { address: () => AddressInfo | string | null }).address();
  if (address === null || typeof address === 'string') {
    throw new Error('Der Server hört nicht auf einem TCP-Port.');
  }
  return address.port;
}

// Nur starten, wenn diese Datei aufgerufen wurde. Wird sie eingebunden — vom
// Electron-Hauptprozess —, entscheidet der Aufrufer, wann es losgeht.
if (require.main === module) {
  void bootstrap();
}
