import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import type { SmallBusinessInvoiceWarning, SmallBusinessStatus } from '@privatura/shared';
import { SmallBusinessService } from './small-business.service';

@Controller('small-business')
export class SmallBusinessController {
  constructor(private readonly smallBusiness: SmallBusinessService) {}

  /**
   * Umsatz und Grenze für das laufende und das vorige Jahr.
   *
   * Immer beantwortbar: Gibt es kein Kleinunternehmerprofil, steht das in
   * `applicable` und die Oberfläche zeigt nichts. Ein 404 wäre hier falsch —
   * die Frage ist zulässig, die Antwort lautet nur "betrifft dich nicht".
   */
  @Get('status')
  status(): Promise<SmallBusinessStatus> {
    return this.smallBusiness.status();
  }

  /**
   * Was das Ausstellen dieses Entwurfs an der Grenze änderte.
   *
   * Eigener Endpunkt statt eines weiteren Feldes an der ohnehin breiten
   * Rechnungsantwort: Die Frage stellt sich genau einmal, nämlich wenn der
   * Ausstellen-Dialog aufgeht. Jede Rechnungsliste trüge die Rechnung sonst
   * mit, ohne sie je zu brauchen.
   */
  @Get('invoices/:id/warning')
  warningFor(@Param('id', ParseIntPipe) id: number): Promise<SmallBusinessInvoiceWarning> {
    return this.smallBusiness.warningFor(id);
  }
}
