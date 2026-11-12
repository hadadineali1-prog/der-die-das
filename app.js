/* ============================================================
   Der Die Das — logique
   - sélection infinie de mots
   - répétition espacée (les erreurs reviennent vite)
   - statistiques et sauvegarde locale
   ============================================================ */
(function () {
'use strict';

/* ---------------- 1. Données ---------------- */

var BASE = (window.MOTS || []).map(function (r) {
  return { a: r[0], n: r[1], p: r[2], f: r[3], t: r[4], l: r[5], id: r[0] + '|' + r[1], custom: false };
});

var KEY = {
  prog: 'ddd.progress.v1',
  daily: 'ddd.daily.v1',
  conf: 'ddd.conf.v1',
  set: 'ddd.settings.v1',
  custom: 'ddd.custom.v1'
};

function load(k, def) {
  try { var raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : def; }
  catch (e) { return def; }
}
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) { return false; }
}

var prog = load(KEY.prog, {});
var daily = load(KEY.daily, {});
var conf = load(KEY.conf, {});
var custom = load(KEY.custom, []);

var LEVELS = ['A1', 'A2', 'B1', 'B2'];
var DEFAULT_SETTINGS = { levels: LEVELS.slice(), themes: null, audio: true, goal: 20 };
var settings = Object.assign({}, DEFAULT_SETTINGS, load(KEY.set, {}));
/* les niveaux sont désormais un choix unique (onglets) : on normalise les anciens réglages */
if (!Array.isArray(settings.levels) || settings.levels.length !== 1) settings.levels = LEVELS.slice();
else if (LEVELS.indexOf(settings.levels[0]) < 0) settings.levels = LEVELS.slice();
if (settings.themes !== null && !Array.isArray(settings.themes)) settings.themes = null;

var THEMES = [];
BASE.forEach(function (w) { if (THEMES.indexOf(w.t) < 0) THEMES.push(w.t); });

function themeList() {
  var t = THEMES.slice();
  if (custom.length) t.push('Mes mots');
  return t;
}

function customWords() {
  return custom.map(function (r) {
    return {
      a: r[0], n: r[1], p: r[2] || '—', f: r[3] || '',
      t: 'Mes mots', l: r[5] || 'A1', id: r[0] + '|' + r[1], custom: true
    };
  });
}
function allWords() { return BASE.concat(customWords()); }

/* ---------------- 2. Mémoire espacée ---------------- */

/* Temps avant de revoir un mot selon sa "boîte" (0 → 6). */
var INTERVALS = [
  0,
  10 * 60 * 1000,          // 10 minutes
  24 * 60 * 60 * 1000,     // 1 jour
  3 * 24 * 60 * 60 * 1000, // 3 jours
  7 * 24 * 60 * 60 * 1000, // 1 semaine
  21 * 24 * 60 * 60 * 1000,// 3 semaines
  60 * 24 * 60 * 60 * 1000 // 2 mois
];

var session = {
  mode: 'train',
  answered: 0,
  correct: 0,
  tick: 0,
  retryAt: {},
  recent: [],
  current: null,
  locked: false
};

function isTrap(p) { return !!p && p.ko > 0 && p.b < 4; }

function activePool() {
  var lv = settings.levels || [];
  var th = settings.themes;
  var now = Date.now();
  return allWords().filter(function (w) {
    if (th && th.indexOf(w.t) < 0) return false;
    if (!w.custom && lv.indexOf(w.l) < 0) return false;
    if (session.mode === 'revision') return !!(prog[w.id] && prog[w.id].d <= now);
    if (session.mode === 'errors') return isTrap(prog[w.id]);
    return true;
  });
}

/* Choisit le prochain mot :
   1. un mot raté récemment (file de reprise)
   2. sinon, un mot dû / un mot nouveau / un mot déjà vu
   3. jamais le même mot deux fois de suite */
