import { z } from 'zod';
import { isoDateSchema } from './date.js';
import {
  MAIL_ATTACHMENT_KIND,
  MAIL_ATTACHMENT_KIND_VALUES,
  MAIL_SECURITY,
  MAIL_SECURITY_VALUES,
  MAIL_TEMPLATE_KEY,
  MAIL_TRANSPORT,
  MAIL_TRANSPORT_VALUES,
  type MailAttachmentKind,
  type MailSecurity,
  type MailStatus,
  type MailTemplateKey,
  type MailTransport,
} from './enums.js';

/**
 * Verträge des E-Mail-Versands (docs/ARCHITEKTUR.md Abschnitt 27).
 *
 * Alles, was Oberfläche und Server über eine hinausgehende Nachricht
 * gemeinsam wissen müssen, steht hier: die Einrichtung des Versandwegs, die
 * Textvorlagen samt ihren Platzhaltern, der Entwurf einer Nachricht und das
 * Protokoll dessen, was verschickt wurde.
 *
 * Die Platzhalter sind der Grund, warum dieser Teil in `shared` liegt und
 * nicht im Server: Die Vorlagenmaske zeigt eine Vorschau mit Beispielwerten,
 * der Server füllt dieselbe Vorlage mit den eingefrorenen Werten einer
 * Rechnung. Zwei Umsetzungen desselben Ersetzens liefen unweigerlich
 * auseinander — und der Unterschied fiele erst beim Kunden im Postfach auf.
 */

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

/**
 * Eine E-Mail-Adresse.
 *
 * Bewusst eine schlichte Prüfung und keine RFC-5322-Grammatik: Was wirklich
 * zustellbar ist, weiß erst der annehmende Server. Diese Prüfung fängt den
 * Tippfehler ab — fehlendes @, Leerzeichen, vergessene Endung —, und alles
 * Weitere meldet der SMTP-Server als Fehler, den das Protokoll festhält.
 */
export const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/u;

export function isEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Zerlegt eine eingegebene Empfängerzeile in einzelne Adressen.
 *
 * Komma, Semikolon und Zeilenumbruch trennen gleichermaßen: Wer Adressen
 * aus einem anderen Programm kopiert, bekommt mal das eine und mal das
 * andere, und die Oberfläche soll ihn das nicht merken lassen.
 */
export function parseAddressList(input: string): string[] {
  return input
    .split(/[,;\n]/u)
    .map((address) => address.trim())
    .filter((address) => address !== '');
}

/** Setzt eine Adressliste wieder zu einer Eingabezeile zusammen. */
export function formatAddressList(addresses: readonly string[]): string {
  return addresses.join(', ');
}

