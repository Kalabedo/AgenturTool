import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prüft nicht nur, ob der Prozess läuft, sondern ob die Datenbank
   * tatsächlich antwortet — sonst meldet der Endpunkt "ok", während jede
   * fachliche Anfrage scheitert.
   */
  // Die Gesundheitsprüfung muss ohne Anmeldung erreichbar sein: Sie beantwortet
  // dem Container und dem Reverse Proxy die Frage, ob der Dienst lebt.
  @Public()
  @Get()
  async check(): Promise<{ status: string; database: string; timestamp: string }> {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unreachable';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
