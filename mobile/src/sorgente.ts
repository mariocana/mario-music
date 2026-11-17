/**
 * sorgente.ts — logica di selezione dello stream URL.
 */

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

export type CanPlay = (mime: string) => string;

export function leggibile(codec: string | null | undefined, canPlay: CanPlay): boolean {
  const mime = codec ? MIME_PER_CODEC[codec] : undefined;
  if (!mime) return true;
  return canPlay(mime) !== '';
}

export type Scelta = { scaricato: boolean; qualita: Qualita; canPlay: CanPlay };

export function urlBrano(id: number, codec: string | null | undefined, s: Scelta): string {
  if (s.scaricato) return `/api/tracks/${id}/stream?offline`;
  if (s.qualita === 'risparmio' || !leggibile(codec, s.canPlay)) return `/api/tracks/${id}/stream?format=aac`;
  return `/api/tracks/${id}/stream`;
}