/** Eine Adressliste als Eingabefeld: Text rein, geprüfte Adressen raus. */
const addressListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (typeof value === 'string' ? parseAddressList(value) : value))
  .superRefine((addresses, ctx) => {
    for (const address of addresses) {
      if (isEmailAddress(address)) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `„${address}" ist keine gültige E-Mail-Adresse`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Platzhalter in den Vorlagen
// ---------------------------------------------------------------------------

/**
 * Die Werte, die eine Vorlage einsetzen kann.
 *
 * Deutsche Schlüssel, weil sie in der Vorlage stehen und dort jemand liest,
 * der kein Programmierer ist: `{{rechnungsnummer}}` erklärt sich, ein
 * `{{invoiceNumber}}` in einem sonst deutschen Text nicht.
 */
export type MailPlaceholderValues = Record<string, string>;

export interface MailPlaceholder {
  /** Der Schlüssel ohne Klammern, wie er in der Vorlage steht. */
  key: string;
  description: string;
  /** Was die Vorschau der Vorlagenmaske dafür einsetzt. */
  example: string;
}

/**
 * Platzhalter, die es in jeder Vorlage gibt.
 *
 * `anrede` ist der einzige, der etwas entscheidet statt nur einzusetzen:
 * Ist ein Ansprechpartner hinterlegt, wird er angesprochen, sonst bleibt es
 * bei der förmlichen Wendung. Das ist genau die Fallunterscheidung, die
 * sonst jeder in seinen Vorlagentext hineinschreiben müsste — und die in
 * einem Text nicht ausdrückbar ist.
 */
const COMMON_PLACEHOLDERS: readonly MailPlaceholder[] = [
  {
    key: 'anrede',
    description: 'Anrede, je nach hinterlegtem Ansprechpartner',
    example: 'Guten Tag Frau Meyer',
  },
  { key: 'kunde', description: 'Name des Kunden', example: 'Muster GmbH' },
  { key: 'ansprechpartner', description: 'Ansprechpartner beim Kunden', example: 'Frau Meyer' },
  { key: 'absender', description: 'Der eigene Firmenname', example: 'Agentur Beispiel' },
];

const INVOICE_PLACEHOLDERS: readonly MailPlaceholder[] = [
  { key: 'rechnungsnummer', description: 'Nummer des Dokuments', example: '2026-014' },
  { key: 'rechnungsdatum', description: 'Rechnungsdatum', example: '14.09.2026' },
  { key: 'faelligkeitsdatum', description: 'Fälligkeitsdatum', example: '28.09.2026' },
  { key: 'betrag', description: 'Bruttobetrag des Dokuments', example: '2.380,00 €' },
  { key: 'zahlungsziel', description: 'Zahlungsziel in Tagen', example: '14' },
  {
    key: 'leistungszeitraum',
    description: 'Leistungsdatum oder -zeitraum',
    example: '01.09.2026 – 30.09.2026',
  },
];

const TIME_REPORT_PLACEHOLDERS: readonly MailPlaceholder[] = [
  { key: 'zeitraum', description: 'Zeitraum des Nachweises', example: '01.09.2026 – 30.09.2026' },
  { key: 'stunden', description: 'Erfasste Zeit im Zeitraum', example: '18:45' },
  { key: 'eintraege', description: 'Anzahl der Einträge', example: '12' },
];

/** Welche Platzhalter eine Vorlage benutzen darf. */
export const MAIL_PLACEHOLDERS: Record<MailTemplateKey, readonly MailPlaceholder[]> = {
  [MAIL_TEMPLATE_KEY.INVOICE]: [...COMMON_PLACEHOLDERS, ...INVOICE_PLACEHOLDERS],
  [MAIL_TEMPLATE_KEY.CANCELLATION]: [...COMMON_PLACEHOLDERS, ...INVOICE_PLACEHOLDERS],
  [MAIL_TEMPLATE_KEY.TIME_REPORT]: [...COMMON_PLACEHOLDERS, ...TIME_REPORT_PLACEHOLDERS],
};

/** Beispielwerte für die Vorschau in der Vorlagenmaske. */
export function examplePlaceholderValues(key: MailTemplateKey): MailPlaceholderValues {
  return Object.fromEntries(
    MAIL_PLACEHOLDERS[key].map((placeholder) => [placeholder.key, placeholder.example]),
  );
}

/** `{{ rechnungsnummer }}` — Leerraum innerhalb der Klammern wird geduldet. */
const PLACEHOLDER_PATTERN = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;

/**
 * Setzt die Platzhalter einer Vorlage ein.
 *
 * Ein unbekannter Platzhalter bleibt **stehen**, statt zu verschwinden. Das
 * ist der einzige Weg, auf dem ein Vertipper auffällt, bevor die Nachricht
 * das Haus verlässt: Im Versanddialog steht dann sichtbar
 * `{{rechnugsnummer}}` im Text. Würde er zu einer Leerstelle, verschickte
 * man einen Satz mit einem Loch darin, ohne es zu merken.
 */
export function renderMailTemplate(text: string, values: MailPlaceholderValues): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, key: string) => values[key] ?? match);
}

/** Die Platzhalter, die in einem Text vorkommen, aber für diese Vorlage nicht vorgesehen sind. */
export function unknownPlaceholders(text: string, key: MailTemplateKey): string[] {
  const allowed = new Set(MAIL_PLACEHOLDERS[key].map((placeholder) => placeholder.key));
  const found = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (name !== undefined && !allowed.has(name)) found.add(name);
  }
  return [...found];
}

/** Die Anrede, die `{{anrede}}` einsetzt. */
export function salutationFor(contactName: string | null): string {
  const name = contactName?.trim() ?? '';
  return name === '' ? 'Sehr geehrte Damen und Herren' : `Guten Tag ${name}`;
}

// ---------------------------------------------------------------------------
// Vorlagen
// ---------------------------------------------------------------------------

export interface MailTemplateDefault {
  subject: string;
  body: string;
}

/**
 * Die ausgelieferten Vorlagen.
 *
 * Sie stehen hier und nicht im Seed, weil „auf den Auslieferungsstand
 * zurücksetzen" sie ein zweites Mal braucht: Ein Seed schreibt einmal, ein
 * Zurücksetzen jederzeit.
 */
