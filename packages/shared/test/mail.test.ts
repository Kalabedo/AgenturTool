import { describe, expect, it } from 'vitest';
import {
  MAIL_ATTACHMENT_KIND,
  MAIL_SECURITY,
  MAIL_TEMPLATE_DEFAULTS,
  MAIL_TEMPLATE_KEY,
  MAIL_TRANSPORT,
  buildMailtoUrl,
  formatAddressList,
  isEmailAddress,
  mailSendInputSchema,
  mailSettingsInputSchema,
  parseAddressList,
  renderMailTemplate,
  salutationFor,
  unknownPlaceholders,
} from '../src/index.js';

/**
 * Die Vorlagen und die Einrichtung des Versandwegs.
 *
 * Geprüft wird, was beim Kunden im Postfach landen würde: dass ein
 * Vertipper im Platzhalter sichtbar bleibt statt eine Lücke zu
 * hinterlassen, dass eine halb ausgefüllte SMTP-Einrichtung nicht als
 * vollständig durchgeht, und dass die `mailto`-Adresse Leerzeichen nicht
 * in Pluszeichen verwandelt.
 */

describe('parseAddressList', () => {
  it('trennt an Komma, Semikolon und Zeilenumbruch', () => {
    expect(parseAddressList('a@example.de, b@example.de; c@example.de\nd@example.de')).toEqual([
      'a@example.de',
      'b@example.de',
      'c@example.de',
      'd@example.de',
    ]);
  });

  it('verwirft Leerraum und leere Felder', () => {
    expect(parseAddressList('  a@example.de ,, ; \n ')).toEqual(['a@example.de']);
  });

  it('ist die Umkehrung von formatAddressList', () => {
    const addresses = ['a@example.de', 'b@example.de'];
    expect(parseAddressList(formatAddressList(addresses))).toEqual(addresses);
  });
});

describe('isEmailAddress', () => {
  it('nimmt gewöhnliche Adressen an', () => {
    expect(isEmailAddress('buchhaltung@muster-gmbh.de')).toBe(true);
    expect(isEmailAddress('a.b+rechnung@sub.example.co.uk')).toBe(true);
  });

  it('weist ab, was sicher kein Ziel ist', () => {
    for (const value of ['', 'muster.de', 'a@b', 'a b@example.de', 'a@example.de, b@example.de']) {
      expect(isEmailAddress(value)).toBe(false);
    }
  });
});

describe('renderMailTemplate', () => {
  it('setzt bekannte Platzhalter ein, auch mit Leerraum in den Klammern', () => {
    expect(
      renderMailTemplate('Rechnung {{ rechnungsnummer }} über {{betrag}}', {
        rechnungsnummer: '2026-014',
        betrag: '2.380,00 €',
      }),
    ).toBe('Rechnung 2026-014 über 2.380,00 €');
  });

  it('lässt einen unbekannten Platzhalter stehen, statt ein Loch zu hinterlassen', () => {
    // Der eigentliche Punkt: Ein Vertipper muss im Versanddialog sichtbar
    // sein. Eine Leerstelle sähe aus wie ein fertiger Satz.
    expect(renderMailTemplate('Rechnung {{rechnugsnummer}}', { rechnungsnummer: '2026-014' })).toBe(
      'Rechnung {{rechnugsnummer}}',
    );
  });

  it('ersetzt jedes Vorkommen', () => {
    expect(renderMailTemplate('{{kunde}} — {{kunde}}', { kunde: 'Muster GmbH' })).toBe(
      'Muster GmbH — Muster GmbH',
    );
  });
});

describe('unknownPlaceholders', () => {
  it('nennt nur die Platzhalter, die es für diese Vorlage nicht gibt', () => {
    expect(
      unknownPlaceholders('{{kunde}} {{stunden}} {{quatsch}}', MAIL_TEMPLATE_KEY.INVOICE),
    ).toEqual(
      // `stunden` gehört zum Zeitnachweis, nicht zur Rechnung.
      ['stunden', 'quatsch'],
    );
  });

  it('nennt jeden nur einmal', () => {
    expect(unknownPlaceholders('{{x}} {{x}}', MAIL_TEMPLATE_KEY.TIME_REPORT)).toEqual(['x']);
  });

  it('bestätigt, dass die ausgelieferten Vorlagen nur gültige Platzhalter benutzen', () => {
    for (const [key, template] of Object.entries(MAIL_TEMPLATE_DEFAULTS)) {
      const templateKey = key as keyof typeof MAIL_TEMPLATE_DEFAULTS;
      expect(unknownPlaceholders(template.subject, templateKey)).toEqual([]);
      expect(unknownPlaceholders(template.body, templateKey)).toEqual([]);
    }
  });
});

