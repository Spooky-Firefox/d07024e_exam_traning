// Study session timer: pick a length, start/pause/reset, alert when time is up.
// State is kept in localStorage so a reload does not lose a running session.
(function () {
  "use strict";

  var STORAGE_KEY = "d7024e-timer-v1";
  var PRESETS = [5, 10, 15, 20, 25, 30, 45, 60, 90];
  var $ = function (id) { return document.getElementById(id); };

  var t = load();
  var tick = null;
  var baseTitle = document.title;

  function load() {
    var s = { minutes: 20, running: false, endAt: 0, remainingMs: 20 * 60000, reviewed: 0 };
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) Object.keys(s).forEach(function (k) { if (k in saved) s[k] = saved[k]; });
    } catch (e) { /* storage unavailable */ }
    return s;
  }
  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
  }

  function remaining() {
    return t.running ? Math.max(0, t.endAt - Date.now()) : t.remainingMs;
  }
  function fmt(ms) {
    var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function render() {
    var ms = remaining();
    var full = t.minutes * 60000;
    $("timer-display").textContent = fmt(ms);
    $("timer-start").textContent = t.running ? "Pause" : (ms < full ? "Resume" : "Start");
    $("timer-min").value = String(t.minutes);
    $("timer-min").disabled = t.running;
    $("timer-fill").style.width = (100 * (full - ms) / full) + "%";
    $("timer").classList.toggle("is-running", t.running);
    document.title = t.running ? fmt(ms) + " · " + baseTitle : baseTitle;
  }

  function start() {
    if (remaining() <= 0) t.remainingMs = t.minutes * 60000;
    t.endAt = Date.now() + t.remainingMs;
    t.running = true;
    save();
    askNotificationPermission();
    run();
  }
  function pause() {
    t.remainingMs = remaining();
    t.running = false;
    save();
    stop();
    render();
  }
  function reset() {
    t.running = false;
    t.remainingMs = t.minutes * 60000;
    t.reviewed = 0;
    save();
    stop();
    render();
  }
  function run() {
    stop();
    tick = window.setInterval(function () {
      if (remaining() <= 0) finish(); else render();
    }, 250);
    render();
  }
  function stop() {
    if (tick) window.clearInterval(tick);
    tick = null;
  }

  function finish() {
    var reviewed = t.reviewed;
    t.running = false;
    t.remainingMs = 0;
    save();
    stop();
    render();
    document.title = "⏰ Time's up · " + baseTitle;
    var msg = "You studied for " + t.minutes + " min" +
      (reviewed ? " and went through " + reviewed + " card" + (reviewed === 1 ? "" : "s") : "") + ".";
    $("timer-done-text").textContent = msg;
    $("timer-done").hidden = false;
    $("timer-done-close").focus();
    beep();
    notify(msg);
  }
  function dismiss() {
    $("timer-done").hidden = true;
    reset();
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      [0, 0.35, 0.7].forEach(function (offset) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.32);
      });
    } catch (e) { /* no audio */ }
  }
  function askNotificationPermission() {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch (e) { /* ignore */ }
  }
  function notify(msg) {
    try {
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification("Study session done", { body: msg });
      }
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- wiring
  var sel = $("timer-min");
  PRESETS.forEach(function (m) { sel.add(new Option(m + " min", String(m))); });
  if (PRESETS.indexOf(t.minutes) < 0) t.minutes = 20;

  sel.addEventListener("change", function () {
    t.minutes = Number(sel.value);
    t.remainingMs = t.minutes * 60000;
    save();
    render();
  });
  $("timer-start").addEventListener("click", function () { if (t.running) pause(); else start(); });
  $("timer-reset").addEventListener("click", reset);
  $("timer-done-close").addEventListener("click", dismiss);
  $("timer-done-more").addEventListener("click", function () {
    $("timer-done").hidden = true;
    reset();
    start();
  });
  // app.js fires this whenever a card is answered or marked.
  document.addEventListener("d7024e:reviewed", function () {
    if (!t.running) return;
    t.reviewed++;
    save();
  });

  if (t.running) {
    if (remaining() <= 0) finish(); else run();
  } else {
    render();
  }
})();