export const MAIL_TEMPLATE_DEFAULTS: Record<MailTemplateKey, MailTemplateDefault> = {
  [MAIL_TEMPLATE_KEY.INVOICE]: {
    subject: 'Rechnung {{rechnungsnummer}}',
    body: [
      '{{anrede}},',
      '',
      'anbei erhalten Sie die Rechnung {{rechnungsnummer}} vom {{rechnungsdatum}}',
      'über {{betrag}}.',
      '',
      'Bitte überweisen Sie den Betrag bis zum {{faelligkeitsdatum}}.',
      '',
      'Mit freundlichen Grüßen',
      '{{absender}}',
    ].join('\n'),
  },
  [MAIL_TEMPLATE_KEY.CANCELLATION]: {
    subject: 'Storno {{rechnungsnummer}}',
    body: [
      '{{anrede}},',
      '',
      'anbei erhalten Sie das Storno {{rechnungsnummer}} vom {{rechnungsdatum}}.',
      'Die darin aufgehobene Rechnung ist damit gegenstandslos.',
      '',
      'Mit freundlichen Grüßen',
      '{{absender}}',
    ].join('\n'),
  },
  [MAIL_TEMPLATE_KEY.TIME_REPORT]: {
    subject: 'Zeitnachweis {{zeitraum}}',
    body: [
      '{{anrede}},',
      '',
      'anbei erhalten Sie den Zeitnachweis für {{zeitraum}}',
      'mit {{stunden}} Stunden in {{eintraege}} Einträgen.',
      '',
      'Mit freundlichen Grüßen',
      '{{absender}}',
    ].join('\n'),
  },
};

export const MAIL_TEMPLATE_LABELS: Record<MailTemplateKey, string> = {
  [MAIL_TEMPLATE_KEY.INVOICE]: 'Rechnung',
  [MAIL_TEMPLATE_KEY.CANCELLATION]: 'Storno',
  [MAIL_TEMPLATE_KEY.TIME_REPORT]: 'Zeitnachweis',
};

export const mailTemplateInputSchema = z.object({
  subject: z.string().trim().min(1, 'Bitte einen Betreff angeben').max(300),
  body: z.string().trim().min(1, 'Bitte einen Nachrichtentext angeben').max(20_000),
});
export type MailTemplateInput = z.input<typeof mailTemplateInputSchema>;
export type MailTemplatePayload = z.output<typeof mailTemplateInputSchema>;