function pick() {
  var pool = activePool();
  if (!pool.length) return null;

  var byId = {};
  pool.forEach(function (w) { byId[w.id] = w; });

  /* un mot raté revient après 3 autres mots */
  var bestId = null, bestAt = Infinity;
  Object.keys(session.retryAt).forEach(function (id) {
    if (!byId[id]) { delete session.retryAt[id]; return; }
    if (session.current && id === session.current.id) return;
    var at = session.retryAt[id];
    if (at <= session.tick && at < bestAt) { bestAt = at; bestId = id; }
  });
  if (bestId) {
    delete session.retryAt[bestId];
    return byId[bestId];
  }

  var now = Date.now();
  var due = [], fresh = [], learned = [];
  pool.forEach(function (w) {
    /* un mot qui doit revenir plus tard n'est pas proposé avant l'heure */
    if (session.retryAt[w.id] && session.retryAt[w.id] > session.tick) return;
    var p = prog[w.id];
    if (!p) fresh.push(w);
    else {
      learned.push(w);
      if (p.d <= now) due.push(w);
    }
  });

  var list;
  if (due.length && (!fresh.length || Math.random() < 0.68)) list = due;
  else if (fresh.length) list = fresh;
  else if (learned.length) list = learned;
  else list = [];

  if (!list.length) {
    list = pool.filter(function (w) {
      return !(session.retryAt[w.id] && session.retryAt[w.id] > session.tick);
    });
    if (!list.length) list = pool;
  }

  var candidates = list.filter(function (w) { return session.recent.indexOf(w.id) < 0; });
  if (!candidates.length) candidates = list.slice();

  if (list === due) {
    candidates.sort(function (x, y) {
      var px = prog[x.id], py = prog[y.id];
      return (px.b - py.b) || (px.d - py.d);
    });
    candidates = candidates.slice(0, 12);
  }

  return candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
}

function record(w, ok) {
  var p = prog[w.id] || (prog[w.id] = { b: 0, d: 0, s: 0, ok: 0, ko: 0, l: 0 });
  p.s++;
  if (ok) {
    p.ok++;
    p.b = Math.min(6, p.b + 1);
    p.d = Date.now() + INTERVALS[p.b];
  } else {
    p.ko++;
    p.b = 0;
    p.d = Date.now();
  }
  p.l = Date.now();
}

/* ---------------- 3. Dates & chiffres ---------------- */

function pad(n) { return (n < 10 ? '0' : '') + n; }

