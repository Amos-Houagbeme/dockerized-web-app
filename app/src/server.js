'use strict';

const http = require('node:http');
const os = require('node:os');
const { Pool } = require('pg');
const page = require('./ui');

const PORT = Number(process.env.PORT || 3000);
const COLS = 'id, text, done, created_at';

function logRequest(method, path, status, startedAt) {
  // Une ligne JSON par requête sur stdout : récupérée par Docker (puis par syslog si configuré).
  console.log(JSON.stringify({ ts: new Date().toISOString(), method, path, status, ms: Date.now() - startedAt }));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    const bad = (msg) => Object.assign(new Error(msg), { bad: true });
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) { reject(bad('Requête trop volumineuse')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(bad('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

function createServer(pool) {
  return http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const { pathname } = new URL(req.url, 'http://localhost');

    const send = (status, type, body, silent = false) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
      if (!silent) logRequest(req.method, pathname, status, startedAt);
    };
    const json = (status, data, silent) => send(status, 'application/json', JSON.stringify(data), silent);

    try {
      if (req.method === 'GET' && pathname === '/health') {
        // Pas de log : le healthcheck Docker passe toutes les 10 s et noierait les journaux.
        try { await pool.query('SELECT 1'); return json(200, { status: 'ok' }, true); }
        catch { return json(503, { status: 'db_unavailable' }, true); }
      }

      if (req.method === 'GET' && pathname === '/') return send(200, 'text/html; charset=utf-8', page);

      if (req.method === 'GET' && pathname === '/api/info') {
        let db = 'ok';
        try { await pool.query('SELECT 1'); } catch { db = 'indisponible'; }
        return json(200, { hostname: os.hostname(), uptime: Math.round(process.uptime()), db });
      }

      if (pathname === '/api/notes') {
        if (req.method === 'GET') {
          const r = await pool.query(`SELECT ${COLS} FROM notes ORDER BY id DESC`);
          return json(200, r.rows);
        }
        if (req.method === 'POST') {
          const { text } = await readJson(req);
          const clean = typeof text === 'string' ? text.trim() : '';
          if (!clean || clean.length > 200) return json(400, { error: 'Texte requis (200 caractères max)' });
          const r = await pool.query(`INSERT INTO notes (text) VALUES ($1) RETURNING ${COLS}`, [clean]);
          return json(201, r.rows[0]);
        }
      }

      const m = pathname.match(/^\/api\/notes\/(\d+)$/);
      if (m && req.method === 'PATCH') {
        const r = await pool.query(`UPDATE notes SET done = NOT done WHERE id = $1 RETURNING ${COLS}`, [m[1]]);
        return r.rows.length ? json(200, r.rows[0]) : json(404, { error: 'Introuvable' });
      }
      if (m && req.method === 'DELETE') {
        const r = await pool.query('DELETE FROM notes WHERE id = $1', [m[1]]);
        return r.rowCount ? send(204, 'text/plain', '') : json(404, { error: 'Introuvable' });
      }

      return json(404, { error: 'Introuvable' });
    } catch (err) {
      if (err.bad) return json(400, { error: err.message });
      console.error(JSON.stringify({ ts: new Date().toISOString(), error: err.message }));
      return json(500, { error: 'Erreur interne' });
    }
  });
}

async function initDb(pool, attempts = 10, delayMs = 2000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      return;
    } catch (err) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), msg: `Base indisponible (tentative ${i}/${attempts})`, error: err.message }));
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 5,
  });
  await initDb(pool);

  const server = createServer(pool);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), msg: `Écoute sur le port ${PORT}` }));
  });

  // Node est le processus principal (PID 1) du conteneur : il gère SIGTERM lui-même pour un arrêt propre.
  const shutdown = (signal) => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), msg: `${signal} reçu, arrêt propre` }));
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), fatal: err.message }));
    process.exit(1);
  });
}

module.exports = { createServer, initDb };
