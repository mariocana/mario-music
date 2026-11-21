/**
 * catalogo.ts — l'ultima risposta del server per ogni pagina, salvata su file.
 *
 * Serve a sfogliare la libreria senza rete: album, artisti, playlist, Per te.
 * Non è una cache che "risparmia richieste": online si chiede sempre al server
 * e si riscrive il file; il file si legge solo quando il server non risponde
 * (vedi get() in api.ts). Così non può mostrare dati vecchi a chi è connesso.
 *
 * Su file e non in AsyncStorage: /api/tracks con tutta la libreria pesa circa
 * un mega, e su Android AsyncStorage non legge valori oltre i 2 MB.
 * In documentDirectory e non in cacheDirectory: iOS svuota la seconda quando
 * gli manca spazio, cioè proprio quando si è in viaggio col telefono pieno.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { cartellaServer, nomeFile } from './catalogoChiavi';

const RADICE = `${FileSystem.documentDirectory}catalogo/`;
const cartellePronte = new Set<string>();

function cartella(base: string): string {
  return `${RADICE}${cartellaServer(base)}/`;
}

export async function leggiCatalogo<T>(base: string, path: string): Promise<T | null> {
  try {
    const testo = await FileSystem.readAsStringAsync(`${cartella(base)}${nomeFile(path)}`);
    return JSON.parse(testo) as T;
  } catch {
    // Mai salvato, o illeggibile: per chi chiama è lo stesso, non c'è.
    return null;
  }
}

export async function scriviCatalogo(base: string, path: string, dati: unknown): Promise<void> {
  const dir = cartella(base);
  try {
    if (!cartellePronte.has(dir)) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      cartellePronte.add(dir);
    }
    await FileSystem.writeAsStringAsync(`${dir}${nomeFile(path)}`, JSON.stringify(dati));
  } catch {
    // Disco pieno o simili: offline si avrà la versione precedente, o niente.
  }
}