function todayKey(offsetDays) {
  var d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function todayStats() {
  return daily[todayKey()] || { a: 0, c: 0 };
}

function streak() {
  var n = 0;
  for (var i = 0; i < 400; i++) {
    var d = daily[todayKey(-i)];
    if (d && d.a > 0) n++;
    else if (i === 0) continue;
    else break;
  }
  return n;
}

function inFilters(w) {
  if (settings.themes && settings.themes.indexOf(w.t) < 0) return false;
  if (!w.custom && (settings.levels || []).indexOf(w.l) < 0) return false;
  return true;
}

function dueTotal() {
  var now = Date.now();
  return allWords().filter(function (w) {
    if (!inFilters(w)) return false;
    var p = prog[w.id];
    return p && p.d <= now;
  }).length;
}

function masteredCount() {
  var n = 0;
  allWords().forEach(function (w) {
    if (!inFilters(w)) return;
    var p = prog[w.id];
    if (p && p.b >= 5) n++;
  });
  return n;
}

function totals() {
  var t = { answered: 0, correct: 0 };
  Object.keys(prog).forEach(function (id) {
    t.answered += prog[id].s || 0;
    t.correct += prog[id].ok || 0;
  });
  return t;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function $(id) { return document.getElementById(id); }

/* ---------------- 4. Prononciation ---------------- */

var deVoice = null;
function refreshVoice() {
  if (!('speechSynthesis' in window)) return;
  var vs = speechSynthesis.getVoices() || [];
  deVoice = null;
  for (var i = 0; i < vs.length; i++) {
    if (/^de([-_]|$)/i.test(vs[i].lang)) {
      if (!deVoice || /de[-_]DE/i.test(vs[i].lang)) deVoice = vs[i];
      if (/de[-_]DE/i.test(vs[i].lang)) break;
    }
  }
}
if ('speechSynthesis' in window) {
  refreshVoice();
  speechSynthesis.onvoiceschanged = refreshVoice;
}

function speak(text) {
  if (!settings.audio || !text || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 0.88;
    if (deVoice) u.voice = deVoice;
    speechSynthesis.speak(u);
  } catch (e) { /* pas de voix : on continue sans son */ }
}

/* ---------------- 5. Écran d'entraînement ---------------- */

var currentView = 'train';

function renderSession() {
  $('sAnswered').textContent = session.answered;
  $('sAcc').textContent = session.answered
    ? Math.round(100 * session.correct / session.answered) + '%'
    : '—';
  $('sDue').textContent = dueTotal();
  $('sStreak').textContent = streak();

  var ts = todayStats();
  var goal = Math.max(1, settings.goal || 20);
  $('goalText').textContent = ts.a + ' / ' + goal;
  $('goalFill').style.width = Math.min(100, 100 * ts.a / goal) + '%';
}

function newCard() {
  session.tick++;
  session.current = pick();
  session.locked = false;

  if (!session.current) { showEmpty(); return; }

  var w = session.current;
  var card = $('card');
  card.classList.remove('enter');
  void card.offsetWidth;
  card.classList.add('enter');

  $('empty').hidden = true;
  $('feedback').hidden = true;
  $('answers').hidden = false;
  $('ask').hidden = false;
  $('ask').textContent = "Quel est l'article ?";
  $('word').textContent = w.n;
  $('chipTheme').textContent = w.t;
  $('chipLevel').textContent = w.custom ? 'Perso' : w.l;

  var p = prog[w.id];
  $('chipBox').textContent = p ? 'niveau ' + (p.b + 1) + '/7' : 'nouveau';

  var btns = $('answers').querySelectorAll('.ans');
  for (var i = 0; i < btns.length; i++) {
    btns[i].disabled = false;
    btns[i].classList.remove('correct', 'wrong', 'dim');
  }

  session.recent.push(w.id);
  if (session.recent.length > 6) session.recent.shift();

  renderSession();
}

function showEmpty() {
  $('answers').hidden = true;
  $('ask').hidden = true;
  $('feedback').hidden = true;
  $('empty').hidden = false;
  $('word').textContent = '';
  $('chipTheme').textContent = '—';
  $('chipLevel').textContent = '—';
  $('chipBox').textContent = '—';

  var title, text;
  if (session.mode === 'revision') {
    title = 'Tout est à jour';
    text = "Tu as révisé tous les mots prévus pour aujourd'hui. Ils reviendront au bon moment — ou continue en mode libre.";
  } else if (session.mode === 'errors') {
    title = 'Aucune erreur';
    text = "Tu n'as pas encore de mots fragiles avec ces réglages. Continue en mode libre : les mots ratés apparaîtront ici.";
  } else {
    title = 'Aucun mot';
    text = "Aucun mot ne correspond à ces filtres. Choisis « Tous » dans les niveaux, ou élargis les thèmes dans Réglages.";
  }
  $('emptyTitle').textContent = title;
  $('emptyText').textContent = text;
  renderSession();
}

function answer(art) {
  var w = session.current;
  if (!w || session.locked) return;
  session.locked = true;

  var ok = art === w.a;
  record(w, ok);

  session.answered++;
  if (ok) session.correct++;

  conf[art] = conf[art] || { der: 0, die: 0, das: 0 };
  conf[art][w.a] = (conf[art][w.a] || 0) + 1;

  var k = todayKey();
  var d = daily[k] || (daily[k] = { a: 0, c: 0 });
  d.a++;
  if (ok) d.c++;

  if (ok) {
    delete session.retryAt[w.id];
  } else {
    session.retryAt[w.id] = session.tick + 4;
  }

  save(KEY.prog, prog);
  save(KEY.daily, daily);
  save(KEY.conf, conf);

  var btns = $('answers').querySelectorAll('.ans');
  for (var i = 0; i < btns.length; i++) {
    var b = btns[i];
    b.disabled = true;
    b.classList.remove('correct', 'wrong', 'dim');
    if (b.getAttribute('data-art') === w.a) b.classList.add('correct');
    else if (b.getAttribute('data-art') === art) b.classList.add('wrong');
    else b.classList.add('dim');
  }

  $('verdict').className = 'verdict ' + (ok ? 'ok' : 'ko');
  $('verdict').textContent = ok
    ? 'Richtig ! ✓'
    : "Pas tout à fait — c'est « " + w.a + " ».";
  $('full').innerHTML = '<span class="a-' + w.a + '">' + esc(w.a) + '</span> ' + esc(w.n);
  $('plural').innerHTML = 'Pluriel : <b>' + esc(w.p === '—' ? '— (pas de pluriel)' : w.p) + '</b>';
  $('fr').innerHTML = w.f ? '<b>' + esc(w.f) + '</b>' : '';
  $('feedback').hidden = false;

  speak(w.a + ' ' + w.n);
  renderSession();

  setTimeout(function () {
    var n = $('next');
    if (n && currentView === 'train') n.focus({ preventScroll: true });
  }, 30);
}

function setMode(mode) {
  session.mode = mode;
  session.answered = 0;
  session.correct = 0;
  session.tick = 0;
  session.retryAt = {};
  session.recent = [];
  session.current = null;

  var btns = $('modes').querySelectorAll('.mode');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
  }
  newCard();
}

/* ---------------- 6. Navigation & raccourcis ---------------- */

function showView(name) {
  currentView = name;
  ['train', 'stats', 'settings'].forEach(function (v) {
    $('view-' + v).hidden = v !== name;
  });
  var tabs = $('tabs').querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-view') === name);
  }
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- 7. Statistiques ---------------- */

function hcell(t) {
  var d = document.createElement('div');
  d.className = 'h';
  d.textContent = t;
  return d;
}

function renderStats() {
  var t = totals();
  $('statTotal').textContent = t.answered;
  $('statAcc').textContent = t.answered ? Math.round(100 * t.correct / t.answered) + '%' : '—';
  $('statMastered').textContent = masteredCount();
  $('statDue').textContent = dueTotal();

  /* précision par article */
  var g = $('genderBars');
  g.innerHTML = '';
  ['der', 'die', 'das'].forEach(function (art) {
    var total = 0, good = 0;
    Object.keys(conf).forEach(function (ans) {
      total += (conf[ans] && conf[ans][art]) || 0;
    });
    good = (conf[art] && conf[art][art]) || 0;
    var pct = total ? Math.round(100 * good / total) : 0;

    var row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML =
      '<span class="lbl" style="color:var(--' + art + ')">' + art + '</span>' +
      '<span class="bar-track"><i style="width:' + pct + '%;background:var(--' + art + ')"></i></span>' +
      '<span class="val">' + (total ? pct + '% · ' + good + '/' + total : '—') + '</span>';
    g.appendChild(row);
  });

  /* matrice de confusion */
  var ct = $('confTable');
  ct.innerHTML = '';
  ct.appendChild(hcell(''));
  ['der', 'die', 'das'].forEach(function (a) { ct.appendChild(hcell(a)); });

  ['der', 'die', 'das'].forEach(function (rowArt) {
    var rh = document.createElement('div');
    rh.className = 'rh';
    rh.style.color = 'var(--' + rowArt + ')';
    rh.textContent = rowArt;
    ct.appendChild(rh);

    ['der', 'die', 'das'].forEach(function (colArt) {
      var n = (conf[rowArt] && conf[rowArt][colArt]) || 0;
      var c = document.createElement('div');
      c.className = 'cell' + (rowArt === colArt ? ' diag' : (n > 0 ? ' hot' : ''));
      c.textContent = n;
      ct.appendChild(c);
    });
  });

  /* 14 derniers jours */
  var chart = $('chart');
  chart.innerHTML = '';
  var days = [], max = 1;
  for (var i = 13; i >= 0; i--) {
    var k = todayKey(-i);
    var v = (daily[k] && daily[k].a) || 0;
    if (v > max) max = v;
    days.push({ k: k, v: v, i: i });
  }
  days.forEach(function (day) {
    var col = document.createElement('div');
    col.className = 'col' + (day.i === 0 ? ' today' : '');

    var bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = Math.max(3, Math.round(100 * day.v / max)) + '%';
    bar.title = day.v + ' réponse' + (day.v > 1 ? 's' : '');

    var lab = document.createElement('div');
    lab.className = 'd';
    if (day.i === 0) lab.textContent = 'auj.';
    else {
      var dt = new Date(day.k + 'T12:00:00');
      lab.textContent = dt.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    }

    col.appendChild(bar);
    col.appendChild(lab);
    chart.appendChild(col);
  });

  /* mots pièges */
  var traps = allWords()
    .filter(function (w) { return isTrap(prog[w.id]); })
    .sort(function (a, b) { return prog[b.id].ko - prog[a.id].ko; });

  $('trapCount').textContent = traps.length;
  $('drillTraps').style.display = traps.length ? '' : 'none';

  var box = $('traps');
  box.innerHTML = '';
  if (!traps.length) {
    box.innerHTML = '<p class="muted">Aucune erreur pour le moment. Continue comme ça !</p>';
  }
  traps.slice(0, 60).forEach(function (w) {
    var d = document.createElement('div');
    d.className = 'trap';
    d.style.cursor = 'pointer';
    d.title = 'Cliquer pour écouter';
    d.innerHTML =
      '<div><span class="w"><span class="a-' + w.a + '">' + esc(w.a) + '</span> ' + esc(w.n) + '</span>' +
      (w.f ? '<span class="f">' + esc(w.f) + '</span>' : '') + '</div>' +
      '<span class="n">' + prog[w.id].ko + ' ✗</span>';
    d.addEventListener('click', function () { speak(w.a + ' ' + w.n); });
    box.appendChild(d);
  });
}

/* ---------------- 8. Réglages ---------------- */

function chip(label, on, fn) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'chipbtn' + (on ? ' on' : '');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function persistSettings() { save(KEY.set, settings); }

/* Onglets de niveau : un seul niveau à la fois, ou « Tous ». */
function renderLevelTabs() {
  var box = $('levelTabs');
  if (!box) return;
  var single = settings.levels.length === 1 ? settings.levels[0] : 'all';
  var btns = box.querySelectorAll('.lvl');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-level') === single);
  }
}