export interface MailTemplateResponse {
  key: MailTemplateKey;
  subject: string;
  body: string;
  /** Ob der Text noch dem Auslieferungsstand entspricht. */
  isDefault: boolean;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Einrichtung des Versandwegs
// ---------------------------------------------------------------------------

/** Vorbelegter Port je Verschlüsselungsart. */
export const DEFAULT_SMTP_PORT: Record<MailSecurity, number> = {
  [MAIL_SECURITY.STARTTLS]: 587,
  [MAIL_SECURITY.TLS]: 465,
  [MAIL_SECURITY.NONE]: 25,
};

export const MAIL_TRANSPORT_LABELS: Record<MailTransport, string> = {
  [MAIL_TRANSPORT.NONE]: 'Kein Versand eingerichtet',
  [MAIL_TRANSPORT.SMTP]: 'Über einen SMTP-Server',
  [MAIL_TRANSPORT.MAIL_APP]: 'Über die Mail-Anwendung dieses Rechners',
};

export const MAIL_SECURITY_LABELS: Record<MailSecurity, string> = {
  [MAIL_SECURITY.STARTTLS]: 'STARTTLS (Port 587)',
  [MAIL_SECURITY.TLS]: 'TLS ab Verbindungsaufbau (Port 465)',
  [MAIL_SECURITY.NONE]: 'Ohne Verschlüsselung',
};

/**
 * Die Einrichtung des Versandwegs.
 *
 * `password` ist optional und bedeutet dreierlei: nicht angegeben heißt
 * „lass das gespeicherte stehen", ein leerer String heißt „lösch es", und
 * ein Wert heißt „ersetze es". Ohne diese Unterscheidung müsste die
 * Oberfläche das Passwort bei jedem Speichern erneut abfragen — oder es
 * zum Anzeigen herausgeben, und das tut sie bewusst nie.
 */
export const mailSettingsInputSchema = z
  .object({
    transport: z.enum(MAIL_TRANSPORT_VALUES as [MailTransport, ...MailTransport[]]),

    fromName: optionalText,
    fromAddress: optionalText,
    replyTo: optionalText,
    /** Blindkopie an sich selbst — der Beleg im eigenen Postfach. */
    bccSelf: z.boolean().optional().default(false),

    host: optionalText,
    port: z
      .union([z.string().trim(), z.number(), z.null()])
      .optional()
      .transform((value) => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isInteger(parsed) ? parsed : Number.NaN;
      }),
    security: z.enum(MAIL_SECURITY_VALUES as [MailSecurity, ...MailSecurity[]]),
    username: optionalText,
    password: z.string().optional(),
  })
  .superRefine((settings, ctx) => {
    const require = (field: string, value: unknown, message: string): void => {
      if (value === null || value === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      }
    };

    // Ohne Absenderadresse gibt es nichts zu verschicken — auch nicht über
    // die Mail-Anwendung, denn sie steht dort im Absenderfeld des Entwurfs.
    if (settings.transport !== MAIL_TRANSPORT.NONE) {
      require('fromAddress', settings.fromAddress, 'Bitte die eigene Absenderadresse angeben');
    }

    for (const [field, value] of [
      ['fromAddress', settings.fromAddress],
      ['replyTo', settings.replyTo],
    ] as const) {
      if (value !== null && !isEmailAddress(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Bitte eine gültige E-Mail-Adresse angeben',
        });
      }
    }

    if (settings.transport !== MAIL_TRANSPORT.SMTP) return;

    require('host', settings.host, 'Bitte den Servernamen angeben, z. B. mail.example.de');

    if (settings.port === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['port'],
        message: 'Bitte einen Port angeben',
      });
    } else if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65_535) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['port'],
        message: 'Bitte einen Port zwischen 1 und 65535 angeben',
      });
    }
  });
export type MailSettingsInput = z.input<typeof mailSettingsInputSchema>;
export type MailSettingsPayload = z.output<typeof mailSettingsInputSchema>;

/**
 * Die Einrichtung, wie der Server sie herausgibt.
 *
 * Ohne Passwort — es verlässt die Anwendung nie, auch nicht auf dem Weg zur
 * eigenen Oberfläche. Was die Maske stattdessen braucht, sind zwei Fragen:
 * ob eines hinterlegt ist (`hasPassword`) und ob es sich auf diesem Rechner
 * noch entschlüsseln lässt (`passwordReadable`). Die zweite wird nach einem
 * Backup auf einem anderen Rechner verneint — dann muss es neu eingegeben
 * werden, und das soll die Maske sagen können, bevor ein Versand daran
 * scheitert.
 */
export interface MailSettingsResponse {
  transport: MailTransport;
  fromName: string | null;
  fromAddress: string | null;
  replyTo: string | null;
  bccSelf: boolean;

  host: string | null;
  port: number | null;
  security: MailSecurity;
  username: string | null;
  hasPassword: boolean;
  passwordReadable: boolean;

  /** Ob der Versand mit diesen Angaben laufen kann. */
  ready: boolean;
  /** Was noch fehlt — leer, wenn `ready`. */
  problems: string[];
  updatedAt: string;
}

/** Ergebnis von „Verbindung prüfen". */
export interface MailConnectionCheckResponse {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Entwurf und Versand
// ---------------------------------------------------------------------------

export const MAIL_ATTACHMENT_LABELS: Record<MailAttachmentKind, string> = {
  [MAIL_ATTACHMENT_KIND.INVOICE_PDF]: 'Rechnung als PDF',
  [MAIL_ATTACHMENT_KIND.INVOICE_XML]: 'E-Rechnung als XML (XRechnung)',
  [MAIL_ATTACHMENT_KIND.TIME_REPORT]: 'Zeitnachweis als PDF',
};

/** Ein Anhang, wie ihn der Entwurf anbietet. */
export interface MailAttachmentOption {
  kind: MailAttachmentKind;
  filename: string;
  /** Ob er sich anhängen lässt; sonst sagt `reason`, warum nicht. */
  available: boolean;
  /** Ob er beim Öffnen des Dialogs vorausgewählt ist. */
  selected: boolean;
  reason: string | null;
}

/**
 * Der vorbereitete Entwurf einer Nachricht.
 *
 * Vom Server zusammengestellt und nicht im Browser: Betreff und Text kommen
 * aus der Vorlage, die Werte darin aus den eingefrorenen Snapshots der
 * Rechnung. Diese Daten liegen im Browser gar nicht alle vor — und wenn sie
 * es täten, wäre die zweite Auflösung der Vorlage die zweite Wahrheit.
 */
export interface MailDraftResponse {
  templateKey: MailTemplateKey;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: MailAttachmentOption[];

