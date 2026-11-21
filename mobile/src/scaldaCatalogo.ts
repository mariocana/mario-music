/**
 * scaldaCatalogo.ts — riempie il catalogo offline appena il server risponde.
 *
 * Il catalogo si salva da solo man mano che si aprono le schermate (vedi
 * get() in api.ts), ma così offline si vedrebbe solo quello già visitato.
 * All'avvio, in sottofondo, si chiedono anche le liste principali e le
 * copertine degli album: come faceva il web con il service worker.
 *
 * I dettagli dei singoli album no: sarebbero centinaia di richieste, e
 * offline la pagina di un album mai aperto mostra comunque i brani scaricati.
 */
import { Image } from 'expo-image';
import { api, coverUrl, isServerOnlineSync, playlistCoverUrl } from './api';

/** Una volta per avvio dell'app: le schermate aperte poi tengono aggiornato il resto. */
let fatto = false;

/** Copertine a gruppi: tutte insieme intaserebbero la rete per la musica. */
const GRUPPO = 12;

export async function scaldaCatalogo(): Promise<void> {
  if (fatto) return;
  fatto = true;
  try {
    // Ognuna per conto suo: se una va in timeout (la lista di tutti i brani
    // pesa un mega) le altre, e le copertine, si salvano lo stesso.
    const [albums, playlists] = await Promise.all([
      api.albums().catch(() => []),
      api.playlists().catch(() => []),
      api.artists().catch(() => null),
      api.tracks().catch(() => null),
      api.home().catch(() => null),
      api.stats().catch(() => null),
      api.favorites().catch(() => null),
    ]);
    // Da offline le richieste ripiegano sul catalogo già salvato e non
    // falliscono: non vale come riscaldamento, si rifarà quando il server torna.
    if (!isServerOnlineSync()) {
      fatto = false;
      return;
    }
    if (albums.length === 0 && playlists.length === 0) throw new Error('niente da scaldare');

    const copertine = [
      ...albums.filter((a) => a.coverKey).map((a) => coverUrl(a.id, a.coverKey)),
      ...playlists.filter((p) => p.coverKey).map((p) => playlistCoverUrl(p.id, p.coverKey)),
    ];
    for (let i = 0; i < copertine.length; i += GRUPPO) {
      // expo-image salta da solo quelle che ha già su disco.
      await Image.prefetch(copertine.slice(i, i + GRUPPO), 'disk').catch(() => false);
    }
  } catch {
    // Il server è sparito a metà: si riproverà al prossimo avvio.
    fatto = false;
  }
}