function setLevel(level) {
  settings.levels = (level === 'all') ? LEVELS.slice() : [level];
  persistSettings();
  renderLevelTabs();
  newCard();
}

function renderSettings() {
  var tc = $('themeChips');
  tc.innerHTML = '';
  tc.appendChild(chip('Tous', !settings.themes, function () {
    settings.themes = null;
    persistSettings();
    renderSettings();
    newCard();
  }));

  var tl = themeList();
  tl.forEach(function (t) {
    var on = settings.themes ? settings.themes.indexOf(t) >= 0 : false;
    tc.appendChild(chip(t, on, function () {
      if (!settings.themes) {
        settings.themes = [t];
      } else {
        var i = settings.themes.indexOf(t);
        if (i >= 0) settings.themes.splice(i, 1);
        else settings.themes.push(t);
        if (!settings.themes.length || settings.themes.length === tl.length) settings.themes = null;
      }
      persistSettings();
      renderSettings();
      newCard();
    }));
  });

  $('audioToggle').checked = !!settings.audio;
  $('goalInput').value = settings.goal || 20;

  renderCustom();
  renderLevelTabs();
}

function renderCustom() {
  var box = $('customList');
  box.innerHTML = '';
  if (!custom.length) {
    box.innerHTML = '<p class="muted">Aucun mot ajouté pour le moment.</p>';
    return;
  }
  custom.forEach(function (r) {
    var id = r[0] + '|' + r[1];
    var item = document.createElement('div');
    item.className = 'custom-item';

    var label = document.createElement('span');
    label.innerHTML =
      '<span class="a-' + r[0] + '">' + esc(r[0]) + '</span> ' + esc(r[1]) +
      (r[3] ? ' <span style="color:var(--dim)">· ' + esc(r[3]) + '</span>' : '');

    var del = document.createElement('button');
    del.type = 'button';
    del.title = 'Supprimer ce mot';
    del.textContent = '✕';
    del.addEventListener('click', function () {
      if (!confirm('Supprimer « ' + r[1] + ' » ?')) return;
      custom = custom.filter(function (x) { return (x[0] + '|' + x[1]) !== id; });
      save(KEY.custom, custom);
      delete prog[id];
      save(KEY.prog, prog);
      if (!custom.length && settings.themes && settings.themes.indexOf('Mes mots') >= 0) {
        settings.themes = null;
        persistSettings();
      }
      if (session.current && session.current.id === id) newCard();
      renderCustom();
      renderSession();
    });

    item.appendChild(label);
    item.appendChild(del);
    box.appendChild(item);
  });
}

