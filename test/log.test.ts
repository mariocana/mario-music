/**
 * Log: orario leggibile e riconoscimento di chi fa la richiesta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { client, orario, provenienza } from '../server/log.ts';
import type { IncomingMessage } from 'node:http';

test('orario: data e ora locali con i millesimi, a larghezza fissa', () => {
  assert.equal(orario(new Date(2026, 10, 1, 9, 5, 3, 7)), '2026-11-01 09:05:03.007');
});

test('client: il player di iOS si distingue dall\'app', () => {
  assert.equal(client('AppleCoreMedia/1.0.0.23A341 (iPhone; U; CPU OS 26_0 like Mac OS X; it_it)'), 'player-ios');
  assert.equal(client('MarioMusic/10 CFNetwork/3826.400.120 Darwin/25.0.0'), 'app');
  assert.equal(client('curl/8.7.1'), 'curl');
  assert.equal(client(undefined), '-');
});

const req = (headers: Record<string, string>, remoteAddress = '127.0.0.1') =>
  ({ headers, socket: { remoteAddress } }) as unknown as IncomingMessage;

test('provenienza: dietro tailscale serve conta X-Forwarded-For', () => {
  assert.equal(provenienza(req({ 'x-forwarded-for': '100.72.74.79' })), '100.72.74.79');
  assert.equal(provenienza(req({ 'x-forwarded-for': '100.72.74.79, 127.0.0.1' })), '100.72.74.79');
  assert.equal(provenienza(req({}, '::ffff:192.168.1.20')), '192.168.1.20');
});