  transport: MailTransport;
  /** Ob der eingerichtete Weg gangbar ist; sonst zeigt der Dialog den Weg zu den Einstellungen. */
  transportReady: boolean;
  transportProblems: string[];
  /** Hinweise zum Vorgang selbst, etwa eine fehlende Adresse beim Kunden. */
  warnings: string[];
}

/** Woraus die Anhänge entstehen. */
export const mailSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('INVOICE'),
    invoiceId: z.coerce.number().int().positive(),
  }),
  z.object({
    kind: z.literal('TIME_REPORT'),
    customerId: z.coerce.number().int().positive(),
    from: isoDateSchema,
    to: isoDateSchema,
  }),
]);
export type MailSource = z.output<typeof mailSourceSchema>;

export const mailSendInputSchema = z
  .object({
    source: mailSourceSchema,
    to: addressListSchema,
    cc: addressListSchema.optional().default([]),
    bcc: addressListSchema.optional().default([]),
    subject: z.string().trim().min(1, 'Bitte einen Betreff angeben').max(300),
    body: z.string().trim().min(1, 'Bitte einen Nachrichtentext angeben').max(100_000),
    attachments: z
      .array(z.enum(MAIL_ATTACHMENT_KIND_VALUES as [MailAttachmentKind, ...MailAttachmentKind[]]))
      .default([]),
  })
  .superRefine((mail, ctx) => {
    if (mail.to.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Bitte mindestens einen Empfänger angeben',
      });
    }
  });
export type MailSendInput = z.input<typeof mailSendInputSchema>;
export type MailSendPayload = z.output<typeof mailSendInputSchema>;

/** Ein verschickter Anhang, wie ihn das Protokoll festhält. */
export interface MailLoggedAttachment {
  kind: MailAttachmentKind;
  filename: string;
  sizeBytes: number;
}

/** Ein Eintrag im Versandprotokoll. */
export interface MailMessageResponse {
  id: number;
  invoiceId: number | null;
  transport: MailTransport;
  status: MailStatus;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: MailLoggedAttachment[];
  error: string | null;
  createdAt: string;
}

/**
 * Was aus dem Klick auf „Senden" wurde.
 *
 * `handoffFolder` steht nur beim Weg über die Mail-Anwendung: Dort liegen
 * die Anhänge, die der Benutzer im Entwurf selbst anhängen muss — eine
 * `mailto`-Adresse kann keine Dateien tragen, und das ist keine Lücke
 * dieser Umsetzung, sondern des Formats.
 */
export interface MailSendResponse {
  message: MailMessageResponse;
  handoffFolder: string | null;
  /** Der Versandvermerk der Rechnung, sofern er dadurch gesetzt wurde. */
  markedSentAt: string | null;
}

export const mailMessageListQuerySchema = z.object({
  invoiceId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MailMessageListQuery = z.output<typeof mailMessageListQuerySchema>;

/**
 * Die `mailto`-Adresse für den Weg über die lokale Mail-Anwendung.
 *
 * In `shared`, weil sie an zwei Stellen entsteht: Der Server reicht sie an
 * den Gastgeber weiter, und ein Test prüft sie, ohne ein Fenster zu öffnen.
 * `encodeURIComponent` und nicht `URLSearchParams`: Letzteres kodiert
 * Leerzeichen als `+`, und in einem `mailto`-Betreff steht dann ein
 * Pluszeichen statt einer Leerstelle.
 */
export function buildMailtoUrl(input: {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  body: string;
}): string {
  const query: string[] = [];
  const add = (key: string, value: string): void => {
    if (value !== '') query.push(`${key}=${encodeURIComponent(value)}`);
  };

  add('cc', (input.cc ?? []).join(','));
  add('bcc', (input.bcc ?? []).join(','));
  add('subject', input.subject);
  add('body', input.body);

  const recipients = input.to.map((address) => encodeURIComponent(address)).join(',');
  return `mailto:${recipients}${query.length === 0 ? '' : `?${query.join('&')}`}`;
}