/* ---------------- 9. Ajout de mots & sauvegarde ---------------- */

function addWord(art, noun, plural, fr) {
  noun = noun.trim();
  if (!noun) return false;
  noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  var id = art + '|' + noun;
  var exists = allWords().some(function (w) { return w.id === id; });
  if (exists) return false;

  plural = (plural || '').trim();
  if (!plural) plural = '—';
  else if (plural.indexOf('die ') !== 0) plural = 'die ' + plural;

  custom.push([art, noun, plural, (fr || '').trim(), 'Mes mots', 'A1']);
  save(KEY.custom, custom);
  return true;
}

function exportData() {
  var data = {
    app: 'der-die-das',
    version: 1,
    exportedAt: new Date().toISOString(),
    prog: prog,
    daily: daily,
    conf: conf,
    settings: settings,
    custom: custom
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'der-die-das-sauvegarde-' + todayKey() + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 600);
}

function importData(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var d;
    try { d = JSON.parse(reader.result); }
    catch (e) { alert('Fichier illisible : ce n\'est pas une sauvegarde valide.'); return; }

    if (!d || typeof d !== 'object' || !d.prog) {
      alert('Fichier illisible : ce n\'est pas une sauvegarde de Der Die Das.');
      return;
    }
    if (!confirm('Remplacer tes progrès actuels par cette sauvegarde ?')) return;

    prog = d.prog || {};
    daily = d.daily || {};
    conf = d.conf || {};
    custom = Array.isArray(d.custom) ? d.custom : [];
    settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
    if (!Array.isArray(settings.levels) || settings.levels.length !== 1 || LEVELS.indexOf(settings.levels[0]) < 0) {
      settings.levels = LEVELS.slice();
    }

    save(KEY.prog, prog);
    save(KEY.daily, daily);
    save(KEY.conf, conf);
    save(KEY.custom, custom);
    save(KEY.set, settings);

    renderSettings();
    renderSession();
    newCard();
    alert('Sauvegarde importée. Bon entraînement !');
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm('Effacer tous tes progrès, tes statistiques et tes mots ajoutés ?')) return;
  if (!confirm('Dernière vérification : cette action est définitive. On efface ?')) return;

  prog = {};
  daily = {};
  conf = {};
  custom = [];
  settings = Object.assign({}, DEFAULT_SETTINGS);

  save(KEY.prog, prog);
  save(KEY.daily, daily);
  save(KEY.conf, conf);
  save(KEY.custom, custom);
  save(KEY.set, settings);

  session.tick = 0;
  session.retryAt = {};
  session.recent = [];
  session.answered = 0;
  session.correct = 0;

  renderSettings();
  renderStats();
  newCard();
  alert('C\'est remis à zéro.');
}

