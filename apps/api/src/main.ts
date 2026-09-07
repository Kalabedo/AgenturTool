import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3000);

  // Bewusst an 127.0.0.1 gebunden, nicht an 0.0.0.0: Die Anwendung enthält
  // Geschäfts- und Kundendaten und soll lokal nicht im Netzwerk hängen.
  // Für den späteren VPS-Betrieb wird die Adresse über HOST gesetzt.
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);
  new Logger('Bootstrap').log(`API läuft auf http://${host}:${port}/api`);
}

void bootstrap();
