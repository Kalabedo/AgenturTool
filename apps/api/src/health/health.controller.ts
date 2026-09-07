import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prüft nicht nur, ob der Prozess läuft, sondern ob die Datenbank
   * tatsächlich antwortet — sonst meldet der Endpunkt "ok", während jede
   * fachliche Anfrage scheitert.
   */
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
