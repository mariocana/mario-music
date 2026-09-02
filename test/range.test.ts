/**
 * Test delle regole HTTP Range, che nel progetto sono implementate DUE volte:
 * in server/stream.ts (lato server) e in web/public/sw.js (lato browser, per
 * i brani scaricati). Devono comportarsi allo stesso modo, altrimenti il seek
 * funzionerebbe online e si romperebbe offline.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { parseRange } from '../server/stream.ts';

/* ───────────────────────── lato server ───────────────────────── */

test('parseRange: nessun header → si serve tutto il file', () => {
  assert.equal(parseRange(undefined, 1000), null);
});

test('parseRange: intervallo chiuso', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
});

test('parseRange: intervallo aperto a destra', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('parseRange: suffisso, gli ultimi N byte', () => {
  assert.deepEqual(parseRange('bytes=-50', 1000), { start: 950, end: 999 });
});

test('parseRange: fine oltre il file viene troncata, non è un errore', () => {
  assert.deepEqual(parseRange('bytes=900-99999', 1000), { start: 900, end: 999 });
});

test('parseRange: inizio oltre il file → 416', () => {
  assert.equal(parseRange('bytes=5000-', 1000), 'unsatisfiable');
});

test('parseRange: intervallo rovesciato → 416', () => {
  assert.equal(parseRange('bytes=800-100', 1000), 'unsatisfiable');
});

test('parseRange: header illeggibile → si ignora e si serve tutto', () => {
  assert.equal(parseRange('righe=1-2', 1000), null);
  assert.equal(parseRange('bytes=abc-def', 1000), null);
});

/* ───────────────── lato browser: il service worker ───────────────── */

/** Cache API finta, quanto basta a far girare sw.js fuori dal browser. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (req: unknown) =>
    new URL(typeof req === 'string' ? req : (req as Request).url, 'http://localhost').pathname;

  return {
    stores,
    api: {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          match: async (req: unknown) => store.get(keyOf(req)),
          put: async (req: unknown, res: Response) => { store.set(keyOf(req), res); },
          delete: async (req: unknown) => store.delete(keyOf(req)),
          keys: async () => [...store.keys()].map((p) => new Request(`http://localhost${p}`)),
          addAll: async () => {},
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
  };
}

/** Carica sw.js in una sandbox e restituisce il suo gestore 'fetch'. */
function loadServiceWorker() {
  const cachesMock = fakeCaches();
  const listeners = new Map<string, (event: unknown) => void>();

  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    location: new URL('http://localhost/'),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  const sandbox = {
    self,
    caches: cachesMock.api,
    fetch: async () => new Response('dalla rete', { status: 200 }),
    Response, Request, URL, Blob, console,
  };

  const code = readFileSync(path.resolve('web/public/sw.js'), 'utf8');
  vm.runInNewContext(code, vm.createContext(sandbox));

  /** Simula una richiesta e restituisce la risposta prodotta dal worker. */
  async function request(url: string, headers: Record<string, string> = {}) {
    const handler = listeners.get('fetch');
    assert.ok(handler, 'sw.js non ha registrato un gestore fetch');
    let promise: Promise<Response> | null = null;
    handler({
      request: new Request(url, { headers }),
      respondWith: (p: Promise<Response>) => { promise = p; },
    });
    return promise ? await promise : null;
  }

  return { request, caches: cachesMock };
}

/** Mette in cache un brano finto di `size` byte, come farebbe un download. */
async function seedTrack(sw: ReturnType<typeof loadServiceWorker>, id: number, size: number) {
  const bytes = new Uint8Array(size).map((_, i) => i % 256);
  const cache = await sw.caches.api.open('media');
  await cache.put(`/api/tracks/${id}/stream`, new Response(new Blob([bytes]), {
    headers: { 'Content-Type': 'audio/mpeg' },
  }));
  return bytes;
}

test('sw: brano scaricato, senza Range → 200 con tutto il file', async () => {
  const sw = loadServiceWorker();
  await seedTrack(sw, 1, 1000);

  const res = await sw.request('http://localhost/api/tracks/1/stream');
  assert.equal(res!.status, 200);
  assert.equal(res!.headers.get('Accept-Ranges'), 'bytes');
  assert.equal((await res!.arrayBuffer()).byteLength, 1000);
});

test('sw: brano scaricato, con Range → 206 con la fetta giusta', async () => {
  const sw = loadServiceWorker();
  const bytes = await seedTrack(sw, 1, 1000);

  const res = await sw.request('http://localhost/api/tracks/1/stream', { Range: 'bytes=100-199' });
  assert.equal(res!.status, 206, 'senza 206 Safari smette di far funzionare il seek');
  assert.equal(res!.headers.get('Content-Range'), 'bytes 100-199/1000');
  assert.equal(res!.headers.get('Content-Length'), '100');

  const body = new Uint8Array(await res!.arrayBuffer());
  assert.equal(body.length, 100);
  assert.deepEqual([...body], [...bytes.slice(100, 200)], 'la fetta non corrisponde ai byte richiesti');
});

test('sw: Range aperto a destra → fino alla fine del file', async () => {
  const sw = loadServiceWorker();
  await seedTrack(sw, 1, 1000);

  const res = await sw.request('http://localhost/api/tracks/1/stream', { Range: 'bytes=900-' });
  assert.equal(res!.status, 206);
  assert.equal(res!.headers.get('Content-Range'), 'bytes 900-999/1000');
});

test('sw: Range fuori dal file → 416, come il server', async () => {
  const sw = loadServiceWorker();
  await seedTrack(sw, 1, 1000);

  const res = await sw.request('http://localhost/api/tracks/1/stream', { Range: 'bytes=9999-' });
  assert.equal(res!.status, 416);
  assert.equal(res!.headers.get('Content-Range'), 'bytes */1000');
});

test('sw: brano non scaricato → si passa la mano alla rete', async () => {
  const sw = loadServiceWorker();
  const res = await sw.request('http://localhost/api/tracks/42/stream');
  assert.equal(res!.status, 200);
  assert.equal(await res!.text(), 'dalla rete');
});
