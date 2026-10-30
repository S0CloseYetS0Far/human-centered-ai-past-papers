(function () {
  "use strict";
  var D = window.STUDY_DATA;
  var app = document.getElementById("app");
  var navbar = document.getElementById("navbar");

  if (!D || !Array.isArray(D.questions)) {
    app.innerHTML = '<section class="hero"><h1>Data not found</h1><p>Could not load <code>data/questions.js</code>. Make sure it sits in a <code>data</code> folder next to <code>index.html</code>.</p></section>';
    return;
  }

  var STORE = "hcai-bank-v2";
  var ALL = "all";
  var UNASSIGNED = "unassigned";
  var TYPE_LABEL = { mcq: "Multiple choice", written: "Written" };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Escape, then allow **bold** (used in solutions).
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function hl(s, tokens) {
    s = String(s == null ? "" : s);
    if (!tokens || !tokens.length) return esc(s);
    var re = new RegExp("(" + tokens.map(escRe).join("|") + ")", "gi");
    return s.split(re).map(function (p, i) { return i % 2 ? '<mark class="hit">' + esc(p) + "</mark>" : esc(p); }).join("");
  }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  var chapters = D.chapters.slice().sort(function (a, b) { return a.number - b.number; });
  var chById = {};
  chapters.forEach(function (c) { chById[c.id] = c; });
  function chByNumber(n) { for (var i = 0; i < chapters.length; i++) if (+chapters[i].number === n) return chapters[i]; return null; }

  var byId = {};
  D.questions.forEach(function (q, i) { q._i = i; byId[q.id] = q; });

  function sectionOf(q) { return q.chapter && chById[q.chapter] ? q.chapter : UNASSIGNED; }
  function typeOf(q) { return q.options && q.options.length ? "mcq" : "written"; }
  function gradable(q) { return sectionOf(q) !== UNASSIGNED && !!q.solution; }
  function source(q) { return (D.sources && D.sources[q.source]) || { label: q.source, short: q.source, order: 0 }; }
  function optIndex(q, key) { for (var i = 0; i < q.options.length; i++) if (q.options[i].key === key) return i; return -1; }

  // Newest exam first, keeping the paper's own question order within an exam.
  // Questions without a solution go last.
  function ordered(list) {
    return list.slice().sort(function (a, b) {
      var ga = gradable(a) ? 0 : 1, gb = gradable(b) ? 0 : 1;
      if (ga !== gb) return ga - gb;
      var oa = source(a).order || 0, ob = source(b).order || 0;
      if (oa !== ob) return ob - oa;
      return a._i - b._i;
    });
  }
  function shuffledKeepUnsolvedLast(list) {
    var g = list.filter(gradable), rest = list.filter(function (q) { return !gradable(q); });
    return shuffled(g).concat(shuffled(rest));
  }

  function chTitle(key) {
    if (key === ALL) return "All chapters";
    if (key === UNASSIGNED) return "Topics outside your slides";
    var c = chById[key];
    return "Chapter " + c.number + " · " + c.title;
  }

  // ---------- saved state (this browser only) ----------
  // answers[id] = { done: true, ok: true | false | null, choice: index (MCQ, -1 = revealed without picking) }
  var saved = { answers: {}, shuffle: false, types: ["mcq", "written"] };
  try {
    var raw = localStorage.getItem(STORE);
    if (raw) saved = Object.assign(saved, JSON.parse(raw));
    else migrateV1();
  } catch (e) { /* storage blocked: keep in memory */ }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) {} }
  function migrateV1() {
    var old = JSON.parse(localStorage.getItem("hcai-study-answers-v1") || "null");
    if (!old) return;
    Object.keys(old).forEach(function (id) {
      var q = byId[id], r = old[id];
      if (!q || !r || !r.result) return;
      var rec = { done: true, ok: r.result === "right" };
      if (typeOf(q) === "mcq") rec.choice = r.picked ? optIndex(q, r.picked) : -1;
      saved.answers[id] = rec;
    });
    persist();
  }

  // ---------- theme ----------
  var themes = ["system", "light", "dark"];
  var theme = "system";
  try { theme = localStorage.getItem(STORE + ".theme") || "system"; } catch (e) {}
  function applyTheme() {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("themeLbl").textContent = theme;
  }
  applyTheme();
  document.getElementById("themeBtn").addEventListener("click", function () {
    theme = themes[(themes.indexOf(theme) + 1) % 3];
    try { localStorage.setItem(STORE + ".theme", theme); } catch (e) {}
    applyTheme();
  });

  // ---------- question sets ----------
  function questionsIn(key) {
    if (key === ALL) return D.questions.filter(function (q) { return sectionOf(q) !== UNASSIGNED; });
    return D.questions.filter(function (q) { return sectionOf(q) === key; });
  }
  function poolFor(key) {
    return ordered(questionsIn(key).filter(function (q) { return saved.types.indexOf(typeOf(q)) >= 0; }));
  }
  function stats(list) {
    var s = { total: 0, done: 0, ok: 0 };
    list.forEach(function (q) {
      if (!gradable(q)) return;
      s.total++;
      var a = saved.answers[q.id];
      if (a && a.done) { s.done++; if (a.ok === true) s.ok++; }
    });
    return s;
  }

  // S.mode: "practice" (answer questions) or "review" (step through mistakes with solutions shown)
  var S = { view: "home", key: null, order: [], idx: 0, mode: "practice", noteOpen: false };
  var resetArmed = false;
  var query = "";

  function start(key, ids, mode, at) {
    var list = ids ? ids.map(function (id) { return byId[id]; }) : poolFor(key);
    if (!list.length) return;
    if (!ids && saved.shuffle) list = shuffledKeepUnsolvedLast(list);
    S.key = key;
    S.order = list.map(function (q) { return q.id; });
    S.idx = Math.max(0, at ? S.order.indexOf(at) : 0);
    S.mode = mode || "practice";
    S.view = "quiz";
    S.noteOpen = false;
    render();
  }

  // ---------- home ----------
  function renderHome() {
    navbar.hidden = true;
    var st = stats(D.questions);
    var solvedCount = D.questions.filter(gradable).length;
    var h = '<section class="hero"><span class="label">Past exam questions sorted by lecture chapter</span>' +
      "<h1>Practice every past HCAI exam question, chapter by chapter.</h1>" +
      "<p>Each question is solved and explained, with the exam it came from and the slide pages it is based on. Pick a chapter, answer one question at a time, and use Next to move on.</p>" +
      '<div class="stats"><span><b>' + D.questions.length + "</b> questions</span><span><b>" + solvedCount + "</b> solved</span><span><b>" +
      Object.keys(D.sources).length + "</b> exams &amp; quizzes</span><span><b>" + st.done + "</b> answered · <b>" + st.ok + "</b> correct</span></div></section>";

    h += '<section class="controls" aria-label="Practice settings">' +
      '<div class="ctl-row"><span class="label">Order</span>' +
      '<button type="button" class="switch" id="shuffleSw" role="switch" aria-checked="' + (saved.shuffle ? "true" : "false") + '"><i></i>Shuffle questions</button>' +
      '<span class="label">' + (saved.shuffle ? "random order" : "newest exam first") + "</span></div>" +
      '<div class="ctl-row"><span class="label">Question types</span>' +
      ["mcq", "written"].map(function (t) {
        return '<button type="button" class="chip" data-type="' + t + '" aria-pressed="' + (saved.types.indexOf(t) >= 0) + '">' + TYPE_LABEL[t] + "</button>";
      }).join("") + "</div>" +
      '<div class="ctl-row"><span class="label">Search</span><input type="search" class="search" id="search" placeholder="Search question text…" autocomplete="off" value="' + esc(query) + '"></div>' +
      '<div class="ctl-row"><span class="label">Progress</span>' +
      (st.done
        ? (resetArmed
          ? '<span style="font-size:.9rem">Clear all ' + st.done + ' saved answers?</span><button type="button" class="chip" id="resetYes">Yes, reset</button><button type="button" class="chip" id="resetNo">Cancel</button>'
          : '<button type="button" class="chip" id="resetBtn">Reset my answers</button>')
        : '<span style="font-size:.9rem;color:var(--muted)">No answers saved yet</span>') +
      "</div></section>";

    h += '<div id="homeBody">' + homeBody() + "</div>";
    h += '<p class="note"><b>Keys:</b> <span class="kbd">←</span> <span class="kbd">→</span> move between questions, <span class="kbd">1</span>–<span class="kbd">4</span> pick an option, <span class="kbd">Enter</span> shows the solution, <span class="kbd">N</span> opens the note. Your answers are remembered in this browser only.</p>';
    app.innerHTML = h;

    document.getElementById("shuffleSw").addEventListener("click", function () { saved.shuffle = !saved.shuffle; persist(); renderHome(); });
    var rb = document.getElementById("resetBtn");
    if (rb) rb.addEventListener("click", function () { resetArmed = true; renderHome(); });
    var ry = document.getElementById("resetYes");
    if (ry) ry.addEventListener("click", function () { saved.answers = {}; resetArmed = false; persist(); renderHome(); });
    var rn = document.getElementById("resetNo");
    if (rn) rn.addEventListener("click", function () { resetArmed = false; renderHome(); });
    app.querySelectorAll("[data-type]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-type"), i = saved.types.indexOf(t);
        if (i >= 0) { if (saved.types.length > 1) saved.types.splice(i, 1); } else saved.types.push(t);
        persist(); renderHome();
      });
    });
    var search = document.getElementById("search");
    search.addEventListener("input", function () {
      query = search.value.trim();
      document.getElementById("homeBody").innerHTML = homeBody();
    });
  }

  function homeClick(e) {
    if (S.view !== "home") return;
    var card = e.target.closest("[data-ch]");
    if (card && !card.disabled) { start(card.getAttribute("data-ch")); return; }
    var hit = e.target.closest("[data-open]");
    if (hit) {
      var q = byId[hit.getAttribute("data-open")];
      var key = sectionOf(q);
      var pool = poolFor(key).map(function (x) { return x.id; });
      if (pool.indexOf(q.id) >= 0) start(key, null, "practice", q.id);
      else start(key, [q.id]);
    }
  }

  function homeBody() {
    if (query.length >= 2) return searchResults(query);
    var h = '<div class="group-title"><h2>Lecture chapters</h2><span class="label">' + chapters.length + " decks</span></div><div class=\"grid\">";
    h += chapterCard(ALL);
    chapters.forEach(function (c) { h += chapterCard(c.id); });
    h += "</div>";
    if (questionsIn(UNASSIGNED).length) {
      h += '<div class="group-title"><h2>Topics outside your slides</h2><span class="label">no solutions yet</span></div>' +
        '<p class="note" style="margin-top:0">These exam questions cover topics that are not in Modules 1–' + chapters.length + '. They will move into a chapter when its slides are added.</p><div class="grid">' +
        chapterCard(UNASSIGNED) + "</div>";
    }
    return h;
  }

  function chapterCard(key) {
    var list = poolFor(key);
    var all = questionsIn(key);
    var st = stats(all);
    var pct = st.total ? Math.round(100 * st.done / st.total) : 0;
    var num, title, meta;
    if (key === ALL) { num = "∗"; title = "All chapters mixed"; meta = list.length + " questions · good for a full mock exam"; }
    else if (key === UNASSIGNED) { num = "?"; title = "Outside your slides"; meta = list.length + " questions · read-only for now"; }
    else {
      var c = chById[key];
      num = c.number; title = c.title;
      meta = list.length + " question" + (list.length === 1 ? "" : "s") + (c.slideCount ? " · " + c.slideCount + " slides" : "");
    }
    return '<button type="button" class="ch' + (key === ALL ? " all" : "") + '" data-ch="' + key + '"' + (list.length ? "" : " disabled") + ">" +
      '<span class="num">' + num + '</span><span class="t">' + esc(title) + "</span>" +
      '<span class="meta">' + esc(meta) + (st.done ? " · " + st.done + " done · " + st.ok + " correct" : "") + "</span>" +
      '<span class="bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span></button>';
  }

  function searchResults(qs) {
    var tokens = qs.toLowerCase().split(/\s+/).filter(Boolean);
    var hits = ordered(D.questions).filter(function (q) {
      var hay = [q.text, q.context, q.ref, source(q).label,
        (q.options || []).map(function (o) { return o.text; }).join(" "),
        q.table ? q.table.rows.map(function (r) { return r.join(" "); }).join(" ") : ""].join(" ").toLowerCase();
      return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    var h = '<div class="group-title"><h2>' + hits.length + " result" + (hits.length === 1 ? "" : "s") + '</h2><span class="label">solutions are not searched</span></div>';
    if (!hits.length) return h + '<p class="note" style="margin-top:0">No matching questions.</p>';
    return h + '<ul class="results">' + hits.map(function (q) {
      var sec = sectionOf(q);
      return '<li><button type="button" data-open="' + esc(q.id) + '"><span class="label">' +
        esc(sec === UNASSIGNED ? "Outside your slides" : "Chapter " + chById[sec].number) + " · " + esc(source(q).short) + " · " + esc(q.ref) +
        '</span><span class="snip">' + hl(snippet(q.text, tokens), tokens) + "</span></button></li>";
    }).join("") + "</ul>";
  }
  function snippet(text, tokens) {
    var flat = String(text || "").replace(/\s+/g, " ").trim();
    var lower = flat.toLowerCase(), at = -1;
    tokens.forEach(function (t) { var p = lower.indexOf(t); if (p !== -1 && (at === -1 || p < at)) at = p; });
    var startAt = at > 60 ? at - 60 : 0;
    return (startAt ? "…" : "") + flat.slice(startAt, startAt + 200) + (startAt + 200 < flat.length ? "…" : "");
  }

  // ---------- question ----------
  function tableHtml(t) {
    if (!t || !t.headers) return "";
    return '<div class="tbl"><table class="mini"><thead><tr>' + t.headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + (t.rows || []).map(function (r) {
        return "<tr>" + r.map(function (c) { return "<td>" + fmt(c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function renderQuiz() {
    var id = S.order[S.idx], q = byId[id], rec = saved.answers[id] || {};
    var n = S.order.length, type = typeOf(q), isGradable = gradable(q);
    var review = S.mode === "review";
    var revealed = isGradable && (!!rec.done || review);
    navbar.hidden = false;

    var h = '<section class="qhead"><div class="row"><span class="pos">' + (S.idx + 1) + " / " + n + "</span>" +
      "<h2>" + esc(chTitle(sectionOf(q))) + "</h2>" +
      '<button type="button" class="btn ghost small" id="shuffleBtn" title="Shuffle the questions in this set">⤨ Shuffle</button></div>' +
      '<div class="row"><span class="tag">' + TYPE_LABEL[type] + '</span><span class="tag">' + esc(source(q).short) + " · " + esc(q.ref) + "</span>" +
      (review ? '<span class="tag accent">Reviewing mistakes</span>' : "") +
      (sectionOf(q) !== UNASSIGNED && !q.solution ? '<span class="tag warn">Unsolved – for me to solve</span>' : "") +
      (sectionOf(q) === UNASSIGNED ? '<span class="tag warn">Not in your slides yet</span>' : "") + "</div>" +
      '<div class="frames-wrap"><div class="frames" role="list" aria-label="Questions in this set">' +
      S.order.map(function (qid, i) {
        var r = saved.answers[qid], cls = [];
        if (r && r.done) cls.push(r.ok === true ? "ok" : r.ok === false ? "bad" : "seen");
        if (i === S.idx) cls.push("cur");
        return '<button type="button" role="listitem" class="' + cls.join(" ") + '" data-jump="' + i + '" aria-label="Question ' + (i + 1) + '"></button>';
      }).join("") + '</div><div class="legend"><span><i style="background:var(--ok)"></i>correct</span><span><i style="background:var(--bad)"></i>missed</span><span><i style="background:var(--rule)"></i>viewed</span><span><i style="background:var(--frame)"></i>not yet</span></div></div></section>';

    h += '<article class="sheet" aria-live="polite">';
    if (q.context) h += '<div class="qctx">' + esc(q.context) + "</div>";
    h += '<div class="qtext">' + esc(q.text) + "</div>";
    if (q.table) h += tableHtml(q.table);
    if (q.notes) h += '<div class="scan"><b>Scan note:</b> ' + esc(q.notes) + "</div>";

    var correctIdx = type === "mcq" && q.solution ? optIndex(q, q.solution.correctOption) : -1;
    if (type === "mcq") {
      h += '<div class="opts" role="group" aria-label="Answer options">' + q.options.map(function (o, i) {
        var cls = "opt", res = "";
        if (revealed) {
          if (i === correctIdx) { cls += " right"; res = "ANSWER"; }
          else if (i === rec.choice) { cls += " wrong"; res = "YOUR PICK"; }
        }
        return '<button type="button" class="' + cls + '" data-opt="' + i + '"' + (revealed || !isGradable ? " disabled" : "") + ">" +
          '<span class="key">' + esc(o.key) + '</span><span class="txt">' + esc(o.text) + '</span><span class="res">' + res + "</span></button>";
      }).join("") + "</div>";
      if (revealed) {
        if (rec.done && rec.ok) h += '<div class="verdict ok">✓ Correct</div>';
        else if (rec.done && rec.choice >= 0) h += '<div class="verdict bad">✗ Not quite — the answer is ' + esc(q.solution.correctOption) + "</div>";
        else h += '<div class="verdict ' + (rec.done ? "bad" : "muted") + '">' + (rec.done ? "Solution shown without picking — counted as missed" : "Not answered") + " · the answer is " + esc(q.solution.correctOption) + "</div>";
      }
    }

    if (!isGradable) {
      h += '<div class="why warn"><b>' + (sectionOf(q) === UNASSIGNED ? "Why it's outside your slides:" : "Why it's unsolved:") + "</b> " +
        esc(q.unassignedReason || q.unsolvedReason || "No solution yet.") + "</div>";
    }

    if (!revealed) {
      h += '<div class="reveal">';
      if (isGradable) h += '<button type="button" class="btn ' + (type === "mcq" ? "ghost" : "accent") + '" id="showSol">Show solution</button>';
      h += '<button type="button" class="btn note-btn" id="noteBtn" aria-expanded="' + S.noteOpen + '">📌 Note</button>';
      if (isGradable && type === "written") h += '<span class="label">Work it out first, then compare</span>';
      h += "</div>";
      if (S.noteOpen) h += whereHtml(q);
    } else {
      h += solutionHtml(q, rec, review);
    }
    h += "</article>";
    app.innerHTML = h;

    app.querySelectorAll("[data-opt]").forEach(function (b) {
      b.addEventListener("click", function () { choose(+b.getAttribute("data-opt")); });
    });
    var ss = document.getElementById("showSol");
    if (ss) ss.addEventListener("click", reveal);
    var nb = document.getElementById("noteBtn");
    if (nb) nb.addEventListener("click", toggleNote);
    document.getElementById("shuffleBtn").addEventListener("click", shuffleSet);
    app.querySelectorAll("[data-grade]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = saved.answers[id] || {};
        r.done = true; r.ok = b.getAttribute("data-grade") === "1";
        saved.answers[id] = r; persist(); renderQuiz();
      });
    });
    app.querySelectorAll("[data-jump]").forEach(function (b) {
      b.addEventListener("click", function () { go(+b.getAttribute("data-jump")); });
    });

    document.getElementById("prevBtn").disabled = S.idx === 0;
    document.getElementById("nextBtn").textContent = S.idx === n - 1 ? "Finish →" : "Next →";
    var st = stats(S.order.map(function (x) { return byId[x]; }));
    document.getElementById("navMid").innerHTML = '<span class="hide-sm">' + st.done + " answered · </span>" + st.ok + " correct";
  }

  function solutionHtml(q, rec, review) {
    var s = q.solution;
    var h = '<section class="sol" aria-label="Solution">';
    h += '<div><h3>Answer</h3><div class="answer">' + fmt(s.answer) + "</div></div>";
    if (s.table) h += '<div class="answer-tbl">' + tableHtml(s.table) + "</div>";
    if (s.steps && s.steps.length) {
      h += '<div><h3>How it is solved</h3><div class="expl"><ol>' + s.steps.map(function (x) { return "<li>" + fmt(x) + "</li>"; }).join("") + "</ol></div></div>";
    }
    if (typeOf(q) === "written" && !review) {
      var g = rec.ok === true ? "1" : rec.ok === false ? "0" : "";
      h += '<div class="selfgrade"><span class="label">Did you get it?</span>' +
        '<button type="button" class="btn ' + (g === "1" ? "accent" : "ghost") + '" data-grade="1">Yes, I got it</button>' +
        '<button type="button" class="btn ' + (g === "0" ? "" : "ghost") + '" data-grade="0">No, review later</button></div>';
    } else if (typeOf(q) === "written" && review) {
      h += '<div class="verdict ' + (rec.ok === false ? "bad" : "muted") + '">' + (rec.ok === false ? "You marked this one “review later”" : "Not marked yet") + "</div>";
    }
    h += whereHtml(q);
    return h + "</section>";
  }

  // "Module 3, pp.22–24 – Tangible Interfaces" → { module, pages, first, topic }
  function parseRef(ref) {
    var m = /^Module\s+(\d+),\s*pp?\.\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*[–-]\s*(.*)$/.exec(ref);
    if (!m) return null;
    return { module: +m[1], first: m[2], pages: m[3] ? m[2] + "–" + m[3] : m[2], plural: !!m[3], topic: m[4] };
  }
  function slideItem(ref) {
    var p = parseRef(ref);
    if (!p) return "<li>" + esc(ref) + "</li>";
    var c = chByNumber(p.module);
    return '<li><span class="slideref">Module ' + p.module + (c ? " — " + esc(c.title) : "") + ", " + (p.plural ? "slides" : "slide") + " <mark>" + esc(p.pages) + "</mark></span>" +
      '<span class="sub">' + esc(p.topic) + "</span>" +
      (c && c.slides ? '<span class="file">' + esc(c.slides) + ' · <a href="' + esc(c.slides) + "#page=" + p.first + '" target="_blank" rel="noopener">open at slide ' + p.first + " ↗</a></span>" : "") + "</li>";
  }

  // The read-only note: slide pages and the exam the question came from.
  function whereHtml(q) {
    var src = source(q);
    var h = '<div class="where" aria-label="Where this question comes from">';
    if (q.slideRefs && q.slideRefs.length) {
      h += '<div class="item"><span class="label">Lecture</span><ul>' + q.slideRefs.map(slideItem).join("") + "</ul></div>";
    }
    if (q.relatedSlides && q.relatedSlides.length) {
      h += '<div class="item"><span class="label">Related</span><div><p class="hint">Not in your slides yet. Closest related pages:</p><ul>' +
        q.relatedSlides.map(slideItem).join("") + "</ul></div></div>";
    }
    h += '<div class="item"><span class="label">Exam source</span><ul><li><b>' + esc(src.label) + "</b> — " + esc(q.ref) +
      '<span class="file">' + esc(src.file || "") + (q.page ? " · PDF page " + q.page : "") + "</span></li></ul></div>";
    return h + "</div>";
  }

  function choose(i) {
    var id = S.order[S.idx], q = byId[id];
    if (typeOf(q) !== "mcq" || !gradable(q) || S.mode === "review") return;
    var r = saved.answers[id];
    if (r && r.done) return;
    saved.answers[id] = { done: true, choice: i, ok: i === optIndex(q, q.solution.correctOption) };
    persist(); renderQuiz();
  }
  function reveal() {
    var id = S.order[S.idx], q = byId[id];
    if (!gradable(q)) return;
    var r = saved.answers[id] || {};
    if (r.done) return;
    // Like the OS bank: showing an MCQ solution before picking counts as missed.
    if (typeOf(q) === "written") { r.done = true; r.ok = null; }
    else { r.done = true; r.choice = -1; r.ok = false; }
    saved.answers[id] = r; persist(); renderQuiz();
  }
  function toggleNote() { S.noteOpen = !S.noteOpen; renderQuiz(); }
  function shuffleSet() {
    var cur = S.order[S.idx];
    S.order = shuffledKeepUnsolvedLast(S.order.map(function (x) { return byId[x]; })).map(function (q) { return q.id; });
    S.idx = 0;
    S.noteOpen = false;
    if (S.order[0] === cur && S.order.length > 1) { S.order.push(S.order.shift()); }
    render();
  }
  function go(i) {
    S.idx = Math.min(Math.max(i, 0), S.order.length - 1);
    S.noteOpen = false;
    S.view = "quiz";
    render();
  }

  // ---------- done ----------
  function missedIds() {
    return S.order.filter(function (id) {
      var q = byId[id], r = saved.answers[id];
      return gradable(q) && !(r && r.done && r.ok === true);
    });
  }
  function renderDone() {
    navbar.hidden = true;
    var list = S.order.map(function (x) { return byId[x]; });
    var st = stats(list);
    var missed = missedIds();
    var notScored = list.length - st.total;
    var review = S.mode === "review";
    var h = '<section class="done"><span class="label">' + esc(chTitle(S.key)) + (review ? " · review finished" : "") + "</span>";
    if (st.total) {
      h += '<div class="score">' + st.ok + " / " + st.total + "</div>" +
        '<p style="margin:0;color:var(--muted)">' + st.done + " of " + st.total + " questions answered" +
        (st.total ? " · " + Math.round(100 * st.ok / st.total) + "% correct" : "") +
        ". Written questions count as correct when you mark them “Yes, I got it”." +
        (notScored ? " " + notScored + " question" + (notScored === 1 ? " has" : "s have") + " no solution yet and " + (notScored === 1 ? "isn't" : "aren't") + " scored." : "") + "</p>";
    } else {
      h += '<div class="score">Done</div><p style="margin:0;color:var(--muted)">These questions have no solutions yet, so there is no score.</p>';
    }
    h += '<div class="reveal">' +
      (missed.length ? '<button type="button" class="btn accent" id="reviewMissed">Review my ' + missed.length + " mistake" + (missed.length === 1 ? "" : "s") + "</button>" +
        '<button type="button" class="btn" id="retryMissed">Retry them</button>' : "") +
      '<button type="button" class="btn ghost" id="again">Start this set again</button>' +
      '<button type="button" class="btn ghost" id="back">All chapters</button></div>';
    if (missed.length) {
      h += '<div><h3 class="label" style="margin:.4rem 0 .6rem">Mistakes &amp; skipped — jump back to</h3><ul class="missed">' + missed.map(function (id) {
        var q = byId[id], i = S.order.indexOf(id), r = saved.answers[id];
        var why = !r || !r.done ? "not answered" : r.ok === null ? "not marked" : "missed";
        return '<li><button type="button" data-jump="' + i + '"><span class="pos">' + (i + 1) + ".</span> " + esc(source(q).short) + " · " + esc(q.ref) +
          ' <span class="label">· ' + why + '</span><span class="snip">' + esc(snippet(q.text, [])) + "</span></button></li>";
      }).join("") + "</ul></div>";
    } else if (st.total) {
      h += '<p style="margin:0">No mistakes in this set. 🎉</p>';
    }
    h += "</section>";
    app.innerHTML = h;

    var rv = document.getElementById("reviewMissed");
    if (rv) rv.addEventListener("click", function () { start(S.key, missed, "review"); });
    var rm = document.getElementById("retryMissed");
    if (rm) rm.addEventListener("click", function () {
      missed.forEach(function (id) { delete saved.answers[id]; }); persist();
      start(S.key, missed, "practice");
    });
    document.getElementById("again").addEventListener("click", function () {
      S.order.forEach(function (id) { delete saved.answers[id]; }); persist();
      start(S.key);
    });
    document.getElementById("back").addEventListener("click", goHome);
    app.querySelectorAll("[data-jump]").forEach(function (b) {
      b.addEventListener("click", function () { go(+b.getAttribute("data-jump")); });
    });
  }

  // ---------- wiring ----------
  function render() {
    if (S.view === "home") renderHome();
    else if (S.view === "quiz") renderQuiz();
    else renderDone();
    window.scrollTo(0, 0);
  }
  function goHome() { S.view = "home"; render(); }
  function next() {
    if (S.idx < S.order.length - 1) go(S.idx + 1);
    else { S.view = "done"; render(); }
  }

  app.addEventListener("click", homeClick);
  document.getElementById("homeBtn").addEventListener("click", goHome);
  document.getElementById("prevBtn").addEventListener("click", function () { if (S.idx > 0) go(S.idx - 1); });
  document.getElementById("nextBtn").addEventListener("click", next);
  document.addEventListener("keydown", function (ev) {
    if (S.view !== "quiz" || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    var q = byId[S.order[S.idx]];
    if (ev.key === "ArrowRight") { next(); ev.preventDefault(); }
    else if (ev.key === "ArrowLeft") { if (S.idx > 0) go(S.idx - 1); ev.preventDefault(); }
    else if (/^[1-9]$/.test(ev.key) && typeOf(q) === "mcq" && +ev.key <= q.options.length) { choose(+ev.key - 1); }
    else if (ev.key === "Enter" && tag !== "BUTTON") { reveal(); }
    else if (ev.key === "n" || ev.key === "N") { if (document.getElementById("noteBtn")) toggleNote(); }
  });

  render();
})();