describe('salutationFor', () => {
  it('spricht den Ansprechpartner an, wenn es einen gibt', () => {
    expect(salutationFor('Frau Meyer')).toBe('Guten Tag Frau Meyer');
  });

  it('bleibt förmlich, wenn keiner hinterlegt ist', () => {
    expect(salutationFor(null)).toBe('Sehr geehrte Damen und Herren');
    expect(salutationFor('   ')).toBe('Sehr geehrte Damen und Herren');
  });
});

describe('mailSettingsInputSchema', () => {
  const smtp = {
    transport: MAIL_TRANSPORT.SMTP,
    fromName: 'Agentur Beispiel',
    fromAddress: 'rechnung@beispiel.de',
    replyTo: '',
    host: 'mail.beispiel.de',
    port: '587',
    security: MAIL_SECURITY.STARTTLS,
    username: 'rechnung@beispiel.de',
    password: 'geheim',
  };

  it('nimmt eine vollständige SMTP-Einrichtung an', () => {
    const parsed = mailSettingsInputSchema.parse(smtp);
    expect(parsed.port).toBe(587);
    expect(parsed.replyTo).toBeNull();
  });

  it('verlangt Server und Port nur beim SMTP-Versand', () => {
    const viaApp = mailSettingsInputSchema.safeParse({
      ...smtp,
      transport: MAIL_TRANSPORT.MAIL_APP,
      host: '',
      port: '',
    });
    expect(viaApp.success).toBe(true);

    const viaSmtp = mailSettingsInputSchema.safeParse({ ...smtp, host: '', port: '' });
    expect(viaSmtp.success).toBe(false);
    expect(viaSmtp.error?.issues.map((issue) => issue.path[0])).toEqual(['host', 'port']);
  });

  it('verlangt eine Absenderadresse, sobald überhaupt versendet werden soll', () => {
    const result = mailSettingsInputSchema.safeParse({ ...smtp, fromAddress: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['fromAddress']);
  });

  it('lässt alles leer, solange nichts eingerichtet ist', () => {
    const result = mailSettingsInputSchema.safeParse({
      transport: MAIL_TRANSPORT.NONE,
      fromName: '',
      fromAddress: '',
      replyTo: '',
      host: '',
      port: '',
      security: MAIL_SECURITY.STARTTLS,
      username: '',
    });
    expect(result.success).toBe(true);
  });

  it('weist einen Port außerhalb des gültigen Bereichs ab', () => {
    expect(mailSettingsInputSchema.safeParse({ ...smtp, port: '70000' }).success).toBe(false);
    expect(mailSettingsInputSchema.safeParse({ ...smtp, port: 'abc' }).success).toBe(false);
  });
});

describe('mailSendInputSchema', () => {
  const base = {
    source: { kind: 'INVOICE', invoiceId: 7 },
    subject: 'Rechnung 2026-014',
    body: 'Guten Tag …',
  };

  it('zerlegt die Empfängerzeile und behält die Anhänge', () => {
    const parsed = mailSendInputSchema.parse({
      ...base,
      to: 'a@example.de; b@example.de',
      attachments: [MAIL_ATTACHMENT_KIND.INVOICE_PDF, MAIL_ATTACHMENT_KIND.INVOICE_XML],
    });

    expect(parsed.to).toEqual(['a@example.de', 'b@example.de']);
    expect(parsed.cc).toEqual([]);
    expect(parsed.attachments).toHaveLength(2);
  });

  it('verlangt mindestens einen Empfänger', () => {
    const result = mailSendInputSchema.safeParse({ ...base, to: '  ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['to']);
  });

  it('nennt die ungültige Adresse beim Namen', () => {
    const result = mailSendInputSchema.safeParse({ ...base, to: 'a@example.de, kaputt' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('kaputt');
  });
});

describe('buildMailtoUrl', () => {
  it('kodiert Leerzeichen als %20 und nicht als Pluszeichen', () => {
    const url = buildMailtoUrl({
      to: ['kunde@example.de'],
      subject: 'Rechnung 2026-014',
      body: 'Guten Tag',
    });

    expect(url).toBe('mailto:kunde%40example.de?subject=Rechnung%202026-014&body=Guten%20Tag');
  });

  it('nimmt mehrere Empfänger und lässt leere Felder weg', () => {
    const url = buildMailtoUrl({
      to: ['a@example.de', 'b@example.de'],
      cc: [],
      bcc: ['archiv@example.de'],
      subject: '',
      body: 'Text',
    });

    expect(url).toContain('mailto:a%40example.de,b%40example.de');
    expect(url).toContain('bcc=archiv%40example.de');
    expect(url).not.toContain('?cc=');
    expect(url).not.toContain('&cc=');
    expect(url).not.toContain('subject=');
  });

  it('kodiert Umlaute im Betreff', () => {
    expect(buildMailtoUrl({ to: ['a@b.de'], subject: 'Prüfung', body: '' })).toContain(
      'subject=Pr%C3%BCfung',
    );
  });
});
