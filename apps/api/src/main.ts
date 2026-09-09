import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PORT muss eine ganze Zahl zwischen 1 und 65535 sein (erhalten: ${String(process.env.PORT)}).`,
    );
  }

  // Bewusst an 127.0.0.1 gebunden, nicht an 0.0.0.0: Die Anwendung enthält
  // Geschäfts- und Kundendaten und soll lokal nicht im Netzwerk hängen.
  // Für den späteren VPS-Betrieb wird die Adresse über HOST gesetzt.
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);
  new Logger('Bootstrap').log(`API läuft auf http://${host}:${port}/api`);
}

void bootstrap();
