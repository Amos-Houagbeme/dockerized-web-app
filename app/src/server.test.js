'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createServer } = require('./server');

// Faux accès base de données en mémoire : les tests ne nécessitent ni PostgreSQL ni Docker.
function fakePool({ down = false } = {}) {
  const rows = [];
  let seq = 0;
  return {
    query: async (sql, params = []) => {
      if (down) throw new Error('connexion refusée');
      const s = sql.trim();
      if (s.startsWith('SELECT 1')) return { rows: [{}] };
      if (s.startsWith('SELECT')) return { rows: [...rows].reverse() };
      if (s.startsWith('INSERT')) {
        const r = { id: ++seq, text: params[0], done: false };
        rows.push(r);
        return { rows: [r] };
      }
      if (s.startsWith('UPDATE')) {
        const r = rows.find((x) => x.id === Number(params[0]));
        if (r) r.done = !r.done;
        return { rows: r ? [r] : [] };
      }
      if (s.startsWith('DELETE')) {
        const i = rows.findIndex((x) => x.id === Number(params[0]));
        if (i >= 0) rows.splice(i, 1);
        return { rowCount: i >= 0 ? 1 : 0 };
      }
      throw new Error('requête inattendue : ' + s);
    },
  };
}

async function withServer(pool, fn) {
  const server = createServer(pool);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

const post = (base, text) => fetch(`${base}/api/notes`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
});

test('/health : 200 si la base répond, 503 sinon', async () => {
  await withServer(fakePool(), async (b) => assert.strictEqual((await fetch(`${b}/health`)).status, 200));
  await withServer(fakePool({ down: true }), async (b) => assert.strictEqual((await fetch(`${b}/health`)).status, 503));
});

test('/ sert la page HTML', async () => {
  await withServer(fakePool(), async (b) => {
    const res = await fetch(`${b}/`);
    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /Pense-bête/);
  });
});

test('/api/info indique le nom du conteneur et l\'état de la base', async () => {
  await withServer(fakePool(), async (b) => {
    const info = await (await fetch(`${b}/api/info`)).json();
    assert.ok(info.hostname);
    assert.strictEqual(info.db, 'ok');
  });
});

test('créer, cocher puis supprimer une note', async () => {
  await withServer(fakePool(), async (b) => {
    const created = await post(b, '  Apprendre Docker  ');
    assert.strictEqual(created.status, 201);
    const note = await created.json();
    assert.strictEqual(note.text, 'Apprendre Docker');

    assert.strictEqual((await (await fetch(`${b}/api/notes`)).json()).length, 1);
    const toggled = await (await fetch(`${b}/api/notes/${note.id}`, { method: 'PATCH' })).json();
    assert.strictEqual(toggled.done, true);
    assert.strictEqual((await fetch(`${b}/api/notes/${note.id}`, { method: 'DELETE' })).status, 204);
    assert.strictEqual((await (await fetch(`${b}/api/notes`)).json()).length, 0);
  });
});

test('une note vide ou trop longue est refusée (400)', async () => {
  await withServer(fakePool(), async (b) => {
    assert.strictEqual((await post(b, '   ')).status, 400);
    assert.strictEqual((await post(b, 'x'.repeat(201))).status, 400);
  });
});

test('une route inconnue répond 404', async () => {
  await withServer(fakePool(), async (b) => assert.strictEqual((await fetch(`${b}/nimporte-quoi`)).status, 404));
});
