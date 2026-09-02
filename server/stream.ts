/**
 * stream.ts — invio di un file al client con supporto HTTP Range.
 *
 * È il cuore dello streaming. Senza Range il browser dovrebbe scaricare
 * l'intero file prima di poterti far saltare al minuto 3: con Range chiede
 * solo la fetta di byte che gli serve, e il server risponde 206.
 *
 * Dialogo tipico di un <audio> che salta a metà brano:
 *   → GET /api/tracks/7/stream        Range: bytes=0-
 *   ← 206 Partial Content             Content-Range: bytes 0-869/870363
 *   (l'utente trascina la barra)
 *   → GET /api/tracks/7/stream        Range: bytes=435000-
 *   ← 206 Partial Content             Content-Range: bytes 435000-870362/870363
 */
import { createReadStream } from 'node:fs';
import type { Stats } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Range = { start: number; end: number };

/**
 * Interpreta l'header Range. Gestiamo solo il caso a intervallo singolo:
 * i range multipli (multipart/byteranges) esistono ma nessun player li usa.
 *
 * Forme accettate:  bytes=0-1023   bytes=1024-   bytes=-500 (ultimi 500 byte)
 * Ritorna null se l'header è assente o illeggibile (→ si serve tutto il file),
 * 'unsatisfiable' se l'intervallo cade fuori dal file (→ 416).
 */
export function parseRange(header: string | undefined, size: number): Range | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (rawStart === '') {
    if (rawEnd === '') return null;
    // "bytes=-500": gli ultimi 500 byte. Utile ai player per leggere i tag
    // in coda al file (ID3v1) senza scaricare tutto.
    const suffix = Number(rawEnd);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return 'unsatisfiable';
  // Un client può chiedere oltre la fine del file: si tronca, non è un errore.
  return { start, end: Math.min(end, size - 1) };
}

/** Identificatore di versione del file: se cambia, la cache del browser è stale. */
export function etagFor(stats: Stats): string {
  return `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
}

export type SendOptions = {
  contentType: string;
  /** valore di Cache-Control; i file audio sono immutabili finché non li rimpiazzi */
  cacheControl?: string;
  /** nome suggerito per il download (aggiunge Content-Disposition) */
  downloadAs?: string;
};

export function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  stats: Stats,
  opts: SendOptions,
): void {
  const etag = etagFor(stats);
  const lastModified = stats.mtime.toUTCString();

  const base: Record<string, string> = {
    'Content-Type': opts.contentType,
    // Senza questo header il browser non prova nemmeno a chiedere un Range,
    // e la barra di avanzamento diventa non trascinabile.
    'Accept-Ranges': 'bytes',
    'Cache-Control': opts.cacheControl ?? 'private, max-age=86400',
    ETag: etag,
    'Last-Modified': lastModified,
  };
  if (opts.downloadAs) {
    base['Content-Disposition'] = `attachment; filename="${encodeURIComponent(opts.downloadAs)}"`;
  }

  // Richiesta condizionale: il client ha già il file e chiede solo conferma.
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, base);
    res.end();
    return;
  }

  // If-Range: "mandami la fetta solo se il file non è cambiato da quando l'ho
  // visto". Se è cambiato si risponde con l'intero file, così il player
  // riparte da una base coerente invece di incollare pezzi di versioni diverse.
  const ifRange = req.headers['if-range'];
  const rangeStillValid = !ifRange || ifRange === etag || ifRange === lastModified;

  const range = rangeStillValid ? parseRange(req.headers.range, stats.size) : null;

  if (range === 'unsatisfiable') {
    res.writeHead(416, { ...base, 'Content-Range': `bytes */${stats.size}` });
    res.end();
    return;
  }

  const { start, end } = range ?? { start: 0, end: stats.size - 1 };
  const length = end - start + 1;
  const status = range ? 206 : 200;

  const headers: Record<string, string> = { ...base, 'Content-Length': String(length) };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;

  res.writeHead(status, headers);

  // Una richiesta HEAD vuole gli header ma non il corpo (il player la usa
  // per scoprire durata e dimensione prima di iniziare a scaricare).
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(filePath, { start, end });
  // Saltare avanti nel brano fa abortire la richiesta in corso: senza questa
  // riga il file resterebbe aperto e i descrittori si accumulerebbero.
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
