(function () {
  "use strict";

  var DATA = window.STUDY_DATA;
  var main = document.getElementById("main");
  var nav = document.getElementById("nav");
  var searchInput = document.getElementById("search");
  var sidebar = document.getElementById("sidebar");
  var scrim = document.getElementById("scrim");
  var menuBtn = document.getElementById("menuBtn");

  if (!DATA || !Array.isArray(DATA.questions)) {
    main.innerHTML = '<div class="view"><h1>Data not found</h1><p class="lead">Could not load <code>data/questions.js</code>. Make sure it sits next to <code>index.html</code> in a <code>data</code> folder.</p></div>';
    return;
  }

  var UNASSIGNED = "unassigned";
  var state = { source: "all", query: "" };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // Escape, then allow **bold** (used in solutions only).
  function fmt(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  // Escape text and wrap search tokens in <mark>, without breaking entities.
  function hl(s, tokens) {
    s = String(s == null ? "" : s);
    if (!tokens || !tokens.length) return esc(s);
    var re = new RegExp("(" + tokens.map(escRe).join("|") + ")", "gi");
    return s.split(re).map(function (part, i) {
      return i % 2 ? "<mark>" + esc(part) + "</mark>" : esc(part);
    }).join("");
  }
  function statusOf(q) {
    if (!q.chapter) return UNASSIGNED;
    return q.solution ? "solved" : "unsolved";
  }
  function chapterById(id) {
    for (var i = 0; i < DATA.chapters.length; i++) if (DATA.chapters[i].id === id) return DATA.chapters[i];
    return null;
  }
  function sectionKey(q) {
    return q.chapter && chapterById(q.chapter) ? q.chapter : UNASSIGNED;
  }
  function sectionLabel(key) {
    if (key === UNASSIGNED) return "Unassigned";
    var c = chapterById(key);
    return c ? "Chapter " + c.number + " · " + c.title : key;
  }
  function questionsIn(key) {
    return DATA.questions.filter(function (q) { return sectionKey(q) === key; });
  }
  function counts(list) {
    var c = { total: list.length, solved: 0, unsolved: 0, unassigned: 0 };
    list.forEach(function (q) { c[statusOf(q)]++; });
    return c;
  }
  function sourceOf(q) {
    return (DATA.sources && DATA.sources[q.source]) || { label: q.source, short: q.source };
  }
  function bySource(list) {
    if (state.source === "all") return list;
    return list.filter(function (q) { return q.source === state.source; });
  }
  // ---------- your answers (saved in this browser only) ----------
  // { "<question id>": { "result": "right" | "wrong", "picked": "B" } }
  // Multiple choice is marked automatically; written answers are self-marked
  // after reading the solution.
  var STORE_KEY = "hcai-study-answers-v1";
  var answers = loadAnswers();
  function loadAnswers() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveAnswers() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(answers)); } catch (e) { /* private mode: keep in memory */ }
  }
  // Only questions with a solution can be scored.
  function isGradable(q) { return statusOf(q) === "solved"; }
  function isAutoGraded(q) { return !!(q.solution && q.solution.correctOption && q.options && q.options.length); }
  function score(list) {
    var s = { total: 0, right: 0, wrong: 0, answered: 0 };
    list.forEach(function (q) {
      if (!isGradable(q)) return;
      s.total++;
      var a = answers[q.id];
      if (!a || (a.result !== "right" && a.result !== "wrong")) return;
      s.answered++;
      s[a.result]++;
    });
    return s;
  }
  function verdictHtml(right, key) {
    return '<div class="verdict ' + (right ? "ok" : "bad") + '" role="status">' + (right
      ? "<strong>✓ Correct!</strong>"
      : "<strong>✗ Wrong.</strong> The correct answer is <strong>" + esc(key) + "</strong>.") + "</div>";
  }
  function badgeHtml(result) {
    if (result === "right") return '<span class="pill ok result-badge">✓ You got it right</span>';
    if (result === "wrong") return '<span class="pill bad result-badge">✗ You got it wrong</span>';
    return '<span class="result-badge" hidden></span>';
  }
  function selfMarkHtml(q) {
    var a = answers[q.id];
    var r = a && a.result;
    return '<div class="selfmark"><span class="selfmark-q">Compare with your answer. Did you get it right?</span>' +
      '<div class="selfmark-btns">' +
      '<button type="button" class="btn mark-btn ok' + (r === "right" ? " chosen" : "") + '" data-mark="right" aria-pressed="' + (r === "right") + '">✓ I got it right</button>' +
      '<button type="button" class="btn mark-btn bad' + (r === "wrong" ? " chosen" : "") + '" data-mark="wrong" aria-pressed="' + (r === "wrong") + '">✗ I got it wrong</button>' +
      "</div></div>";
  }

  var icons = {
    chevron: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  // ---------- rendering: pieces ----------
  function tableHtml(t, tokens) {
    if (!t || !t.headers) return "";
    var h = '<div class="table-wrap"><table><thead><tr>' +
      t.headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      (t.rows || []).map(function (r) {
        return "<tr>" + r.map(function (cell) { return "<td>" + (tokens ? hl(cell, tokens) : fmt(cell)) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>";
    return h;
  }

  function solutionHtml(s) {
    var h = '<p class="answer">' + fmt(s.answer || "") + "</p>";
    if (s.table) h += tableHtml(s.table);
    if (s.steps && s.steps.length) {
      h += "<h4>Step by step</h4><ol>" + s.steps.map(function (x) { return "<li>" + fmt(x) + "</li>"; }).join("") + "</ol>";
    }
    return h;
  }

  function chapterByNumber(n) {
    for (var i = 0; i < DATA.chapters.length; i++) if (+DATA.chapters[i].number === n) return DATA.chapters[i];
    return null;
  }

  // "Module 3, pp.22–24 – Tangible Interfaces" → module, slide pages, topic,
  // and a link that opens the slide PDF at that page.
  function slideRefHtml(ref) {
    var m = /^Module\s+(\d+),\s*pp?\.\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*[–-]\s*(.*)$/.exec(ref);
    if (!m) return '<li><span class="ref-topic">' + esc(ref) + "</span></li>";
    var ch = chapterByNumber(+m[1]);
    var pages = m[3] ? "Slides " + m[2] + "–" + m[3] : "Slide " + m[2];
    return "<li>" +
      '<span class="ref-where">Module ' + esc(m[1]) + " · " + pages + "</span>" +
      '<span class="ref-topic">' + esc(m[4]) + "</span>" +
      (ch && ch.slides ? '<a class="ref-open" href="' + esc(ch.slides) + "#page=" + m[2] + '" target="_blank" rel="noopener" title="Open the slides at this page">Open ↗</a>' : "") +
      "</li>";
  }

  // Read-only note: which slide pages the question comes from.
  function noteHtml(q) {
    var refs = q.slideRefs || [];
    var related = q.relatedSlides || [];
    if (!refs.length && !related.length) return "";
    var h = '<div class="slide-note" id="note-' + esc(q.id) + '" hidden>';
    h += '<div class="note-head">📌 Where this question comes from</div>';
    if (refs.length) {
      h += '<ul class="slide-refs">' + refs.map(slideRefHtml).join("") + "</ul>";
    }
    if (related.length) {
      h += '<p class="note-sub">This topic isn\'t in the current slides yet. The closest related pages are:</p>' +
        '<ul class="slide-refs">' + related.map(slideRefHtml).join("") + "</ul>";
    }
    h += '<p class="note-foot">Page numbers are the page numbers of the slide PDF.</p></div>';
    return h;
  }

  function questionHtml(q, num, opts) {
    opts = opts || {};
    var tokens = opts.tokens || null;
    var st = statusOf(q);
    var src = sourceOf(q);
    var correct = q.solution && q.solution.correctOption;
    var auto = isAutoGraded(q);
    var saved = st === "solved" && !tokens ? answers[q.id] : null;

    var h = '<article class="q' + (auto && saved ? " answered" : "") + '" id="' + esc(q.id) + '" data-status="' + st + '">';
    h += '<div class="q-meta">';
    if (num) h += '<span class="q-num">#' + num + "</span>";
    h += '<span class="src" title="' + esc(src.label) + '">' + hl(src.short || src.label, tokens) + "</span>";
    h += '<span class="ref">' + hl(q.ref, tokens) + "</span>";
    if (q.marks) h += '<span class="dim">· ' + esc(q.marks) + "</span>";
    if (q.page) h += '<span class="dim" title="' + esc(src.file || "") + '">· PDF p.' + esc(q.page) + "</span>";
    if (opts.showSection) {
      var sk = sectionKey(q);
      h += '<span class="sec"><a href="#/' + esc(sk) + '" class="pill neutral">' + esc(sk === UNASSIGNED ? "Unassigned" : "Ch " + chapterById(sk).number) + "</a></span>";
    }
    if (st === "unsolved") h += '<span class="pill warn">Unsolved</span>';
    if (st === "solved") h += badgeHtml(saved && saved.result);
    h += "</div>";

    if (q.context) h += '<p class="q-context">' + hl(q.context, tokens) + "</p>";
    h += '<p class="q-text">' + hl(q.text, tokens) + "</p>";

    if (q.options && q.options.length) {
      h += '<ul class="options">' + q.options.map(function (o) {
        var cls = "option" + (o.key === correct ? " correct" : "") + (auto && saved && saved.picked === o.key ? " picked" : "");
        return '<li><button type="button" class="' + cls + '" data-key="' + esc(o.key) + '"' + (auto && saved ? ' aria-disabled="true"' : "") + ">" +
          '<span class="key">' + esc(o.key) + "</span><span>" + hl(o.text, tokens) + "</span></button></li>";
      }).join("") + "</ul>";
      if (auto && saved) h += verdictHtml(saved.result === "right", correct);
    }
    if (q.table) h += tableHtml(q.table, tokens || []);
    if (q.notes) h += '<div class="note"><strong>Scan note:</strong> ' + esc(q.notes) + "</div>";

    if (st === "unsolved" && q.unsolvedReason) {
      h += '<div class="note"><strong>Why it\'s unsolved:</strong> ' + esc(q.unsolvedReason) + "</div>";
    } else if (st === UNASSIGNED && q.unassignedReason) {
      h += '<div class="note info"><strong>Why it\'s unassigned:</strong> ' + esc(q.unassignedReason) + "</div>";
    }

    var note = noteHtml(q);
    var sid = "sol-" + q.id;
    if (st === "solved" || note) {
      h += '<div class="q-actions">';
      if (st === "solved") {
        h += '<button type="button" class="toggle" aria-expanded="false" aria-controls="' + esc(sid) + '">' +
          '<span class="toggle-label">Show solution</span>' + icons.chevron + "</button>";
      }
      if (note) {
        h += '<button type="button" class="note-btn" aria-expanded="false" aria-controls="note-' + esc(q.id) + '" title="Which slide pages this question comes from">📌 Note</button>';
      }
      h += "</div>";
    }
    h += note;
    if (st === "solved") {
      h += '<div class="solution" id="' + esc(sid) + '" hidden>' + solutionHtml(q.solution) +
        (auto || tokens ? "" : selfMarkHtml(q)) + "</div>";
    }
    h += "</article>";
    return h;
  }

  function sourceSelectHtml() {
    var h = '<select id="sourceFilter" aria-label="Filter by exam"><option value="all">All exams</option>';
    Object.keys(DATA.sources || {}).forEach(function (k) {
      h += '<option value="' + esc(k) + '"' + (state.source === k ? " selected" : "") + ">" + esc(DATA.sources[k].label) + "</option>";
    });
    return h + "</select>";
  }

  function countPills(c, withUnassigned) {
    if (withUnassigned) return '<span class="pill neutral" title="Unassigned questions">' + c.unassigned + "</span>";
    return '<span class="pill ok" title="Solved">✓ ' + c.solved + '</span><span class="pill warn" title="Unsolved">? ' + c.unsolved + "</span>";
  }

  // ---------- rendering: nav ----------
  function renderNav(active) {
    var h = '<ul><li><a href="#/" ' + (active === "overview" ? 'aria-current="page"' : "") + '><span class="nav-num">≡</span><span class="nav-text">Overview</span></a></li></ul>';
    h += '<div class="nav-label">Chapters</div><ul>';
    DATA.chapters.forEach(function (c) {
      var n = counts(questionsIn(c.id));
      h += '<li><a href="#/' + esc(c.id) + '"' + (active === c.id ? ' aria-current="page"' : "") + ">" +
        '<span class="nav-num">' + esc(c.number) + '</span><span class="nav-text">' + esc(c.title) + "</span>" +
        '<span class="nav-counts">' + countPills(n) + "</span></a></li>";
    });
    h += "</ul><ul style=\"margin-top:10px\">";
    var u = counts(questionsIn(UNASSIGNED));
    h += '<li><a href="#/' + UNASSIGNED + '"' + (active === UNASSIGNED ? ' aria-current="page"' : "") + ">" +
      '<span class="nav-num">?</span><span class="nav-text">Unassigned</span><span class="nav-counts">' + countPills(u, true) + "</span></a></li></ul>";
    nav.innerHTML = h;
  }

  // ---------- rendering: views ----------
  function renderOverview() {
    var all = counts(DATA.questions);
    var h = '<div class="view">';
    h += '<div class="eyebrow">' + esc(DATA.course || "") + "</div>";
    h += "<h1>Past exam questions, sorted by chapter</h1>";
    h += '<p class="lead">Every question from the past exams, filed under the chapter of the slides it belongs to. Try each one yourself, then press <em>Show solution</em>. For multiple-choice items, click an option and you\'ll be told straight away if it\'s right or wrong. For written answers, open the solution and mark yourself. Your score for each chapter appears at the end of the chapter and in the table below.</p>';

    h += '<div class="grid-stats">' +
      stat(all.total, "questions in total") +
      stat(all.solved, "solved") +
      stat(all.unsolved, "unsolved (for you)") +
      stat(all.unassigned, "unassigned") + "</div>";

    h += "<h2>Chapters</h2>";
    h += '<div class="table-wrap"><table class="overview-table"><thead><tr><th>Section</th><th>Questions</th><th>Solved</th><th>Unsolved</th><th>Your score</th></tr></thead><tbody>';
    DATA.chapters.forEach(function (c) {
      var n = counts(questionsIn(c.id));
      var s = score(questionsIn(c.id));
      h += '<tr><td><a href="#/' + esc(c.id) + '">Chapter ' + esc(c.number) + " · " + esc(c.title) + "</a></td><td>" + n.total + "</td><td>" + n.solved + "</td><td>" + n.unsolved + "</td>" +
        "<td>" + (s.answered ? '<a href="' + resultsHref(c.id) + '">' + s.right + " / " + s.total + "</a>" : "—") + "</td></tr>";
    });
    var u = counts(questionsIn(UNASSIGNED));
    h += '<tr><td><a href="#/' + UNASSIGNED + '">Unassigned</a></td><td>' + u.total + "</td><td>—</td><td>—</td><td>—</td></tr>";
    h += "</tbody></table></div>";

    h += "<h2>Exams</h2><ul class=\"sources\">";
    Object.keys(DATA.sources || {}).forEach(function (k) {
      var s = DATA.sources[k];
      var n = DATA.questions.filter(function (q) { return q.source === k; }).length;
      h += "<li><strong>" + esc(s.label) + '</strong> <span class="pill neutral">' + n + " questions</span>" +
        '<div class="file">' + esc(s.file) + "</div>" +
        (s.notes ? '<div class="src-notes">' + esc(s.notes) + "</div>" : "") + "</li>";
    });
    h += "</ul>";
    h += '<p class="section-note" style="margin-top:24px">Last updated ' + esc(DATA.updated || "") + ".</p>";
    h += "</div>";
    main.innerHTML = h;

    function stat(n, l) { return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; }
  }

  // The order questions are stepped through in a section: solved first, then
  // the "Unsolved – for me to solve" ones at the end of the chapter.
  function sequence(key) {
    var list = bySource(questionsIn(key));
    if (key === UNASSIGNED) return list;
    return list.filter(function (q) { return statusOf(q) === "solved"; })
      .concat(list.filter(function (q) { return statusOf(q) === "unsolved"; }));
  }
  function sectionKeys() {
    return DATA.chapters.map(function (c) { return c.id; }).concat([UNASSIGNED]);
  }
  function questionHref(key, pos) { return "#/" + key + "/" + pos; }

  function renderSection(key, pos) {
    var isUnassigned = key === UNASSIGNED;
    var ch = isUnassigned ? null : chapterById(key);
    if (!isUnassigned && !ch) { location.hash = "#/"; return; }

    var c = counts(questionsIn(key));
    var seq = sequence(key);
    var n = seq.length;
    var i = Math.min(Math.max(pos || 1, 1), Math.max(n, 1));
    var q = seq[i - 1];
    var h = '<div class="view">';

    if (isUnassigned) {
      h += '<div class="eyebrow">Not yet in a chapter</div><h1>Unassigned questions</h1>';
      h += '<details class="panel"><summary>About this section</summary><p class="section-note" style="margin:0">These questions cover topics that are not in the current slides. They will be sorted into chapters as new modules are added to <code>slides/</code>.</p></details>';
    } else {
      h += '<div class="eyebrow">Chapter ' + esc(ch.number) + '</div><h1>' + esc(ch.title) + "</h1>";
      h += '<div class="stats"><span class="pill neutral">' + c.total + ' questions</span><span class="pill ok">✓ ' + c.solved + ' solved</span><span class="pill warn">? ' + c.unsolved + " unsolved</span></div>";
      if (ch.topics && ch.topics.length) {
        h += '<details class="panel"><summary>What this chapter covers</summary>';
        if (ch.summary) h += '<p class="section-note" style="margin:0 0 8px">' + esc(ch.summary) + "</p>";
        h += '<ul class="topics">' + ch.topics.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
        if (ch.keyTerms && ch.keyTerms.length) {
          h += '<div class="chips">' + ch.keyTerms.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") + "</div>";
        }
        if (ch.slides) h += '<p class="section-note" style="margin:12px 0 0">Slides: <a href="' + esc(ch.slides) + '" target="_blank" rel="noopener">' + esc(ch.slides) + "</a></p>";
        h += "</details>";
      }
    }

    h += '<div class="toolbar">' + sourceSelectHtml();
    if (n > 1) {
      h += '<select id="jumpTo" aria-label="Go to question">' + seq.map(function (x, k) {
        var src = sourceOf(x);
        return '<option value="' + (k + 1) + '"' + (k + 1 === i ? " selected" : "") + ">" +
          (k + 1) + " · " + esc(src.short || src.label) + " " + esc(x.ref) + (statusOf(x) === "unsolved" ? " (unsolved)" : "") + "</option>";
      }).join("") + "</select>";
    }
    h += "</div>";

    if (!q) {
      h += emptyFiltered() + "</div>";
      main.innerHTML = h;
      return;
    }

    h += '<div class="progress" aria-label="Question ' + i + " of " + n + '"><div class="progress-text"><span>Question <strong>' + i + "</strong> of " + n + "</span>" +
      (isUnassigned ? "" : '<span class="score-line" id="scoreLine">' + scoreLineHtml(key) + "</span>") + "</div>" +
      '<div class="progress-bar"><span style="width:' + (i / n * 100).toFixed(1) + '%"></span></div></div>';

    if (statusOf(q) === "unsolved") {
      h += '<div class="section-divider">Unsolved – for me to solve</div>';
      h += '<p class="section-note">Kept exactly as written in the exam. The note below says why it wasn\'t solved.</p>';
    }
    h += questionHtml(q, i);
    h += pagerHtml(key, i, n);
    h += "</div>";
    main.innerHTML = h;
  }

  function resultsHref(key) { return "#/" + key + "/results"; }

  function scoreLineHtml(key) {
    var s = score(sequence(key));
    if (!s.total) return "";
    return "Score: <strong>" + s.right + "</strong> right of " + s.answered + " answered · " +
      '<a href="' + resultsHref(key) + '">Results</a>';
  }

  // The button that leaves a section: the next section with questions, or Finish.
  function nextSectionLink(key) {
    var keys = sectionKeys();
    for (var k = keys.indexOf(key) + 1; k < keys.length; k++) {
      if (sequence(keys[k]).length) {
        return '<a class="btn primary pager-btn" href="' + questionHref(keys[k], 1) + '">' +
          esc(keys[k] === UNASSIGNED ? "Unassigned" : "Chapter " + chapterById(keys[k]).number) + " →</a>";
      }
    }
    return '<a class="btn primary pager-btn" href="#/">Finish ✓</a>';
  }

  function pagerHtml(key, i, n) {
    var prev = i > 1
      ? '<a class="btn pager-btn" href="' + questionHref(key, i - 1) + '" rel="prev">← Previous</a>'
      : '<span class="btn pager-btn disabled" aria-disabled="true">← Previous</span>';
    var next;
    if (i < n) {
      next = '<a class="btn primary pager-btn" href="' + questionHref(key, i + 1) + '" rel="next">Next →</a>';
    } else if (key !== UNASSIGNED && score(sequence(key)).total) {
      // End of a chapter: show the score before moving on.
      next = '<a class="btn primary pager-btn" href="' + resultsHref(key) + '" rel="next">See results →</a>';
    } else {
      next = nextSectionLink(key);
    }
    return '<nav class="pager" aria-label="Question navigation">' + prev +
      '<span class="pager-count">' + i + " / " + n + "</span>" + next + "</nav>";
  }

  function renderResults(key) {
    var ch = chapterById(key);
    if (!ch) { location.hash = "#/"; return; }
    var seq = sequence(key);
    var gradable = seq.filter(isGradable);
    var s = score(seq);
    var pct = s.total ? Math.round(s.right / s.total * 100) : 0;
    var notAnswered = s.total - s.answered;
    var unsolvedCount = seq.length - gradable.length;

    var h = '<div class="view">';
    h += '<div class="eyebrow">Chapter ' + esc(ch.number) + " · Results</div><h1>" + esc(ch.title) + "</h1>";
    if (state.source !== "all") {
      h += '<p class="section-note">Only questions from <strong>' + esc(sourceOf({ source: state.source }).label) + "</strong> (exam filter is on).</p>";
    }

    var tone = pct >= 80 ? "ok" : pct >= 50 ? "warn" : "bad";
    var message = !s.answered ? "You haven't answered any questions in this chapter yet."
      : pct === 100 ? "Perfect score. Well done!"
      : pct >= 80 ? "Great work."
      : pct >= 50 ? "Good progress. Review the ones you missed."
      : "Worth another pass. Review the ones you missed.";
    h += '<div class="score-card ' + tone + '">' +
      '<div class="score-big"><span class="score-num">' + s.right + '</span><span class="score-of">/ ' + s.total + "</span></div>" +
      '<div class="score-text"><div class="score-title">You got <strong>' + s.right + "</strong> of " + s.total + " questions right (" + pct + "%)</div>" +
      '<div class="score-msg">' + message + "</div></div>" +
      '<div class="progress-bar score-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="stats"><span class="pill ok">✓ ' + s.right + ' right</span><span class="pill bad">✗ ' + s.wrong + ' wrong</span><span class="pill neutral">– ' + notAnswered + " not answered</span></div>" +
      "</div>";

    if (notAnswered) {
      var firstMissing = gradable.filter(function (q) { return !answers[q.id]; })[0];
      h += '<div class="note"><strong>' + notAnswered + " not answered.</strong> These count as not right. " +
        '<a href="' + questionHref(key, seq.indexOf(firstMissing) + 1) + '">Answer the first one →</a></div>';
    }
    if (unsolvedCount) {
      h += '<div class="note info"><strong>Not scored:</strong> ' + unsolvedCount + " unsolved question" + (unsolvedCount === 1 ? "" : "s") + " (no answer key yet).</div>";
    }

    h += "<h2>Question by question</h2>";
    h += '<ul class="result-list">' + gradable.map(function (q) {
      var a = answers[q.id];
      var r = a ? a.result : "none";
      var icon = r === "right" ? "✓" : r === "wrong" ? "✗" : "–";
      var label = r === "right" ? "Right" : r === "wrong" ? "Wrong" : "Not answered";
      var pos = seq.indexOf(q) + 1;
      var src = sourceOf(q);
      return '<li><a class="result-row ' + r + '" href="' + questionHref(key, pos) + '">' +
        '<span class="rr-icon" aria-hidden="true">' + icon + "</span>" +
        '<span class="rr-text"><span class="q-num">#' + pos + "</span> " + esc(src.short || src.label) + " · " + esc(q.ref) +
        '<span class="rr-snip">' + esc(snippet(q.text, [])) + "</span></span>" +
        '<span class="rr-label">' + label + "</span></a></li>";
    }).join("") + "</ul>";

    h += '<nav class="pager" aria-label="Chapter navigation">' +
      '<button type="button" class="btn pager-btn" data-reset="' + esc(key) + '">↺ Start chapter again</button>' +
      '<span class="pager-count"></span>' + nextSectionLink(key) + "</nav>";
    h += "</div>";
    main.innerHTML = h;
  }

  function emptyFiltered() {
    return '<p class="empty">No questions from this exam in this section.</p>';
  }

  function renderSearch(query) {
    var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    var matches = DATA.questions.filter(function (q) {
      var src = sourceOf(q);
      var hay = [q.text, q.context, q.ref, q.notes, src.label, src.short,
        (q.options || []).map(function (o) { return o.key + " " + o.text; }).join(" "),
        q.table ? q.table.rows.map(function (r) { return r.join(" "); }).join(" ") : ""
      ].join(" \n ").toLowerCase();
      return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    matches = bySource(matches);

    var h = '<div class="view"><div class="eyebrow">Search</div><h1>' + matches.length + " result" + (matches.length === 1 ? "" : "s") + " for “" + esc(query) + "”</h1>";
    h += '<p class="lead">Searches question text, options, tables and exam names. Solutions aren\'t searched, so they won\'t give answers away. Tap a result to open it.</p>';
    h += '<div class="toolbar">' + sourceSelectHtml() + "</div>";
    if (!matches.length) {
      h += '<p class="empty">No matching questions.</p>';
    } else {
      sectionKeys().forEach(function (k) {
        var group = matches.filter(function (q) { return sectionKey(q) === k; });
        if (!group.length) return;
        var seq = sequence(k);
        h += '<section class="result-group"><h3>' + esc(sectionLabel(k)) + ' <span class="pill neutral">' + group.length + "</span></h3>";
        h += group.map(function (q) {
          var src = sourceOf(q);
          var pos = seq.indexOf(q) + 1;
          return '<a class="result" href="' + questionHref(k, pos) + '"><div class="q-meta">' +
            '<span class="q-num">#' + pos + '</span><span class="src">' + hl(src.short || src.label, tokens) + "</span>" +
            '<span class="ref">' + hl(q.ref, tokens) + "</span>" +
            (statusOf(q) === "unsolved" ? '<span class="pill warn">Unsolved</span>' : "") +
            '</div><div class="snippet">' + hl(snippet(q.text, tokens), tokens) + "</div></a>";
        }).join("");
        h += "</section>";
      });
    }
    h += "</div>";
    main.innerHTML = h;
  }

  // A short excerpt of the question text around the first search hit.
  function snippet(text, tokens) {
    var flat = String(text || "").replace(/\s+/g, " ").trim();
    var lower = flat.toLowerCase();
    var at = -1;
    tokens.forEach(function (t) { var p = lower.indexOf(t); if (p !== -1 && (at === -1 || p < at)) at = p; });
    var start = at > 60 ? at - 60 : 0;
    var out = flat.slice(start, start + 220);
    return (start > 0 ? "…" : "") + out + (start + 220 < flat.length ? "…" : "");
  }

  // ---------- routing ----------
  // #/            → overview
  // #/ch1         → chapter 1, question 1
  // #/ch1/4       → chapter 1, question 4
  // #/ch1/results → chapter 1 score
  function currentRoute() {
    var parts = (location.hash || "").replace(/^#\/?/, "").split("/");
    return { key: parts[0] || "overview", pos: parseInt(parts[1], 10) || 1, results: parts[1] === "results" };
  }

  function render() {
    var route = currentRoute();
    renderNav(state.query ? null : route.key);
    if (state.query) { renderSearch(state.query); return; }
    if (route.key === "overview") renderOverview();
    else if (route.results && route.key !== UNASSIGNED) renderResults(route.key);
    else renderSection(route.key, route.pos);
  }

  function goTo(key, pos) {
    var target = questionHref(key, pos);
    if (location.hash === target) render(); else location.hash = target;
  }

  window.addEventListener("hashchange", function () {
    if (state.query) { state.query = ""; searchInput.value = ""; }
    closeMenu();
    render();
    window.scrollTo(0, 0);
  });

  // ---------- interactions ----------
  var searchTimer = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      var v = searchInput.value.trim();
      state.query = v.length >= 2 ? v : "";
      render();
    }, 120);
  });
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { searchInput.value = ""; state.query = ""; render(); }
    if (e.key === "Enter") closeMenu();
  });
  document.addEventListener("keydown", function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // Arrow keys step through questions, same as the Previous / Next buttons.
      var link = main.querySelector(e.key === "ArrowRight" ? ".pager a.primary" : '.pager a[rel="prev"]');
      if (link) { e.preventDefault(); link.click(); }
    }
  });

  function setRevealed(card, open) {
    var btn = card.querySelector(".toggle");
    var sol = card.querySelector(".solution");
    if (!btn || !sol) return;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.querySelector(".toggle-label").textContent = open ? "Hide solution" : "Show solution";
    sol.hidden = !open;
    card.classList.toggle("revealed", open);
  }

  main.addEventListener("click", function (e) {
    var toggle = e.target.closest(".toggle");
    if (toggle) {
      var card = toggle.closest(".q");
      setRevealed(card, toggle.getAttribute("aria-expanded") !== "true");
      return;
    }
    var opt = e.target.closest(".option");
    if (opt) {
      var qCard = opt.closest(".q");
      var list = opt.closest(".options");
      var correctOpt = list.querySelector(".option.correct");
      if (!correctOpt) {
        // No answer key (unsolved/unassigned): just mark the choice.
        var wasPicked = opt.classList.contains("picked");
        list.querySelectorAll(".option").forEach(function (o) { o.classList.remove("picked"); });
        if (!wasPicked) opt.classList.add("picked");
        return;
      }
      // Grade the first pick straight away, then lock the question.
      if (qCard.classList.contains("answered")) return;
      opt.classList.add("picked");
      qCard.classList.add("answered");
      list.querySelectorAll(".option").forEach(function (o) { o.setAttribute("aria-disabled", "true"); });
      var right = opt === correctOpt;
      list.insertAdjacentHTML("afterend", verdictHtml(right, correctOpt.getAttribute("data-key")));
      recordAnswer(qCard, right ? "right" : "wrong", opt.getAttribute("data-key"));
      return;
    }
    var noteBtn = e.target.closest(".note-btn");
    if (noteBtn) {
      var panel = document.getElementById(noteBtn.getAttribute("aria-controls"));
      var open = noteBtn.getAttribute("aria-expanded") !== "true";
      noteBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (panel) panel.hidden = !open;
      return;
    }
    var mark = e.target.closest("[data-mark]");
    if (mark) {
      var mCard = mark.closest(".q");
      var result = mark.getAttribute("data-mark");
      mCard.querySelectorAll("[data-mark]").forEach(function (b) {
        var on = b === mark;
        b.classList.toggle("chosen", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      recordAnswer(mCard, result);
      return;
    }
    var reset = e.target.closest("[data-reset]");
    if (reset) {
      var rKey = reset.getAttribute("data-reset");
      questionsIn(rKey).forEach(function (q) { delete answers[q.id]; });
      saveAnswers();
      goTo(rKey, 1);
    }
  });

  function recordAnswer(card, result, picked) {
    answers[card.id] = picked ? { result: result, picked: picked } : { result: result };
    saveAnswers();
    var badge = card.querySelector(".result-badge");
    if (badge) badge.outerHTML = badgeHtml(result);
    var line = document.getElementById("scoreLine");
    if (line) line.innerHTML = scoreLineHtml(currentRoute().key);
  }

  main.addEventListener("change", function (e) {
    var route = currentRoute();
    if (e.target.id === "sourceFilter") {
      state.source = e.target.value;
      // The question list changes, so start the section again from the top.
      if (state.query || route.key === "overview" || route.results) render(); else goTo(route.key, 1);
    } else if (e.target.id === "jumpTo") {
      goTo(route.key, parseInt(e.target.value, 10));
    }
  });

  // ---------- mobile menu ----------
  function openMenu() {
    sidebar.classList.add("open");
    scrim.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    sidebar.classList.remove("open");
    scrim.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", function () {
    if (sidebar.classList.contains("open")) closeMenu(); else openMenu();
  });
  scrim.addEventListener("click", closeMenu);
  nav.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });

  // ---------- init ----------
  document.getElementById("courseName").textContent = DATA.course || "";
  document.getElementById("sidebarFoot").textContent = DATA.questions.length + " questions · " + Object.keys(DATA.sources || {}).length + " exams";
  render();
})();
