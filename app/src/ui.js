'use strict';

// Interface web embarquée dans un module JS : le Dockerfile n'a besoin de copier que `src/`.
module.exports = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pense-bête</title>
<style>
  :root { --bg:#0f1115; --card:#1a1d24; --line:#2a2f3a; --txt:#e8eaed; --mut:#9aa0a6; --acc:#4fc3f7; --ok:#66bb6a; --ko:#ef5350; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--txt); }
  main { max-width: 560px; margin: 0 auto; padding: 2rem 1rem 4rem; }
  h1 { margin:0 0 .25rem; font-size:1.8rem; }
  .sub { color:var(--mut); margin:0 0 1.5rem; }
  .pills { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:1.5rem; }
  .pill { background:var(--card); border:1px solid var(--line); border-radius:999px; padding:.25rem .75rem; font-size:.8rem; color:var(--mut); }
  .pill b { color:var(--txt); font-weight:600; }
  .dot { display:inline-block; width:.5rem; height:.5rem; border-radius:50%; background:var(--mut); margin-right:.35rem; }
  .dot.ok { background:var(--ok); } .dot.ko { background:var(--ko); }
  form { display:flex; gap:.5rem; margin-bottom:1.25rem; }
  input[type=text] { flex:1; padding:.7rem .9rem; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--txt); font-size:1rem; }
  input[type=text]:focus { outline:2px solid var(--acc); border-color:transparent; }
  button { cursor:pointer; border:0; border-radius:10px; background:var(--acc); color:#06222f; font-weight:600; padding:0 1.1rem; font-size:1rem; }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:.6rem; }
  li { display:flex; align-items:center; gap:.75rem; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:.75rem .9rem; }
  li span { flex:1; word-break:break-word; }
  li.done span { text-decoration:line-through; color:var(--mut); }
  li input { width:1.15rem; height:1.15rem; accent-color:var(--ok); }
  li button.del { background:transparent; color:var(--mut); padding:.2rem .5rem; font-size:1.2rem; }
  li button.del:hover { color:var(--ko); }
  .empty { text-align:center; color:var(--mut); padding:2rem 0; }
  .err { color:var(--ko); min-height:1.2rem; font-size:.9rem; margin-bottom:.5rem; }
</style>
</head>
<body>
<main>
  <h1>Pense-bête</h1>
  <p class="sub">Tes notes sont stockées dans PostgreSQL et survivent aux redémarrages.</p>
  <div class="pills">
    <span class="pill">Servi par : <b id="host">…</b></span>
    <span class="pill"><span class="dot" id="dot"></span>Base : <b id="db">…</b></span>
    <span class="pill">Actif depuis : <b id="up">…</b></span>
    <span class="pill"><b id="count">0</b> note(s)</span>
  </div>
  <form id="f">
    <input type="text" id="t" maxlength="200" placeholder="Ajouter une note…" autocomplete="off" required>
    <button type="submit">Ajouter</button>
  </form>
  <div class="err" id="err"></div>
  <ul id="list"></ul>
</main>
<script>
  var $ = function (s) { return document.querySelector(s); };
  function api(path, method, body) {
    return fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined }).then(function (r) {
        if (!r.ok) throw new Error('Erreur ' + r.status);
        return r.status === 204 ? null : r.json();
      });
  }
  function render(notes) {
    var ul = $('#list'); ul.innerHTML = '';
    $('#count').textContent = notes.length;
    if (!notes.length) { ul.innerHTML = '<div class="empty">Aucune note pour le moment.</div>'; return; }
    notes.forEach(function (n) {
      var li = document.createElement('li'); if (n.done) li.className = 'done';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = n.done;
      cb.onchange = function () { act('/api/notes/' + n.id, 'PATCH'); };
      var sp = document.createElement('span'); sp.textContent = n.text;
      var del = document.createElement('button'); del.className = 'del'; del.textContent = '×'; del.title = 'Supprimer';
      del.onclick = function () { act('/api/notes/' + n.id, 'DELETE'); };
      li.append(cb, sp, del); ul.append(li);
    });
  }
  function load() {
    return Promise.all([api('/api/notes'), api('/api/info')]).then(function (r) {
      render(r[0]);
      $('#host').textContent = r[1].hostname;
      $('#up').textContent = r[1].uptime + ' s';
      $('#db').textContent = r[1].db === 'ok' ? 'connectée' : 'indisponible';
      $('#dot').className = 'dot ' + (r[1].db === 'ok' ? 'ok' : 'ko');
      $('#err').textContent = '';
    }).catch(function (e) { $('#err').textContent = e.message; $('#dot').className = 'dot ko'; });
  }
  function act(path, method, body) { return api(path, method, body).then(load).catch(function (e) { $('#err').textContent = e.message; }); }
  $('#f').onsubmit = function (e) {
    e.preventDefault();
    var v = $('#t').value.trim(); if (!v) return;
    act('/api/notes', 'POST', { text: v }).then(function () { $('#t').value = ''; $('#t').focus(); });
  };
  load();
</script>
</body>
</html>`;
