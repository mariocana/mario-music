/**
 * sorgente.ts — quale URL chiedere per un brano.
 *
 * Tre cose decidono:
 *   1. è scaricato?            → ?offline, lo serve il service worker
 *   2. il browser legge il suo formato? (canPlayType)  → altrimenti ?format=aac
 *   3. l'utente ha scelto "risparmio dati"?            → ?format=aac
 *
 * È il browser a sapere cosa legge, non il server: Chrome non apre ALAC,
 * Safari non apre Ogg, e solo `audio.canPlayType` lo sa per certo. Il server
 * poi decide se convertire davvero (un MP3 resta MP3, vedi transcode.ts).
 *
 * Solo logica pura, senza DOM: così i test girano in Node.
 */
import { streamUrl, offlineUrl } from './api.ts';

export type Qualita = 'originale' | 'risparmio';
export const CHIAVE_QUALITA = 'mario-music.qualita';

/** Il codec che ffprobe scrive nel DB → il MIME che canPlayType capisce. */
const MIME_PER_CODEC: Record<string, string> = {
  mp3: 'audio/mpeg',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  alac: 'audio/mp4; codecs="alac"',
  flac: 'audio/flac',
  vorbis: 'audio/ogg; codecs="vorbis"',
  opus: 'audio/ogg; codecs="opus"',
  pcm_s16le: 'audio/wav',
  pcm_s24le: 'audio/wav',
  wmav2: 'audio/x-ms-wma',
};

/** Firma di HTMLMediaElement.canPlayType: '' | 'maybe' | 'probably'. */
export type CanPlay = (mime: string) => string;

/**
 * Il browser sa leggere questo codec? In dubbio (codec sconosciuto, o
 * canPlayType che tace) si risponde sì: meglio provare l'originale che
 * convertire a vuoto.
 */
export function leggibile(codec: string | null | undefined, canPlay: CanPlay): boolean {
  const mime = codec ? MIME_PER_CODEC[codec] : undefined;
  if (!mime) return true;
  return canPlay(mime) !== '';
}

export type Scelta = { scaricato: boolean; qualita: Qualita; canPlay: CanPlay };

export function urlBrano(id: number, codec: string | null | undefined, s: Scelta): string {
  if (s.scaricato) return offlineUrl(id);
  if (s.qualita === 'risparmio' || !leggibile(codec, s.canPlay)) return `${streamUrl(id)}?format=aac`;
  return streamUrl(id);
}

/* ── la preferenza dell'utente, in localStorage ── */

export function leggiQualita(): Qualita {
  try {
    return localStorage.getItem(CHIAVE_QUALITA) === 'risparmio' ? 'risparmio' : 'originale';
  } catch {
    return 'originale';
  }
}

// Chi vuole sapere quando cambia (il player, la pagina delle impostazioni).
const ascoltatori = new Set<() => void>();
let corrente: Qualita | null = null;

export function qualitaCorrente(): Qualita {
  if (corrente === null) corrente = leggiQualita();
  return corrente;
}

export function impostaQualita(q: Qualita): void {
  corrente = q;
  try {
    localStorage.setItem(CHIAVE_QUALITA, q);
  } catch {
    /* navigazione privata o quota piena: la scelta vale per questa sessione */
  }
  for (const fn of ascoltatori) fn();
}

export function sottoscriviQualita(fn: () => void): () => void {
  ascoltatori.add(fn);
  return () => { ascoltatori.delete(fn); };
}
