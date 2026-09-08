import { Controller, Get, Header, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FilesService } from './files.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly files: FilesService) {}

  /**
   * Liefert eine hochgeladene Datei aus.
   *
   * Bewusst über einen Controller statt über ein statisches Verzeichnis:
   * Sobald die Anwendung erreichbar ist, muss dieser Zugriff durch dieselbe
   * Authentifizierung laufen wie alles andere. Ein offenes Static-Verzeichnis
   * ließe sich später nur schwer wieder zumachen.
   */
  @Get(':id')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  async serve(@Param('id', ParseIntPipe) id: number, @Res() response: Response): Promise<void> {
    const asset = await this.files.findById(id);
    const content = await this.files.readContent(asset);

    // Der Dateiname ist der Inhalts-Hash, deshalb kann aggressiv
    // zwischengespeichert werden: Ändert sich das Logo, ändert sich die id.
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Length', content.length);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(content);
  }
}
