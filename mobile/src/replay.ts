/**
 * replay.ts — le scritte del riepilogo ascolti, come funzioni pure.
 *
 * I nomi dei mesi sono scritti qui e non chiesti a toLocaleDateString: sul
 * telefono il motore JavaScript può non avere i dati della lingua italiana,
 * e un grafico con "Oct" sotto le barre in un'app tutta in italiano stona.
 */

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** 784 → "13 h 4 min" ; 45 → "45 min" ; 120 → "2 h" */
export function oreMinuti(minuti: number): string {
  const totale = Math.max(0, Math.round(minuti));
  const h = Math.floor(totale / 60);
  const m = totale % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "2026-09" → "set" ; sotto le barre del grafico mese per mese. */
export function meseBreve(mese: string): string {
  const m = Number(mese.split('-')[1]);
  return MESI_BREVI[m - 1] ?? mese;
}

/** "2026-09" → "settembre 2026" ; per chi usa VoiceOver. */
export function meseLungo(mese: string): string {
  const [anno, m] = mese.split('-');
  const nome = MESI[Number(m) - 1];
  return nome ? `${nome} ${anno}` : mese;
}

/** "2026-11-17" → "17 novembre 2026" */
export function dataLunga(data: string): string {
  const [anno, m, g] = data.split('-').map(Number);
  const nome = MESI[m - 1];
  if (!nome || !g) return data;
  return `${g} ${nome} ${anno}`;
}

/** millisecondi → "17/11/2026", per "conto gli ascolti dal …" */
export function dataBreve(ms: number): string {
  const d = new Date(ms);
  const due = (n: number) => String(n).padStart(2, '0');
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 1 → "1 riproduzione" ; 3 → "3 riproduzioni" */
export function riproduzioni(n: number): string {
  return `${n} ${n === 1 ? 'riproduzione' : 'riproduzioni'}`;
}

/**
 * Altezza di una barra in proporzione al massimo, da 0 a 1. Una barra con
 * almeno un ascolto non scende mai sotto `minima`: deve vedersi, non sparire
 * accanto a una da cento.
 */
export function altezzaBarra(valore: number, massimo: number, minima = 0.03): number {
  if (valore <= 0 || massimo <= 0) return 0;
  return Math.max(minima, Math.min(1, valore / massimo));
}
