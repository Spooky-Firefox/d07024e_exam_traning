(function () {
  "use strict";

  var STORAGE_KEY = "d7024e-flashcards-v1";
  var ANSWERS = ["true", "false", "depends"];
  var ANSWER_LABEL = { "true": "True", "false": "False", "depends": "Depends" };

  var topicLabel = {};
  window.TOPICS.forEach(function (t) { topicLabel[t.id] = t.label; });

  // ---------------------------------------------------------------- cards
  var cards = [];
  window.EXAM_CARDS.forEach(function (c) {
    cards.push({
      id: c.id, kind: "exam", topics: c.topics, prompt: c.statement,
      answer: c.answer, explain: c.why, exam: c.exam, q: c.q,
      source: "Exam " + c.exam + " · 1" + c.q
    });
  });
  window.CONCEPT_CARDS.forEach(function (c) {
    cards.push({
      id: c.id, kind: "concept", topics: c.topics, prompt: c.q,
      explain: c.a, source: c.src
    });
  });
  var byId = {};
  cards.forEach(function (c) { byId[c.id] = c; });

  // Exam statements that recur (identical apart from punctuation) across years.
  var norm = function (s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  var sameText = {};
  cards.forEach(function (c) {
    if (c.kind !== "exam") return;
    var k = norm(c.prompt);
    (sameText[k] = sameText[k] || []).push(c);
  });
  cards.forEach(function (c) {
    if (c.kind !== "exam") return;
    c.alsoIn = sameText[norm(c.prompt)]
      .filter(function (o) { return o !== c; })
      .map(function (o) { return o.exam; });
  });

  var years = [];
  window.EXAM_CARDS.forEach(function (c) { if (years.indexOf(c.exam) < 0) years.push(c.exam); });

  // ---------------------------------------------------------------- state
  var defaults = {
    progress: {},          // id -> { known, right, wrong }
    deck: "all",
    year: "all",
    topics: [],            // empty = all topics
    hideKnown: false,
    shuffle: false,
    view: "study"
  };
  var state = load();

  function load() {
    var s = JSON.parse(JSON.stringify(defaults));
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(defaults).forEach(function (k) { if (k in saved) s[k] = saved[k]; });
      }
    } catch (e) { /* storage unavailable: run without persistence */ }
    return s;
  }
  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function prog(id) {
    return state.progress[id] || { known: false, right: 0, wrong: 0 };
  }
  function setProg(id, patch) {
    var p = prog(id);
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    state.progress[id] = p;
    save();
  }

  // Session (not persisted): the current ordered queue and position.
  var queue = [];
  var pos = 0;
  var revealed = false;
  var picked = null;

  // ---------------------------------------------------------------- filtering
  function matchesBase(c) {
    if (state.deck !== "all" && c.kind !== state.deck) return false;
    if (c.kind === "exam" && state.year !== "all" && c.exam !== state.year) return false;
    return true;
  }
  function matchesTopics(c) {
    if (!state.topics.length) return true;
    return c.topics.some(function (t) { return state.topics.indexOf(t) >= 0; });
  }
  function filtered() {
    return cards.filter(function (c) { return matchesBase(c) && matchesTopics(c); });
  }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function rebuildQueue(keepCurrent) {
    var currentId = keepCurrent && queue[pos] ? queue[pos].id : null;
    var list = filtered().filter(function (c) { return !(state.hideKnown && prog(c.id).known); });
    queue = state.shuffle ? shuffled(list) : list;
    pos = 0;
    if (currentId) {
      for (var i = 0; i < queue.length; i++) if (queue[i].id === currentId) { pos = i; break; }
    }
    resetCard();
  }
  function resetCard() { revealed = false; picked = null; }

  // ---------------------------------------------------------------- rendering helpers
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  // Plain text with "- " bullet lines becomes paragraphs and lists.
  function richText(text) {
    var html = "", inList = false;
    text.split("\n").forEach(function (line) {
      if (/^- /.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + esc(line.slice(2)) + "</li>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (line.trim()) html += "<p>" + esc(line) + "</p>";
      }
    });
    if (inList) html += "</ul>";
    return html;
  }
  function tagsHtml(c) {
    var html = '<span class="tag kind">' + (c.kind === "exam" ? "Exam statement" : "Concept") + "</span>";
    html += '<span class="tag">' + esc(c.source) + "</span>";
    c.topics.forEach(function (t) { html += '<span class="tag">' + esc(topicLabel[t] || t) + "</span>"; });
    if (prog(c.id).known) html += '<span class="tag known">✓ Known</span>';
    return html;
  }
  function alsoHtml(c) {
    if (c.kind !== "exam" || !c.alsoIn.length) return "";
    return '<p class="also">Same statement also on the ' + esc(c.alsoIn.join(", ")) + " exam.</p>";
  }

  var $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------------- filters UI
  function renderFilters() {
    document.querySelectorAll(".segmented button").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.deck === state.deck));
    });
    var sel = $("year");
    if (!sel.options.length) {
      sel.add(new Option("All years", "all"));
      years.forEach(function (y) { sel.add(new Option(y, y)); });
    }
    sel.value = state.year;
    $("year-wrap").hidden = state.deck === "concept";
    $("hide-known").checked = state.hideKnown;
    $("shuffle").checked = state.shuffle;
    $("reshuffle").hidden = !state.shuffle;

    var base = cards.filter(matchesBase);
    var html = '<button class="chip" data-topic="" aria-pressed="' + (!state.topics.length) + '">All topics<span class="count">' + base.length + "</span></button>";
    window.TOPICS.forEach(function (t) {
      var inTopic = base.filter(function (c) { return c.topics.indexOf(t.id) >= 0; });
      if (!inTopic.length) return;
      var known = inTopic.filter(function (c) { return prog(c.id).known; }).length;
      html += '<button class="chip" data-topic="' + t.id + '" aria-pressed="' + (state.topics.indexOf(t.id) >= 0) + '">' +
        esc(t.label) + '<span class="count">' + known + "/" + inTopic.length + "</span></button>";
    });
    $("topics").innerHTML = html;
    $("topics-summary").textContent = "Topics: " + (state.topics.length
      ? state.topics.map(function (t) { return topicLabel[t]; }).join(", ")
      : "all");

    var sel2 = filtered();
    var knownCount = sel2.filter(function (c) { return prog(c.id).known; }).length;
    $("summary").textContent = sel2.length + " cards selected · " + knownCount + " known · " +
      (sel2.length - knownCount) + " still to learn";
    $("bar").style.width = sel2.length ? (100 * knownCount / sel2.length) + "%" : "0";
  }

  // ---------------------------------------------------------------- study view
  function renderCard() {
    var el = $("card");
    $("position").textContent = queue.length ? (pos + 1) + " / " + queue.length : "0 / 0";
    $("prev").disabled = pos <= 0;
    $("next").disabled = pos >= queue.length - 1;

    if (!queue.length) {
      var anyFiltered = filtered().length > 0;
      el.innerHTML = '<p class="empty">' + (anyFiltered && state.hideKnown
        ? "You know every card in this selection. 🎉<br>Untick <b>Hide known</b> to review them, or pick other topics."
        : "No cards match these filters.") + "</p>";
      return;
    }
    var c = queue[pos];
    var html = '<div class="meta">' + tagsHtml(c) + "</div>";
    html += '<p class="prompt">' + esc(c.prompt) + "</p>";

    if (c.kind === "exam") {
      html += '<div class="answers">';
      ANSWERS.forEach(function (a) {
        html += '<button class="a-' + a + (picked === a ? " picked" : "") + '" data-answer="' + a + '"' +
          (revealed ? " disabled" : "") + ">" + ANSWER_LABEL[a] + "</button>";
      });
      html += "</div>";
      if (revealed) {
        html += '<div class="reveal"><div class="verdict">';
        if (picked) {
          html += picked === c.answer
            ? '<span class="result ok">✓ Correct</span>'
            : '<span class="result bad">✗ You said ' + ANSWER_LABEL[picked] + "</span>";
        }
        html += '<span class="pill ' + c.answer + '">Suggested: ' + ANSWER_LABEL[c.answer] + "</span></div>";
        html += '<div class="explain">' + richText(c.explain) + "</div>" + alsoHtml(c) + "</div>";
      }
    } else if (revealed) {
      html += '<div class="reveal explain">' + richText(c.explain) + "</div>";
    }

    html += '<div class="actions">';
    if (!revealed) {
      html += c.kind === "exam"
        ? '<button class="ghost" data-act="reveal">Just show the answer</button>'
        : '<button class="primary" data-act="reveal">Show answer</button>';
    } else {
      html += '<button class="know" data-act="know">✓ I know this</button>';
      html += '<button class="learn" data-act="learn">Still learning</button>';
    }
    html += "</div>";
    el.innerHTML = html;
  }

  function answer(a) {
    var c = queue[pos];
    if (!c || c.kind !== "exam" || revealed) return;
    picked = a;
    revealed = true;
    var p = prog(c.id);
    if (a === c.answer) setProg(c.id, { right: p.right + 1 });
    else setProg(c.id, { wrong: p.wrong + 1 });
    renderCard();
  }
  function reveal() {
    if (!queue.length || revealed) return;
    revealed = true;
    renderCard();
  }
  function mark(known) {
    var c = queue[pos];
    if (!c) return;
    setProg(c.id, { known: known });
    document.dispatchEvent(new CustomEvent("d7024e:reviewed"));
    if (known && state.hideKnown) {
      queue.splice(pos, 1);
      if (pos >= queue.length) pos = Math.max(0, queue.length - 1);
    } else if (pos < queue.length - 1) {
      pos++;
    }
    resetCard();
    renderAll();
  }
  function go(delta) {
    var n = pos + delta;
    if (n < 0 || n >= queue.length) return;
    pos = n;
    resetCard();
    renderCard();
  }

  // ---------------------------------------------------------------- browse view
  function renderBrowse() {
    var q = norm($("search").value || "");
    var list = filtered().filter(function (c) {
      if (state.hideKnown && prog(c.id).known) return false;
      if (!q) return true;
      return norm(c.prompt + " " + c.explain + " " + c.source).indexOf(q) >= 0;
    });
    if (!list.length) {
      $("browse-list").innerHTML = '<li class="empty">No cards match.</li>';
      return;
    }
    $("browse-list").innerHTML = list.map(function (c) {
      var known = prog(c.id).known;
      var answerLine = c.kind === "exam"
        ? '<span class="pill ' + c.answer + '">' + ANSWER_LABEL[c.answer] + "</span>"
        : "";
      return '<li class="browse-item' + (known ? " is-known" : "") + '">' +
        '<div class="browse-head"><div class="meta">' + tagsHtml(c) + "</div>" +
        '<label class="check"><input type="checkbox" data-known="' + c.id + '"' + (known ? " checked" : "") + "> Known</label></div>" +
        '<p class="prompt">' + esc(c.prompt) + "</p>" +
        "<details><summary>Answer</summary><div class=\"verdict\">" + answerLine + "</div>" +
        '<div class="explain">' + richText(c.explain) + "</div>" + alsoHtml(c) + "</details></li>";
    }).join("");
  }

  // ---------------------------------------------------------------- view switching
  function renderView() {
    var study = state.view === "study";
    $("view-study").hidden = !study;
    $("view-browse").hidden = study;
    $("tab-study").setAttribute("aria-selected", String(study));
    $("tab-browse").setAttribute("aria-selected", String(!study));
  }
  function renderAll() {
    renderFilters();
    renderView();
    if (state.view === "study") renderCard(); else renderBrowse();
  }
  function filtersChanged() {
    save();
    rebuildQueue(false);
    renderAll();
  }

  // ---------------------------------------------------------------- events
  document.querySelector(".segmented").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-deck]");
    if (!b) return;
    state.deck = b.dataset.deck;
    filtersChanged();
  });
  $("year").addEventListener("change", function (e) { state.year = e.target.value; filtersChanged(); });
  $("hide-known").addEventListener("change", function (e) { state.hideKnown = e.target.checked; filtersChanged(); });
  $("shuffle").addEventListener("change", function (e) { state.shuffle = e.target.checked; filtersChanged(); });
  $("reshuffle").addEventListener("click", function () { rebuildQueue(false); renderAll(); });
  $("topics").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-topic]");
    if (!b) return;
    var t = b.dataset.topic;
    if (!t) state.topics = [];
    else {
      var i = state.topics.indexOf(t);
      if (i >= 0) state.topics.splice(i, 1); else state.topics.push(t);
    }
    filtersChanged();
  });

  $("card").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.answer) answer(b.dataset.answer);
    else if (b.dataset.act === "reveal") reveal();
    else if (b.dataset.act === "know") mark(true);
    else if (b.dataset.act === "learn") mark(false);
  });
  $("prev").addEventListener("click", function () { go(-1); });
  $("next").addEventListener("click", function () { go(1); });

  document.querySelector(".tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-view]");
    if (!b) return;
    state.view = b.dataset.view;
    save();
    if (state.view === "study") rebuildQueue(true);
    renderAll();
  });
  $("search").addEventListener("input", renderBrowse);
  $("browse-list").addEventListener("change", function (e) {
    var id = e.target.dataset.known;
    if (!id) return;
    setProg(id, { known: e.target.checked });
    renderFilters();
    renderBrowse();
  });

  $("reset").addEventListener("click", function () {
    if (!window.confirm("Forget which cards you know and your answer history?")) return;
    state.progress = {};
    save();
    rebuildQueue(false);
    renderAll();
  });

  document.addEventListener("keydown", function (e) {
    if (state.view !== "study" || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    var c = queue[pos];
    var k = e.key.toLowerCase();
    if (k === "arrowright") { go(1); e.preventDefault(); }
    else if (k === "arrowleft") { go(-1); e.preventDefault(); }
    else if (k === "s" && state.shuffle) { rebuildQueue(false); renderAll(); }
    else if (!c) return;
    else if (c.kind === "exam" && !revealed && (k === "t" || k === "1")) answer("true");
    else if (c.kind === "exam" && !revealed && (k === "f" || k === "2")) answer("false");
    else if (c.kind === "exam" && !revealed && (k === "d" || k === "3")) answer("depends");
    else if ((k === " " || k === "enter") && !revealed) { reveal(); e.preventDefault(); }
    else if (k === "k" && revealed) mark(true);
    else if (k === "l" && revealed) mark(false);
  });

  // Topic chips take the whole screen on phones, so start them collapsed there.
  $("topics-box").open = !window.matchMedia("(max-width: 560px)").matches;

  rebuildQueue(false);
  renderAll();
})();