/* ---------------- 10. Démarrage ---------------- */

function checkStorage() {
  try {
    localStorage.setItem('ddd.test', '1');
    localStorage.removeItem('ddd.test');
  } catch (e) {
    $('storageNote').textContent = "⚠️ Ton navigateur bloque l'enregistrement local : tes progrès risquent de ne pas être gardés. Essaie avec Edge ou Chrome.";
  }
}

function bind() {
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (b) showView(b.getAttribute('data-view'));
  });

  $('modes').addEventListener('click', function (e) {
    var b = e.target.closest('.mode');
    if (b) setMode(b.getAttribute('data-mode'));
  });

  $('levelTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.lvl');
    if (b) setLevel(b.getAttribute('data-level'));
  });

  $('answers').addEventListener('click', function (e) {
    var b = e.target.closest('.ans');
    if (b) answer(b.getAttribute('data-art'));
  });

  $('next').addEventListener('click', newCard);

  $('emptyBtn').addEventListener('click', function () {
    showView('train');
    setMode('train');
  });

  $('speak').addEventListener('click', function () {
    if (!session.current) return;
    speak(session.locked
      ? session.current.a + ' ' + session.current.n
      : session.current.n);
  });

  $('drillTraps').addEventListener('click', function () {
    showView('train');
    setMode('errors');
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (currentView !== 'train' || !session.current) return;

    if (!session.locked) {
      var k = (e.key || '').toLowerCase();
      if (k === '1' || k === 'a') { e.preventDefault(); answer('der'); }
      else if (k === '2' || k === 's') { e.preventDefault(); answer('die'); }
      else if (k === '3' || k === 'd') { e.preventDefault(); answer('das'); }
      else if (k === 'r') { speak(session.current.n); }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      newCard();
    }
  });

  $('audioToggle').addEventListener('change', function () {
    settings.audio = this.checked;
    persistSettings();
    if (settings.audio) speak('Hallo');
  });

  $('goalInput').addEventListener('change', function () {
    var v = parseInt(this.value, 10);
    if (!v || v < 5) v = 5;
    if (v > 200) v = 200;
    this.value = v;
    settings.goal = v;
    persistSettings();
    renderSession();
  });

  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var art = $('addArt').value;
    var noun = $('addNoun').value;
    if (!noun.trim()) return;
    if (!addWord(art, noun, $('addPlural').value, $('addFr').value)) {
      alert('Ce mot est déjà dans la liste.');
      return;
    }
    this.reset();
    renderCustom();
    renderSession();
  });

  $('exportBtn').addEventListener('click', exportData);

  $('importInput').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = '';
  });

  $('resetBtn').addEventListener('click', resetAll);
}

bind();
checkStorage();
renderSettings();
renderLevelTabs();
newCard();
renderStats();

})();


