/**
 * seed.ts — genera una libreria musicale finta in media/library/.
 *
 * Serve per avere qualcosa da indicizzare senza toccare la musica vera.
 * Ogni traccia è un accordo sintetizzato da ffmpeg (tre onde sinusoidali
 * mixate) e viene scritta con i tag ID3 corretti + copertina incorporata:
 * per lo scanner è indistinguibile da un file reale scaricato da internet.
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const LIBRARY = path.resolve('media/library');
const TMP = path.resolve('media/.seed-tmp');

type Track = { title: string; note: string; seconds: number };
type Album = {
  artist: string;
  album: string;
  year: number;
  genre: string;
  /** due colori esadecimali: la copertina è un gradiente tra i due */
  colors: [string, string];
  /** contenitore/codec: cambia da album ad album apposta, per esercitare lo scanner */
  format: 'mp3' | 'm4a' | 'flac';
  tracks: Track[];
};

const CATALOGUE: Album[] = [
  {
    artist: 'Vetro Liquido',
    album: 'Correnti Ferme',
    year: 2021,
    genre: 'Ambient',
    colors: ['0x1f3b73', '0x9fd8e0'],
    format: 'mp3',
    tracks: [
      { title: 'Prima Luce', note: 'C3', seconds: 32 },
      { title: 'Bassa Marea', note: 'A2', seconds: 28 },
      { title: 'Vetrata', note: 'F3', seconds: 36 },
      { title: 'Correnti Ferme', note: 'D3', seconds: 41 },
      { title: 'Ritorno', note: 'G2', seconds: 30 },
    ],
  },
  {
    artist: 'Vetro Liquido',
    album: 'Notturno Urbano',
    year: 2023,
    genre: 'Downtempo',
    colors: ['0x2b1055', '0xd76d77'],
    format: 'm4a',
    tracks: [
      { title: 'Tangenziale', note: 'E3', seconds: 27 },
      { title: 'Insegne al Neon', note: 'B2', seconds: 34 },
      { title: 'Ultimo Tram', note: 'G3', seconds: 30 },
      { title: 'Alba in Periferia', note: 'C4', seconds: 38 },
    ],
  },
  {
    artist: 'Officina Tredici',
    album: 'Meccanica Popolare',
    year: 2019,
    genre: 'Elettronica',
    colors: ['0x3d1f00', '0xff9f45'],
    format: 'mp3',
    tracks: [
      { title: 'Ingranaggi', note: 'A3', seconds: 26 },
      { title: 'Cinghia di Trasmissione', note: 'D4', seconds: 33 },
      { title: 'Turno di Notte', note: 'F3', seconds: 29 },
      { title: 'Officina Tredici', note: 'C3', seconds: 44 },
      { title: 'Fine Corsa', note: 'E2', seconds: 25 },
    ],
  },
  {
    artist: 'Chiara Vento',
    album: 'Radici',
    year: 2024,
    genre: 'Folk',
    colors: ['0x14432a', '0xc9e265'],
    format: 'flac',
    tracks: [
      { title: 'Terra Battuta', note: 'G3', seconds: 31 },
      { title: 'Nel Cortile', note: 'D3', seconds: 28 },
      { title: 'Radici', note: 'A3', seconds: 37 },
      { title: 'Controra', note: 'E3', seconds: 26 },
    ],
  },
];

/** Nome di nota (es. "A3") → frequenza in Hz, secondo il temperamento equabile. */
function noteToHz(note: string): number {
  const semitones: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  const letter = note[0].toUpperCase();
  const octave = Number(note.slice(1));
  // MIDI 69 = A4 = 440 Hz. La numerazione MIDI parte da C-1, da cui il +12.
  const midi = (octave + 1) * 12 + semitones[letter];
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Rende sicuro un titolo da usare come nome di file. */
function safe(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim();
}

async function makeCover(dest: string, [from, to]: [string, string]) {
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', `gradients=s=640x640:c0=${from}:c1=${to}:type=radial:d=1`,
    '-frames:v', '1',
    dest,
  ]);
}

async function makeTrack(album: Album, track: Track, index: number, cover: string, dest: string) {
  const root = noteToHz(track.note);
  // Un accordo minore: fondamentale + terza minore (3 semitoni) + quinta (7).
  const third = root * 2 ** (3 / 12);
  const fifth = root * 2 ** (7 / 12);
  const d = track.seconds;

  // filter_complex: tre generatori sinusoidali → mix → tremolo → dissolvenze.
  // Senza le dissolvenze si sentirebbe un "click" secco a inizio e fine file.
  const filter = [
    `sine=frequency=${root.toFixed(2)}:duration=${d}[a]`,
    `sine=frequency=${third.toFixed(2)}:duration=${d}[b]`,
    `sine=frequency=${fifth.toFixed(2)}:duration=${d}[c]`,
    `[a][b][c]amix=inputs=3:normalize=1[mix]`,
    `[mix]tremolo=f=${(2 + (index % 3)).toFixed(1)}:d=0.4[trem]`,
    `[trem]afade=t=in:d=1.5,afade=t=out:st=${d - 2}:d=2[out]`,
  ].join(';');

  const meta = [
    '-metadata', `title=${track.title}`,
    '-metadata', `artist=${album.artist}`,
    '-metadata', `album_artist=${album.artist}`,
    '-metadata', `album=${album.album}`,
    '-metadata', `track=${index + 1}/${album.tracks.length}`,
    '-metadata', `date=${album.year}`,
    '-metadata', `genre=${album.genre}`,
  ];

  const codec =
    album.format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3']
    : album.format === 'm4a' ? ['-c:a', 'aac', '-b:a', '192k']
    : ['-c:a', 'flac'];

  // La copertina entra come secondo input ed è "mappata" come stream video:
  // è così che i tag ID3/MP4 trasportano l'immagine dentro al file audio.
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-filter_complex', filter,
    '-i', cover,
    '-map', '[out]', '-map', '0:v',
    ...codec,
    '-c:v', 'copy',
    '-disposition:v', 'attached_pic',
    '-metadata:s:v', 'title=Album cover',
    '-metadata:s:v', 'comment=Cover (front)',
    ...meta,
    dest,
  ]);
}

async function main() {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });

  let count = 0;
  for (const album of CATALOGUE) {
    const dir = path.join(LIBRARY, safe(album.artist), `${safe(album.album)} (${album.year})`);
    await mkdir(dir, { recursive: true });

    const cover = path.join(TMP, `${safe(album.album)}.png`);
    await makeCover(cover, album.colors);
    // Alcuni lettori (e il nostro scanner, più avanti) cercano anche un
    // cover.jpg accanto ai file: lo lasciamo come fallback.
    await writeFile(path.join(dir, 'cover.png'), await import('node:fs/promises').then(fs => fs.readFile(cover)));

    for (const [i, track] of album.tracks.entries()) {
      const num = String(i + 1).padStart(2, '0');
      const dest = path.join(dir, `${num} - ${safe(track.title)}.${album.format}`);
      await makeTrack(album, track, i, cover, dest);
      count++;
      process.stdout.write(`  ✓ ${album.artist} — ${album.album} — ${num} ${track.title}\n`);
    }
  }

  await rm(TMP, { recursive: true, force: true });
  console.log(`\nFatte ${count} tracce in ${path.relative(process.cwd(), LIBRARY)}`);
  console.log('Prossimo passo: npm run scan');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
