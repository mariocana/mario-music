/**
 * Karaoke: quanto è avanzata la riga che si sta cantando.
 *
 * Il test che spiega la funzione è quello sull'assolo: fra due versi possono
 * passare quindici secondi, e riempire la riga in quindici secondi la farebbe
 * strisciare per tutto l'intermezzo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { durataRiga, avanzamentoRiga, finestra, parole } from '../web/src/karaoke.ts';
import type { LyricLine } from '../web/src/api.ts';

const righe: LyricLine[] = [
  { t: 0, text: 'Nel blu dipinto di blu' },      // 22 caratteri
  { t: 4, text: 'Felice di stare lassù' },       // 21
  { t: 8, text: '' },                            // un verso vuoto: pausa
  { t: 30, text: 'E volavo volavo felice' },     // dopo un assolo di 22 secondi
];

test('la riga si riempie da 0 a 1 nel tempo che dura', () => {
  assert.equal(avanzamentoRiga(righe, 0, 0), 0);
  assert.equal(avanzamentoRiga(righe, 0, 10), 1, 'molto dopo è piena');
  const metà = avanzamentoRiga(righe, 0, durataRiga(righe, 0) / 2);
  assert.ok(Math.abs(metà - 0.5) < 1e-9);
});

test('prima che cominci è vuota, non negativa', () => {
  assert.equal(avanzamentoRiga(righe, 1, 0), 0);
  assert.equal(avanzamentoRiga(righe, 1, 3.9), 0);
});

test('vince sempre la più breve: il tempo che c\'è o quello che serve a cantarla', () => {
  // Riga 1: quattro secondi fino alla successiva, ma ventun caratteri si
  // cantano in meno di due. Si riempie in due e poi aspetta: è il
  // comportamento che serve quando fra un verso e l'altro c'è un assolo.
  assert.ok(Math.abs(durataRiga(righe, 1) - 21 / 12) < 1e-9);
  assert.ok(avanzamentoRiga(righe, 1, 4 + 2) === 1, 'a verso finito è piena, non a metà');

  // Riga 3, ultima, con il brano che dura 40 s: stesso ragionamento.
  assert.ok(durataRiga(righe, 3, 40) < 4);

  // Caso opposto: versi fitti, testo lungo. Qui non c'è tempo di cantarlo
  // tutto, e comanda la distanza dal verso dopo.
  const fitte = [
    { t: 0, text: 'Un verso molto lungo che non sta in un secondo di canto' },
    { t: 1, text: 'il successivo' },
  ];
  assert.equal(durataRiga(fitte, 0), 1);
});

test('una riga vuota è una pausa: dura fino alla successiva', () => {
  // Non c'è niente da cantare, quindi nessuna fretta di "riempirla".
  assert.equal(durataRiga(righe, 2), 22);
});

test('l\'ultima riga senza durata del brano non dura all\'infinito', () => {
  const sole: LyricLine[] = [{ t: 10, text: 'Ultima' }];
  const d = durataRiga(sole, 0);
  assert.ok(d > 0 && d < 6, `atteso qualcosa di sensato, trovato ${d}`);
  assert.equal(avanzamentoRiga(sole, 0, 10), 0);
  assert.equal(avanzamentoRiga(sole, 0, 100), 1);
});

test('indici fuori posto non rompono niente', () => {
  assert.equal(avanzamentoRiga(righe, -1, 5), 0);
  assert.equal(avanzamentoRiga(righe, 99, 5), 0);
  assert.equal(avanzamentoRiga(null, 0, 5), 0);
  assert.equal(durataRiga(righe, -1), 0);
});

test('la finestra mostra qualche riga prima e qualcuna dopo', () => {
  const f = finestra(righe, 2, { prima: 1, dopo: 1 });
  assert.deepEqual(f.righe.map((r) => r.indice), [1, 2, 3]);
  assert.equal(f.attiva, 1, 'la riga corrente è la seconda della finestra');
});

test('la finestra non esce dai bordi del testo', () => {
  const inizio = finestra(righe, 0, { prima: 2, dopo: 2 });
  assert.deepEqual(inizio.righe.map((r) => r.indice), [0, 1, 2]);
  assert.equal(inizio.attiva, 0);

  const fine = finestra(righe, 3, { prima: 1, dopo: 3 });
  assert.deepEqual(fine.righe.map((r) => r.indice), [2, 3]);
});

test('prima che cominci il canto si vedono le prime righe, non il vuoto', () => {
  // Durante l'introduzione strumentale indiceAttivo vale -1.
  const f = finestra(righe, -1);
  assert.ok(f.righe.length > 0, 'lo schermo non deve restare vuoto');
  assert.equal(f.attiva, -1, 'ma nessuna riga è ancora quella in corso');
});

test('senza testo non c\'è finestra', () => {
  assert.deepEqual(finestra([], 0), { righe: [], attiva: -1 });
  assert.deepEqual(finestra(null, 0), { righe: [], attiva: -1 });
});

test('le parole portano la frazione di riga a cui cominciano', () => {
  const p = parole('Nel blu dipinto');
  assert.deepEqual(p.map((x) => x.testo), ['Nel', ' ', 'blu', ' ', 'dipinto']);
  assert.equal(p[0].inizio, 0, 'la prima parola comincia subito');
  // 'Nel ' sono 4 caratteri su 15: la seconda parola comincia a 4/15.
  assert.ok(Math.abs(p[2].inizio - 4 / 15) < 1e-9);
  // Le frazioni crescono e restano dentro il verso.
  for (let i = 1; i < p.length; i++) assert.ok(p[i].inizio >= p[i - 1].inizio);
  assert.ok(p[p.length - 1].inizio < 1);
});

test('gli spazi si conservano: le parole non si attaccano fra loro', () => {
  assert.equal(parole('due  spazi').map((x) => x.testo).join(''), 'due  spazi');
});

test('una riga senza testo non produce parole fasulle', () => {
  assert.deepEqual(parole(''), []);
  assert.deepEqual(parole('   ').map((x) => x.testo), ['   ']);
});
