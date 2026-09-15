/**
 * `pnpm user:set <e-mail>` — legt den Benutzer an oder setzt sein Passwort.
 *
 * Bewusst kein Registrierungsformular: Es gibt einen Benutzer, und ein
 * offener Registrierungsweg wäre genau die Tür, die die Anmeldung zumachen
 * soll. Das Passwort wird eingegeben, nicht als Argument übergeben — was auf
 * der Kommandozeile steht, landet in der Prozessliste und in der
 * Shell-Historie.
 */
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Algorithm, hash as argonHash } from '@node-rs/argon2';
import { PASSWORD_MIN_LENGTH, passwordSchema } from '@privatura/shared';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(apiRoot, '../../.env') });

/** Liest eine Eingabe, ohne sie anzuzeigen. */
async function askHidden(question: string): Promise<string> {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    const output = process.stdout;
    process.stdout.write(question);

    // Die Ausgabe wird für die Dauer der Eingabe stummgeschaltet; sonst
    // stünde das Passwort im Terminal und im Scrollback.
    const originalWrite = output.write.bind(output);
    (output as unknown as { write: typeof originalWrite }).write = ((chunk: string) =>
      typeof chunk === 'string' && chunk.includes('\n')
        ? originalWrite(chunk)
        : true) as typeof originalWrite;

    input.question('', (answer) => {
      (output as unknown as { write: typeof originalWrite }).write = originalWrite;
      output.write('\n');
      input.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();

  if (email === undefined || email === '') {
    console.error('Aufruf: pnpm user:set <e-mail>');
    process.exit(1);
  }

  const password = process.stdin.isTTY
    ? await askHidden(`Passwort für ${email} (mindestens ${PASSWORD_MIN_LENGTH} Zeichen): `)
    : (await readAll()).trim();

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    console.error(parsed.error.errors[0]?.message ?? 'Das Passwort ist zu kurz.');
    process.exit(1);
  }

  if (process.stdin.isTTY) {
    const repeated = await askHidden('Passwort wiederholen: ');
    if (repeated !== password) {
      console.error('Die Eingaben stimmen nicht überein.');
      process.exit(1);
    }
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argonHash(password, { algorithm: Algorithm.Argon2id });
    const existing = await prisma.user.findUnique({ where: { email } });

    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });

    // Ein geändertes Passwort beendet alle offenen Sitzungen — sonst bliebe
    // ein entwendetes Gerät angemeldet, und genau dagegen ändert man es.
    const revoked = await prisma.session.deleteMany({
      where: { user: { email } },
    });

    console.log(
      existing === null
        ? `Benutzer ${email} angelegt.`
        : `Passwort für ${email} geändert; ${revoked.count} offene Sitzung(en) beendet.`,
    );
    console.log('Anmeldung aktivieren: AUTH_ENABLED=true in der .env.');
  } finally {
    await prisma.$disconnect();
  }
}

/** Passwort aus einer Pipe, für Skripte und die erste Einrichtung im Container. */
async function readAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

void main();
