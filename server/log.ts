/**
 * log.ts — orario su ogni riga del log, e una riga anche per le richieste
 * interrotte.
 *
 * Senza orari il log non dice QUANDO: non si distinguono le richieste del
 * telefono di stamattina da quelle di una prova di adesso, né si mette in fila
 * "il banner è comparso alle 20:31" con quello che il server ha visto.
 *
 * Importato per primo da index.ts: da lì in poi ogni console.log/warn/error,
 * di qualunque modulo, esce con l'orario davanti.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const due = (n: number) => String(n).padStart(2, '0');

/** "2026-11-21 20:31:05.123", ora locale: è quella che si ha in testa. */
export function orario(d = new Date()): string {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())} `
    + `${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

let installato = false;
export function orarioSuOgniRiga(): void {
  if (installato) return;
  installato = true;
  for (const metodo of ['log', 'warn', 'error'] as const) {
    const originale = console[metodo].bind(console);
    console[metodo] = (...args: unknown[]) => originale(orario(), ...args);
  }
}

/**
 * Da dove arriva la richiesta. Dietro `tailscale serve` la connessione arriva
 * sempre da 127.0.0.1: l'indirizzo vero (100.x.y.z del telefono o del Mac)
 * sta in X-Forwarded-For.
 */
export function provenienza(req: IncomingMessage): string {
  const inoltrato = req.headers['x-forwarded-for'];
  const primo = (Array.isArray(inoltrato) ? inoltrato[0] : inoltrato)?.split(',')[0]?.trim();
  return primo || req.socket.remoteAddress?.replace(/^::ffff:/, '') || '?';
}

/**
 * Chi chiede: il player audio di iOS (AppleCoreMedia) o l'app (fetch). Serve
 * a separare "l'app ha chiesto il brano" da "il player lo sta scaricando".
 */
export function client(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  if (/AppleCoreMedia|AVPlayer/i.test(ua)) return 'player-ios';
  if (/ExoPlayer|androidx\.media3/i.test(ua)) return 'player-android';
  if (/^curl\//.test(ua)) return 'curl';
  if (/CFNetwork|Darwin|okhttp|Expo|MarioMusic/i.test(ua)) return 'app';
  if (/Mozilla/.test(ua)) return 'browser';
  return ua ? ua.slice(0, 30) : '-';
}

/**
 * Una riga per richiesta, scritta quando la risposta finisce OPPURE quando la
 * connessione si chiude prima. Prima si ascoltava solo 'finish': una
 * richiesta abbandonata a metà dal telefono (rete che cade, player che
 * rinuncia) non lasciava traccia, e nel log restava solo la sonda da 2 byte.
 */
export function registraRichiesta(req: IncomingMessage, res: ServerResponse, url: URL): void {
  const inizio = process.hrtime.bigint();
  const byteIniziali = req.socket.bytesWritten;
  let scritta = false;

  const scrivi = (interrotta: boolean) => {
    if (scritta) return;
    scritta = true;
    const ms = Number(process.hrtime.bigint() - inizio) / 1e6;
    const range = req.headers.range ? ` range=${req.headers.range}` : '';
    const chi = `${provenienza(req)} ${client(req.headers['user-agent'])}`;
    const esito = interrotta
      ? `INTERROTTA dopo ${ms.toFixed(0)}ms, inviati ~${req.socket.bytesWritten - byteIniziali} byte`
      : `${res.statusCode} ${ms.toFixed(1)}ms`;
    console.log(`${req.method} ${url.pathname}${url.search} → ${esito}${range} [${chi}]`);
  };

  res.on('finish', () => scrivi(false));
  res.on('close', () => scrivi(!res.writableFinished));
}
