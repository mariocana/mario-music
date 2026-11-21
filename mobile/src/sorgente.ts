/**
 * sorgente.ts — da dove arriva il brano: copia scaricata, originale o versione convertita.
 *
 * "Risparmio" chiede al server la versione AAC a 256k (vedi server/transcode.ts):
 * un FLAC di quattro minuti passa da ~26 MB a ~7. MP3 e AAC restano come sono,
 * perché riconvertirli peggiorerebbe la qualità senza alleggerirli davvero.
 *
 * SEMPRE `full=1`. Un brano non ancora convertito il server lo manderebbe
 * mentre lo sta scrivendo, senza lunghezza e senza salti (`Accept-Ranges:
 * none`). Il browser lo digeriva; AVPlayer vuole le richieste a intervalli di
 * byte, e un errore a metà caricamento con expo-audio non si intercetta in modo
 * affidabile per ripiegare. Con `full=1` il server aspetta la fine della
 * conversione (~3 s la prima volta) e risponde come per un file qualunque. Per
 * non farla aspettare quasi mai, il player chiede di convertire il brano
 * successivo appena parte quello in corso (POST /prepare).
 */

export type Qualita = 'originale' | 'risparmio';
export const QUALITA: readonly Qualita[] = ['originale', 'risparmio'];
export const CHIAVE_QUALITA = 'mario-music.qualita';

/**
 * Formati che iOS e Android leggono da soli. Gli altri (ogg, wma…) passano
 * dalla conversione anche in qualità originale: meglio un AAC che un errore.
 */
const LEGGIBILI = new Set(['mp3', 'aac', 'alac', 'flac', 'pcm_s16le', 'pcm_s24le']);

/** Stessa regola di vaTranscodificato() sul server: MP3 e AAC non si convertono. */
export function convertibile(codec: string | null | undefined): boolean {
  return codec !== 'mp3' && codec !== 'aac';
}

/** Il brano va chiesto nella versione convertita? */
export function usaConversione(codec: string | null | undefined, qualita: Qualita): boolean {
  if (!convertibile(codec)) return false;
  if (qualita === 'risparmio') return true;
  // Codec sconosciuto (null): si prova l'originale, come faceva il web.
  return codec != null && !LEGGIBILI.has(codec);
}

/** Il pezzo di URL da aggiungere a /api/tracks/:id/stream. */
export function queryStream(codec: string | null | undefined, qualita: Qualita): string {
  return usaConversione(codec, qualita) ? '?format=aac&full=1' : '';
}
