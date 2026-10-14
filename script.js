(() => {
  "use strict";

  const STORAGE_KEY = "stillpoint-v1";
  const CACHE_ID = "stillpoint-v30";
  const AUDIO_BY_MODE = {
    sit: "./audio/stillpoint-sit.mp3",
    box: "./audio/stillpoint-box.mp3",
    wind: "./audio/stillpoint-wind.mp3"
  };
  // File beds for Nature (wild) and Beach (shore); Soft still uses AUDIO_BY_MODE.
  const AUDIO_BY_SOUND = {
    wild: "./audio/stillpoint-wild.mp3",
    shore: "./audio/stillpoint-shore.mp3",
    rain: "./audio/stillpoint-rain.mp3",
    fall: "./audio/stillpoint-fall.mp3"
  };
  const SOUND_KINDS = ["soft", "white", "rain", "fall", "shore", "wild"];
  const MUSIC_VOL = 0.32;
  const BELL_VOL = 0.72;
  const MIN_LOG_SECONDS = 15;
  const DEFAULT_GOALS = { dailyMinutes: 10, weeklySits: 5 };

  const BADGE_DEFS = [
    { id: "first-sit", label: "First sit", desc: "Complete your first practice" },
    { id: "streak-3", label: "3-day streak", desc: "Sit three days in a row" },
    { id: "streak-7", label: "7-day streak", desc: "Sit seven days in a row" },
    { id: "minutes-60", label: "60 minutes", desc: "Sixty minutes total practiced" },
    { id: "week-sits-7", label: "Seven sits this week", desc: "Seven sits in one Mon–Sun week" }
  ];

  const TYPES = {
    sit: {
      label: "Timed sit",
      hint: "Follow the light. Inhale as it grows, exhale as it recedes.",
      phases: [
        { id: "inhale", name: "Breathe in", seconds: 4 },
        { id: "exhale", name: "Breathe out", seconds: 6 }
      ]
    },
    box: {
      label: "Box breathing",
      hint: "A square of four: in, hold, out, hold.",
      phases: [
        { id: "inhale", name: "Inhale", seconds: 4 },
        { id: "hold-in", name: "Hold", seconds: 4 },
        { id: "exhale", name: "Exhale", seconds: 4 },
        { id: "hold-out", name: "Hold", seconds: 4 }
      ]
    },
    wind: {
      label: "Wind-down",
      hint: "Four in, seven hold, eight out. Let the day leave.",
      phases: [
        { id: "inhale", name: "Inhale", seconds: 4 },
        { id: "hold-in", name: "Hold", seconds: 7 },
        { id: "exhale", name: "Exhale", seconds: 8 }
      ]
    }
  };

  const els = {
    begin: document.getElementById("begin-btn"),
    pause: document.getElementById("pause-btn"),
    stop: document.getElementById("stop-btn"),
    audioBtn: document.getElementById("audio-btn"),
    mute: document.getElementById("mute-btn"),
    home: document.getElementById("home-btn"),
    install: document.getElementById("install-btn"),
    historyBtn: document.getElementById("history-btn"),
    historyClose: document.getElementById("history-close"),
    historyBackdrop: document.getElementById("history-backdrop"),
    historySheet: document.getElementById("history-sheet"),
    historyList: document.getElementById("history-list"),
    historyEmpty: document.getElementById("history-empty"),
    customMinutes: document.getElementById("custom-minutes"),
    timer: document.getElementById("timer-display"),
    timerLive: document.getElementById("timer-live"),
    phase: document.getElementById("phase-label"),
    hint: document.getElementById("session-hint"),
    kicker: document.getElementById("session-kicker"),
    soundscape: document.getElementById("soundscape"),
    views: {
      home: document.getElementById("view-home"),
      session: document.getElementById("view-session"),
      complete: document.getElementById("view-complete")
    },
    stats: {
      streak: document.getElementById("stat-streak"),
      run: document.getElementById("stat-run"),
      total: document.getElementById("stat-total"),
      count: document.getElementById("stat-count")
    },
    hist: {
      streak: document.getElementById("hist-streak"),
      total: document.getElementById("hist-total"),
      weekMinutes: document.getElementById("week-minutes"),
      weekSits: document.getElementById("week-sits")
    },
    goals: {
      dailyNow: document.getElementById("goal-daily-now"),
      dailyTarget: document.getElementById("goal-daily-target"),
      dailyBar: document.getElementById("goal-daily-bar"),
      weeklyNow: document.getElementById("goal-weekly-now"),
      weeklyTarget: document.getElementById("goal-weekly-target"),
      weeklyBar: document.getElementById("goal-weekly-bar")
    },
    cal: {
      title: document.getElementById("cal-title"),
      grid: document.getElementById("cal-grid"),
      prev: document.getElementById("cal-prev"),
      next: document.getElementById("cal-next"),
      selectedLabel: document.getElementById("cal-selected-label")
    },
    badgesList: document.getElementById("badges-list"),
    complete: {
      title: document.getElementById("complete-title"),
      meta: document.getElementById("complete-meta"),
      streak: document.getElementById("complete-streak")
    }
  };

  const state = {
    status: "idle",
    type: "sit",
    durationMinutes: 10,
    isOpen: false,
    remaining: 600,
    elapsed: 0,
    musicEnabled: true,
    muted: false,
    soundId: "soft",
    timerId: null,
    phaseId: null,
    phaseIndex: 0,
    phaseEndsAt: 0,
    hiddenWhileRunning: false,
    sessionActive: false,
    bellArmed: false,
    installEvent: null,
    iosA2hs: false,
    wakeLock: null,
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    selectedDay: todayKey(),
    sessionMeta: null,
    confirmTimer: null,
    sitHistory: false,
    ignorePop: false
  };
  const CONFIRM_MS = 4000;

  function defaultStore() {
    return {
      history: [],
      musicEnabled: true,
      muted: false,
      soundId: "soft",
      goals: { ...DEFAULT_GOALS },
      badges: []
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStore();
      const data = JSON.parse(raw);
      const goals = data.goals && typeof data.goals === "object" ? data.goals : {};
      return {
        history: Array.isArray(data.history) ? data.history : [],
        musicEnabled: data.musicEnabled !== false,
        muted: Boolean(data.muted),
        soundId: SOUND_KINDS.includes(data.soundId) ? data.soundId : "soft",
        goals: {
          dailyMinutes: Number(goals.dailyMinutes) > 0 ? Number(goals.dailyMinutes) : DEFAULT_GOALS.dailyMinutes,
          weeklySits: Number(goals.weeklySits) > 0 ? Number(goals.weeklySits) : DEFAULT_GOALS.weeklySits
        },
        badges: Array.isArray(data.badges) ? data.badges : []
      };
    } catch {
      return defaultStore();
    }
  }

  function saveStore(patch) {
    const current = loadStore();
    const next = { ...current, ...patch };
    if (patch.goals) next.goals = { ...current.goals, ...patch.goals };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function audioSrcFor(type) {
    return AUDIO_BY_MODE[type] || AUDIO_BY_MODE.sit;
  }

  function soundscapeSrcFor(soundId, type) {
    if (AUDIO_BY_SOUND[soundId]) return AUDIO_BY_SOUND[soundId];
    return audioSrcFor(type);
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || typeof navigator.wakeLock.request !== "function") return;
    try {
      if (state.wakeLock) {
        try { await state.wakeLock.release(); } catch {}
        state.wakeLock = null;
      }
      const lock = await navigator.wakeLock.request("screen");
      state.wakeLock = lock;
      lock.addEventListener("release", () => {
        if (state.wakeLock === lock) state.wakeLock = null;
      });
    } catch {
      state.wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    const lock = state.wakeLock;
    state.wakeLock = null;
    if (!lock) return;
    try { await lock.release(); } catch {}
  }

  function lazyCacheAudio(url) {
    if (!url || !("caches" in window)) return;
    const abs = new URL(url, window.location.href).href;
    caches.open(CACHE_ID).then(async (cache) => {
      const hit = await cache.match(abs, { ignoreSearch: true, ignoreVary: true });
      if (hit) return;
      try { await cache.add(new Request(abs, { cache: "reload" })); } catch {}
    }).catch(() => {});
  }

  function computeStreak(history) {
    // Every logged sit counts (a timed sit ended early still counts toward days sat).
    const days = new Set(history.map((item) => item.day));
    if (!days.size) return 0;
    const cursor = new Date();
    let key = todayKey(cursor);
    if (!days.has(key)) {
      cursor.setDate(cursor.getDate() - 1);
      key = todayKey(cursor);
      if (!days.has(key)) return 0;
    }
    let streak = 0;
    while (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      key = todayKey(cursor);
    }
    return streak;
  }

  function daysSat(history) {
    return new Set(history.map((item) => item.day)).size;
  }

  // Calm framing: only "N days in a row" when N >= 2; never "0 days".
  function runText(streak) {
    return streak >= 2 ? `${streak} days in a row` : "";
  }

  function totalMinutes(history) {
    return history.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
  }

  function startOfLocalWeek(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekBounds(date = new Date()) {
    const start = startOfLocalWeek(date);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { startKey: todayKey(start), endKey: todayKey(end) };
  }

  function weekStats(history, date = new Date()) {
    const { startKey, endKey } = weekBounds(date);
    let minutes = 0;
    let sits = 0;
    history.forEach((item) => {
      const day = item && item.day;
      if (!day || day < startKey || day > endKey) return;
      minutes += Number(item.minutes) || 0;
      sits += 1;
    });
    return { minutes, sits };
  }

  function dayMinutes(history, dayKey) {
    return history
      .filter((item) => item.day === dayKey)
      .reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
  }

  function sessionsForDay(history, dayKey) {
    return history.filter((item) => item.day === dayKey);
  }

  function practiceDays(history) {
    const set = new Set();
    history.forEach((item) => {
      if (item && item.day) set.add(item.day);
    });
    return set;
  }

  function maxWeekSits(history) {
    const byWeek = new Map();
    history.forEach((item) => {
      if (!item || !item.day) return;
      const parts = item.day.split("-").map(Number);
      if (parts.length !== 3) return;
      const date = new Date(parts[0], parts[1] - 1, parts[2]);
      const { startKey } = weekBounds(date);
      byWeek.set(startKey, (byWeek.get(startKey) || 0) + 1);
    });
    let max = 0;
    byWeek.forEach((n) => {
      if (n > max) max = n;
    });
    return max;
  }

  function evaluateBadges(store) {
    const history = store.history;
    const streak = computeStreak(history);
    const total = totalMinutes(history);
    const unlocked = new Set(store.badges || []);
    const earned = [];
    if (history.some((h) => h.completed) || history.length > 0) earned.push("first-sit");
    if (streak >= 3) earned.push("streak-3");
    if (streak >= 7) earned.push("streak-7");
    if (total >= 60) earned.push("minutes-60");
    if (maxWeekSits(history) >= 7 || weekStats(history).sits >= 7) earned.push("week-sits-7");
    let changed = false;
    earned.forEach((id) => {
      if (!unlocked.has(id)) {
        unlocked.add(id);
        changed = true;
        track("badge_unlock", { badge_id: id });
      }
    });
    if (changed) return saveStore({ badges: [...unlocked] });
    return store;
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function selectedType() {
    const node = document.querySelector('input[name="session-type"]:checked');
    return (node && node.value) || "sit";
  }

  function selectedDuration() {
    const custom = Number.parseInt(els.customMinutes.value, 10);
    if (els.customMinutes.value !== "" && Number.isFinite(custom) && custom >= 1) {
      return { minutes: Math.min(180, custom), isOpen: false };
    }
    const node = document.querySelector('input[name="duration"]:checked');
    const value = node ? Number(node.value) : 10;
    if (value === 0) return { minutes: 0, isOpen: true };
    return { minutes: value, isOpen: false };
  }


  function durationKindMeta() {
    const customRaw = els.customMinutes ? els.customMinutes.value : "";
    const custom = Number.parseInt(customRaw, 10);
    if (customRaw !== "" && Number.isFinite(custom) && custom >= 1) {
      return { duration_kind: "custom", duration_min: Math.min(180, custom) };
    }
    const node = document.querySelector('input[name="duration"]:checked');
    const value = node ? Number(node.value) : 10;
    if (value === 0) return { duration_kind: "open", duration_min: null };
    return { duration_kind: "preset", duration_min: value };
  }

  function track(event, props) {
    try {
      if (window.posthog && typeof window.posthog.capture === "function") {
        window.posthog.capture(event, props || {});
      }
    } catch (_) {}
  }

  function renderConfiguredTime() {
    const { minutes, isOpen } = selectedDuration();
    els.timer.textContent = isOpen ? "0:00" : formatTime(minutes * 60);
  }

  function setView(name) {
    Object.entries(els.views).forEach(([key, node]) => {
      node.hidden = key !== name;
    });
    document.body.classList.toggle("is-session", name === "session");
    document.body.classList.toggle("is-complete", name === "complete");
  }

  function engine() {
    return window.StillpointSound || null;
  }

  function isSynthKind(id) {
    const e = engine();
    return Boolean(e && e.isSynth(id || state.soundId));
  }

  function fadeFactor() {
    if (!state.musicEnabled || state.muted || state.isOpen || !state.sessionActive) return 1;
    if (state.remaining > 30) return 1;
    return Math.max(0, state.remaining) / 30;
  }

  const SOUND_LABELS = {
    soft: "Soft",
    white: "Hush",
    rain: "Rain",
    fall: "Deep rain",
    shore: "Beach",
    wild: "Nature"
  };

  function syncSoundChoice() {
    document.querySelectorAll(".sound-chip-btn[data-sound]").forEach((btn) => {
      const on = btn.dataset.sound === state.soundId;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    const nameEl = document.getElementById("session-sound-name");
    if (nameEl) nameEl.textContent = SOUND_LABELS[state.soundId] || "Soft";
  }

  function syncMusicButtons() {
    els.audioBtn.setAttribute("aria-pressed", String(state.musicEnabled));
    els.audioBtn.textContent = state.musicEnabled ? "Soundscape on" : "Soundscape off";
    els.mute.setAttribute("aria-pressed", String(state.muted));
    els.mute.setAttribute("aria-label", state.muted ? "Unmute" : "Mute");
    els.soundscape.muted = state.muted;
    const e = engine();
    if (e) {
      e.setMuted(state.muted);
      e.setEnabled(state.musicEnabled);
    }
    syncSoundChoice();
  }

  function applyChosenSound({ reset = false, play = false } = {}) {
    const e = engine();
    const synth = isSynthKind(state.soundId);
    if (e) {
      e.setMuted(state.muted);
      e.setEnabled(state.musicEnabled);
    }
    if (synth) {
      els.soundscape.pause();
      if (reset) els.soundscape.currentTime = 0;
      if (play && state.musicEnabled) {
        e.resume();
        e.setKind(state.soundId);
        e.setFade(state.muted ? 0 : fadeFactor());
      } else if (e) {
        e.stop();
      }
      return;
    }
    // Tell the engine the current kind is a file bed (stops the synth and keeps its kind in sync).
    if (e) e.setKind(state.soundId);
    // soft → mode beds; rain/fall/wild/shore → recorded file beds (mirror Soft HTMLAudio path)
    applyBedAudio(soundscapeSrcFor(state.soundId, state.type), { reset, play });
  }

  function setSound(id) {
    const next = SOUND_KINDS.includes(id) ? id : "soft";
    state.soundId = next;
    saveStore({ soundId: next });
    syncSoundChoice();
    if (state.sessionActive && state.status === "running") {
      applyChosenSound({ reset: false, play: true });
      updateSoundscapeVolume();
    } else if (state.sessionActive && state.status === "paused") {
      applyChosenSound({ reset: false, play: false });
    }
  }

  function setGoalBar(el, now, target) {
    if (!el) return;
    const pct = target > 0 ? Math.min(100, Math.round((now / target) * 100)) : 0;
    el.style.width = `${pct}%`;
  }

  function renderGoals(store) {
    const history = store.history;
    const goals = store.goals || DEFAULT_GOALS;
    const todayMins = dayMinutes(history, todayKey());
    const week = weekStats(history);
    if (els.goals.dailyNow) els.goals.dailyNow.textContent = String(todayMins);
    if (els.goals.dailyTarget) els.goals.dailyTarget.textContent = String(goals.dailyMinutes);
    if (els.goals.weeklyNow) els.goals.weeklyNow.textContent = String(week.sits);
    if (els.goals.weeklyTarget) els.goals.weeklyTarget.textContent = String(goals.weeklySits);
    setGoalBar(els.goals.dailyBar, todayMins, goals.dailyMinutes);
    setGoalBar(els.goals.weeklyBar, week.sits, goals.weeklySits);
  }

  function renderBadges(store) {
    if (!els.badgesList) return;
    const unlocked = new Set(store.badges || []);
    els.badgesList.replaceChildren();
    BADGE_DEFS.forEach((def) => {
      const li = document.createElement("li");
      const on = unlocked.has(def.id);
      li.className = on ? "badge is-unlocked" : "badge is-locked";
      const name = document.createElement("span");
      name.className = "badge-name";
      name.textContent = def.label;
      const desc = document.createElement("span");
      desc.className = "badge-desc";
      desc.textContent = def.desc;
      const text = document.createElement("span");
      text.className = "badge-text";
      text.append(name, desc);
      const mark = document.createElement("span");
      mark.className = "badge-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = on ? "✦" : "·";
      li.append(mark, text);
      els.badgesList.append(li);
    });
  }

  function renderCalendar(store) {
    if (!els.cal.grid) return;
    const days = practiceDays(store.history);
    const year = state.calYear;
    const month = state.calMonth;
    const first = new Date(year, month, 1);
    const monthLabel = first.toLocaleString(undefined, { month: "long", year: "numeric" });
    els.cal.title.textContent = monthLabel;
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    els.cal.grid.replaceChildren();
    for (let i = 0; i < startPad; i += 1) {
      const empty = document.createElement("span");
      empty.className = "cal-cell is-empty";
      empty.setAttribute("aria-hidden", "true");
      els.cal.grid.append(empty);
    }
    const today = todayKey();
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(year, month, d);
      const key = todayKey(date);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-cell";
      btn.textContent = String(d);
      btn.dataset.day = key;
      if (days.has(key)) btn.classList.add("has-practice");
      if (key === today) btn.classList.add("is-today");
      if (key === state.selectedDay) btn.classList.add("is-selected");
      btn.setAttribute("aria-label", `${key}${days.has(key) ? ", practice logged" : ""}`);
      btn.addEventListener("click", () => {
        state.selectedDay = key;
        renderStats();
      });
      els.cal.grid.append(btn);
    }
    if (els.cal.selectedLabel) {
      const count = sessionsForDay(store.history, state.selectedDay).length;
      els.cal.selectedLabel.textContent = count
        ? `${state.selectedDay} · ${count} session${count === 1 ? "" : "s"}`
        : `${state.selectedDay} · no sessions`;
    }
  }

  function renderHistoryList(store) {
    els.historyList.replaceChildren();
    const dayKey = state.selectedDay;
    const items = sessionsForDay(store.history, dayKey).slice().reverse();
    items.forEach((item) => {
      const li = document.createElement("li");
      const left = document.createElement("div");
      const right = document.createElement("strong");
      const done = item.completed ? "completed" : "stopped early";
      left.textContent = `${item.day} · ${item.typeLabel}`;
      right.textContent = item.isOpen
        ? `${item.minutes} min · open · ${done}`
        : `${item.minutes} min · ${done}`;
      li.append(left, right);
      els.historyList.append(li);
    });
    els.historyEmpty.hidden = items.length > 0 || store.history.length > 0;
    if (!items.length) {
      els.historyEmpty.hidden = false;
      els.historyEmpty.textContent = store.history.length
        ? "No sittings on this day."
        : "No sittings yet. Begin when you are ready.";
    } else {
      els.historyEmpty.hidden = true;
    }
  }

  function renderStats() {
    let store = loadStore();
    store = evaluateBadges(store);
    const history = store.history;
    const streak = computeStreak(history);
    const total = totalMinutes(history);
    const week = weekStats(history);
    const days = daysSat(history);
    els.stats.streak.textContent = days === 1 ? "1 day" : `${days} days`;
    if (els.stats.run) {
      els.stats.run.textContent = runText(streak);
      els.stats.run.hidden = !els.stats.run.textContent;
    }
    els.stats.total.textContent = `${total} min`;
    els.stats.count.textContent = String(history.length);
    els.hist.streak.textContent = els.stats.streak.textContent;
    els.hist.total.textContent = String(total);
    if (els.hist.weekMinutes) els.hist.weekMinutes.textContent = String(week.minutes);
    if (els.hist.weekSits) els.hist.weekSits.textContent = String(week.sits);
    renderGoals(store);
    renderBadges(store);
    renderCalendar(store);
    renderHistoryList(store);
  }

  function clearTimers() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    if (state.phaseId) {
      clearTimeout(state.phaseId);
      state.phaseId = null;
    }
  }

  function playEndBell() {
    if (state.muted || !state.bellArmed) return;
    state.bellArmed = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = playEndBell.ctx || new AudioCtx();
    playEndBell.ctx = ctx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const freqs = [528, 792, 1056];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(BELL_VOL / freqs.length, now + 0.03 + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.25);
    });
  }

  function applyBedAudio(src, { reset = false, play = false } = {}) {
    const current = els.soundscape.getAttribute("src") || "";
    const needsSwap = current !== src;
    if (needsSwap || reset) {
      els.soundscape.pause();
      if (needsSwap) {
        els.soundscape.src = src;
        els.soundscape.load();
      }
      if (reset) els.soundscape.currentTime = 0;
    }
    els.soundscape.loop = true;
    els.soundscape.muted = state.muted;
    updateSoundscapeVolume();
    if (play && state.musicEnabled) {
      const p = els.soundscape.play();
      if (p && typeof p.then === "function") {
        p.then(() => lazyCacheAudio(src)).catch(() => {});
      } else {
        lazyCacheAudio(src);
      }
    }
  }

  function applyModeAudio(type, { reset = false, play = false } = {}) {
    applyBedAudio(audioSrcFor(type), { reset, play });
  }

  function ensureAudioReady() {
    // Soft bed loads on Begin; keep src pointed at Soft default without forcing a network fetch.
    if (!els.soundscape.getAttribute("src")) {
      els.soundscape.src = AUDIO_BY_MODE.sit;
    }
  }

  function updateSoundscapeVolume() {
    // During the 1.6 s early fade, leave the level alone (no .volume reset, no setFade(1));
    // the next Begin cancels the fade and restores it here.
    const fe = engine();
    if (fe && fe.isFading && fe.isFading()) return;
    const t = fadeFactor();
    if (!state.musicEnabled || state.muted || state.isOpen || !state.sessionActive) {
      els.soundscape.volume = MUSIC_VOL;
    } else {
      els.soundscape.volume = MUSIC_VOL * t;
    }
    const e = engine();
    if (e) e.setFade(state.musicEnabled && !state.muted ? t : 0);
  }

  function stopSoundscapeFade() {
    els.soundscape.volume = MUSIC_VOL;
    const e = engine();
    if (e) e.setFade(state.musicEnabled && !state.muted ? 1 : 0);
  }

  function startAudioFromGesture(reset) {
    applyChosenSound({ reset: Boolean(reset), play: true });
  }

  function pauseAudio(reset) {
    els.soundscape.pause();
    if (reset) els.soundscape.currentTime = 0;
    const e = engine();
    if (e) e.stop();
  }

  function setPhase(index) {
    const type = TYPES[state.type];
    const phases = type.phases;
    const phase = phases[index % phases.length];
    state.phaseIndex = index % phases.length;
    els.phase.textContent = phase.name;
    document.body.classList.remove("phase-inhale", "phase-exhale", "phase-hold-in", "phase-hold-out");
    document.body.classList.add(`phase-${phase.id}`);
    document.body.classList.toggle("is-sit", state.type === "sit");
    document.body.classList.toggle("is-box", state.type === "box");
    document.body.classList.toggle("is-wind", state.type === "wind");
    return phase;
  }

  function schedulePhases() {
    if (state.phaseId) clearTimeout(state.phaseId);
    const phase = setPhase(state.phaseIndex);
    state.phaseId = setTimeout(() => {
      if (state.status !== "running") return;
      state.phaseIndex += 1;
      schedulePhases();
    }, phase.seconds * 1000);
  }

  function renderTimerNow() {
    if (state.isOpen) els.timer.textContent = formatTime(state.elapsed);
    else els.timer.textContent = formatTime(state.remaining);
  }

  function announceTime() {
    if (state.isOpen) els.timerLive.textContent = `Elapsed ${formatTime(state.elapsed)}`;
    else els.timerLive.textContent = `${formatTime(state.remaining)} remaining`;
  }

  function tick() {
    state.elapsed += 1;
    if (state.isOpen) {
      renderTimerNow();
      if (state.elapsed % 30 === 0) announceTime();
      return;
    }
    state.remaining = Math.max(0, state.remaining - 1);
    updateSoundscapeVolume();
    renderTimerNow();
    if (state.remaining === 0) {
      if (state.status === "running") completeSession(true);
      return;
    }
    if (state.remaining % 30 === 0) announceTime();
  }

  function startTicking() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(tick, 1000);
  }

  function beginSession() {
    const { minutes, isOpen } = selectedDuration();
    const meta = durationKindMeta();
    state.type = selectedType();
    state.durationMinutes = minutes;
    state.isOpen = isOpen;
    state.sessionMeta = meta;
    state.elapsed = 0;
    state.remaining = isOpen ? 0 : minutes * 60;
    state.phaseIndex = 0;
    state.status = "running";
    state.hiddenWhileRunning = false;
    state.sessionActive = true;
    state.bellArmed = true;
    resetStopConfirm();
    keepButton(); // reserve its space (visibility:hidden) so Stop doesn't shift when it arms
    const eng = engine();
    if (eng && eng.cancelFade) eng.cancelFade();
    pushSitState();
    track("session_start", {
      mode: state.type,
      duration_kind: meta.duration_kind,
      duration_min: meta.duration_min
    });
    document.body.classList.add("is-running");
    els.kicker.textContent = TYPES[state.type].label;
    els.hint.textContent = TYPES[state.type].hint;
    els.pause.textContent = "Pause";
    els.pause.setAttribute("aria-pressed", "false");
    renderTimerNow();
    announceTime();
    setView("session");
    setPhase(0);
    schedulePhases();
    startAudioFromGesture(true);
    startTicking();
    requestWakeLock();
  }

  function pauseSession() {
    if (state.status !== "running") return;
    state.status = "paused";
    clearTimers();
    stopSoundscapeFade();
    pauseAudio(false);
    releaseWakeLock();
    document.body.classList.remove("is-running");
    els.pause.textContent = "Resume";
    els.pause.setAttribute("aria-pressed", "true");
    els.phase.textContent = "Paused";
  }

  function resumeSession() {
    if (state.status !== "paused") return;
    state.status = "running";
    document.body.classList.add("is-running");
    els.pause.textContent = "Pause";
    els.pause.setAttribute("aria-pressed", "false");
    renderTimerNow();
    schedulePhases();
    startAudioFromGesture(false);
    updateSoundscapeVolume();
    startTicking();
    requestWakeLock();
  }

  function resetToConfiguredTime() {
    renderConfiguredTime();
    els.phase.textContent = "Settle";
    els.hint.textContent = "Follow the light";
  }

  // Early end: fade every active layer (Sound Design: tau 0.30 s, stop at +1.6 s). Muted: no fade.
  // Starts from the current level: no stopSoundscapeFade() here, or an early end inside the
  // natural 30 s fade swells ~8 dB first. Callers clear the timers; the next Begin restores
  // .volume and setFade(1) via updateSoundscapeVolume().
  function endAudioEarly() {
    const e = engine();
    if (e && e.fadeOutEarly) {
      e.fadeOutEarly(els.soundscape, { muted: state.muted || !state.musicEnabled });
    } else {
      pauseAudio(true);
    }
  }

  function stopSession() {
    if (state.status !== "running" && state.status !== "paused") return;
    resetStopConfirm();
    popSitState();
    const elapsed = state.elapsed;
    // Open sits lasting ≥15s end via complete path (completed:true); the bed fades, no hard cut.
    if (state.isOpen && elapsed >= MIN_LOG_SECONDS) {
      completeSession(true, { userStop: true });
      return;
    }
    clearTimers();
    state.sessionActive = false;
    endAudioEarly();
    releaseWakeLock();
    document.body.classList.remove(
      "is-running", "is-sit", "is-box", "is-wind",
      "phase-inhale", "phase-exhale", "phase-hold-in", "phase-hold-out"
    );
    state.status = "idle";
    setView("home");
    resetToConfiguredTime();
    // Timed early stop: logged as stopped early; it still counts toward days sat. Short sits discard.
    if (!state.isOpen && elapsed >= MIN_LOG_SECONDS) logSession(false, elapsed);
    renderStats();
    els.begin.focus();
  }

  // Inline two-tap Stop: "End sit?" + "Keep sitting", reverts after 4 s. No dialog.
  function stopConfirmOpen() {
    return els.stop.dataset.confirm === "1";
  }

  function announce(text) {
    const live = liveRegion();
    live.textContent = "";
    window.setTimeout(() => { live.textContent = text; }, 30);
  }

  function liveRegion() {
    let live = document.getElementById("status-live");
    if (!live) {
      live = document.createElement("p");
      live.id = "status-live";
      live.className = "sr-only";
      live.setAttribute("role", "status");
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      document.body.append(live);
    }
    return live;
  }

  function keepButton() {
    let keep = document.getElementById("keep-btn");
    if (!keep) {
      keep = document.createElement("button");
      keep.type = "button";
      keep.id = "keep-btn";
      keep.className = "ghost-btn keep-btn";
      keep.textContent = "Keep sitting";
      keep.hidden = true;
      keep.addEventListener("click", () => {
        resetStopConfirm();
        els.stop.focus();
        announce("Still sitting.");
      });
      els.stop.after(keep);
    }
    return keep;
  }

  function resetStopConfirm() {
    if (state.confirmTimer) {
      clearTimeout(state.confirmTimer);
      state.confirmTimer = null;
    }
    if (!els.stop) return;
    const wasOpen = stopConfirmOpen();
    delete els.stop.dataset.confirm;
    els.stop.textContent = "Stop";
    delete els.stop.dataset.armed;
    const keep = document.getElementById("keep-btn");
    if (keep) {
      if (wasOpen && document.activeElement === keep) els.stop.focus();
      keep.hidden = true;
    }
  }

  function requestStop() {
    if (state.status !== "running" && state.status !== "paused") return;
    if (stopConfirmOpen() || state.elapsed < MIN_LOG_SECONDS) {
      stopSession();
      return;
    }
    els.stop.dataset.confirm = "1";
    els.stop.textContent = "End sit?";
    els.stop.dataset.armed = "true";
    keepButton().hidden = false;
    announce("End sit? Tap again to end, or Keep sitting.");
    state.confirmTimer = window.setTimeout(resetStopConfirm, CONFIRM_MS);
  }

  // Back mid-sit shows the same inline confirm (founder default). One history entry per sit.
  function pushSitState() {
    if (state.sitHistory || !window.history || !history.pushState) return;
    try {
      history.pushState({ stillpointSit: true }, "");
      state.sitHistory = true;
    } catch {}
  }

  function popSitState() {
    if (!state.sitHistory) return;
    state.sitHistory = false;
    if (history.state && history.state.stillpointSit) {
      state.ignorePop = true;
      history.back();
    }
  }

  function onPopState() {
    if (state.ignorePop) {
      state.ignorePop = false;
      return;
    }
    if (!state.sitHistory) return;
    state.sitHistory = false;
    if (state.status !== "running" && state.status !== "paused") return;
    if (stopConfirmOpen() || state.elapsed < MIN_LOG_SECONDS) {
      stopSession();
      return;
    }
    pushSitState();
    requestStop();
    els.stop.focus();
  }

  // Tab close / reload mid-sit: log the partial sit silently (no beforeunload).
  function onPageHide() {
    releaseWakeLock();
    if (state.status !== "running" && state.status !== "paused") return;
    const elapsed = state.elapsed;
    if (elapsed >= MIN_LOG_SECONDS) logSession(state.isOpen, elapsed);
    clearTimers();
    resetStopConfirm();
    state.sessionActive = false;
    state.sitHistory = false;
    pauseAudio(true);
    document.body.classList.remove(
      "is-running", "is-sit", "is-box", "is-wind",
      "phase-inhale", "phase-exhale", "phase-hold-in", "phase-hold-out"
    );
    state.status = "idle";
    setView("home");
    resetToConfiguredTime();
    renderStats();
  }

  // SC 4.1.3: move focus to the completion title and announce it politely.
  function announceComplete() {
    const title = els.complete.title;
    if (!title) return;
    title.setAttribute("tabindex", "-1");
    title.focus({ preventScroll: false });
    const text = [title.textContent, els.complete.meta.textContent, els.complete.streak.textContent]
      .filter(Boolean).join(". ");
    announce(text);
  }

  function logSession(completed, elapsedSeconds, natural) {
    const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const store = loadStore();
    store.history.push({
      day: todayKey(),
      type: state.type,
      typeLabel: TYPES[state.type].label,
      minutes: state.isOpen ? Math.max(1, Math.round(elapsedSeconds / 60)) : (completed ? state.durationMinutes : minutes),
      completed,
      isOpen: state.isOpen,
      at: Date.now()
    });
    const meta = state.sessionMeta || durationKindMeta();
    track("session_end", {
      outcome: completed ? "completed" : "abandoned",
      mode: state.type,
      duration_kind: meta.duration_kind,
      duration_min: meta.duration_min,
      elapsed_sec: Math.max(0, Math.floor(elapsedSeconds)),
      natural: Boolean(natural)
    });
    let next = saveStore({ history: store.history });
    next = evaluateBadges(next);
    return next;
  }

  function completeSession(natural, { userStop = false } = {}) {
    if (state.status !== "running" && state.status !== "paused") return;
    const elapsed = state.elapsed;
    resetStopConfirm();
    if (!userStop) popSitState();
    clearTimers();
    state.sessionActive = false;
    if (userStop) {
      endAudioEarly();
    } else {
      stopSoundscapeFade();
      pauseAudio(true);
    }
    releaseWakeLock();
    state.status = "complete";
    document.body.classList.remove("is-running");
    if (natural) playEndBell();
    const minutes = state.isOpen
      ? Math.max(1, Math.round(elapsed / 60) || (elapsed > 0 ? 1 : 0))
      : state.durationMinutes;
    if (elapsed >= MIN_LOG_SECONDS || natural) {
      logSession(true, Math.max(elapsed, state.isOpen ? elapsed : state.durationMinutes * 60), natural);
    }
    const store = loadStore();
    const streak = computeStreak(store.history);
    els.complete.title.textContent = natural ? "Well held." : "A pause, then rest.";
    els.complete.meta.textContent = `${minutes} min \u00b7 ${TYPES[state.type].label}`;
    els.complete.streak.textContent = streak >= 2
      ? `${runText(streak)} \u00b7 ${totalMinutes(store.history)} minutes all told.`
      : (store.history.length > 1
        ? `${totalMinutes(store.history)} minutes all told.`
        : "The first sitting is the one that matters.");
    setView("complete");
    renderStats();
    announceComplete();
  }

  function goHome() {
    state.status = "idle";
    document.body.classList.remove(
      "is-running", "is-sit", "is-box", "is-wind", "is-complete",
      "phase-inhale", "phase-exhale", "phase-hold-in", "phase-hold-out"
    );
    setView("home");
    resetToConfiguredTime();
  }

  function toggleMusic() {
    state.musicEnabled = !state.musicEnabled;
    saveStore({ musicEnabled: state.musicEnabled });
    syncMusicButtons();
    if (!state.musicEnabled) {
      const e = engine();
      if (!(e && e.isFading && e.isFading())) pauseAudio(false); // let the early fade finish
      return;
    }
    if (state.sessionActive) {
      startAudioFromGesture(false);
      updateSoundscapeVolume();
    }
  }

  function toggleMute() {
    state.muted = !state.muted;
    saveStore({ muted: state.muted });
    syncMusicButtons();
    updateSoundscapeVolume();
  }

  function openHistory() {
    renderStats();
    els.historySheet.hidden = false;
    els.historyBtn.setAttribute("aria-expanded", "true");
    els.historyClose.focus();
  }

  function closeHistory() {
    els.historySheet.hidden = true;
    els.historyBtn.setAttribute("aria-expanded", "false");
    els.historyBtn.focus();
  }

  function onVisibility() {
    if (document.hidden) {
      if (state.status === "running") {
        state.hiddenWhileRunning = true;
        pauseSession();
      }
      return;
    }
    if (state.hiddenWhileRunning && state.status === "paused") {
      state.hiddenWhileRunning = false;
      resumeSession();
    }
    if (state.sessionActive && state.musicEnabled && !state.muted) {
      startAudioFromGesture(false);
    }
  }

  function onModeChange() {
    const type = selectedType();
    state.type = type;
    // Defer bed fetch until Begin; retarget Soft/mode or Nature/Beach src without forcing a fetch.
    if ((state.status === "idle" || state.status === "complete") && !isSynthKind(state.soundId)) {
      const src = soundscapeSrcFor(state.soundId, type);
      if ((els.soundscape.getAttribute("src") || "") !== src) {
        els.soundscape.src = src;
      }
    }
  }

  function bind() {
    els.begin.addEventListener("click", () => beginSession());
    els.pause.addEventListener("click", () => {
      if (state.status === "running") pauseSession();
      else if (state.status === "paused") resumeSession();
    });
    els.stop.addEventListener("click", () => requestStop());
    window.addEventListener("popstate", onPopState);
    els.audioBtn.addEventListener("click", toggleMusic);
    els.mute.addEventListener("click", toggleMute);
    els.home.addEventListener("click", goHome);
    els.historyBtn.addEventListener("click", openHistory);
    els.historyClose.addEventListener("click", closeHistory);
    els.historyBackdrop.addEventListener("click", closeHistory);
    document.querySelectorAll('input[name="duration"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (els.customMinutes.value) els.customMinutes.value = "";
        if (state.status === "idle") renderConfiguredTime();
      });
    });
    document.querySelectorAll('input[name="session-type"]').forEach((input) => {
      input.addEventListener("change", onModeChange);
    });
    document.querySelectorAll(".sound-chip-btn[data-sound]").forEach((btn) => {
      btn.addEventListener("click", () => setSound(btn.dataset.sound));
    });
    els.customMinutes.addEventListener("input", () => {
      if (state.status === "idle") renderConfiguredTime();
    });
    if (els.cal.prev) {
      els.cal.prev.addEventListener("click", () => {
        state.calMonth -= 1;
        if (state.calMonth < 0) {
          state.calMonth = 11;
          state.calYear -= 1;
        }
        renderStats();
      });
    }
    if (els.cal.next) {
      els.cal.next.addEventListener("click", () => {
        state.calMonth += 1;
        if (state.calMonth > 11) {
          state.calMonth = 0;
          state.calYear += 1;
        }
        renderStats();
      });
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.historySheet.hidden) {
        closeHistory();
        return;
      }
      const tag = (event.target && event.target.tagName) || "";
      if (["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(tag)) return;
      if (event.key === " " && state.status === "running") {
        event.preventDefault();
        pauseSession();
      } else if (event.key === " " && state.status === "paused") {
        event.preventDefault();
        resumeSession();
      }
    });
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.installEvent = event;
      state.iosA2hs = false;
      const tip = document.getElementById("a2hs-tip");
      if (tip) tip.hidden = true;
      els.install.hidden = false;
    });
    els.install.addEventListener("click", async () => {
      if (state.installEvent) {
        state.installEvent.prompt();
        await state.installEvent.userChoice.catch(() => {});
        state.installEvent = null;
        els.install.hidden = true;
        return;
      }
      if (state.iosA2hs) {
        const tip = document.getElementById("a2hs-tip");
        if (tip) {
          tip.hidden = false;
          tip.textContent = "On iPhone: tap Share, then Add to Home Screen.";
        }
      }
    });
    // iOS / no beforeinstallprompt: offer calm A2HS guidance instead of hiding Install forever.
    window.setTimeout(() => {
      if (state.installEvent) return;
      const standalone = window.matchMedia("(display-mode: standalone)").matches
        || navigator.standalone === true;
      if (standalone) return;
      const ua = navigator.userAgent || "";
      const ios = /iPad|iPhone|iPod/.test(ua)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (!ios) return;
      state.iosA2hs = true;
      els.install.hidden = false;
    }, 800);
  }

  function registerWorker() {
    if (typeof window.registerStillpointSW === "function") {
      window.registerStillpointSW();
    }
  }

  function init() {
    const store = loadStore();
    state.musicEnabled = store.musicEnabled;
    state.muted = store.muted;
    state.soundId = SOUND_KINDS.includes(store.soundId) ? store.soundId : "soft";
    state.type = selectedType();
    state.selectedDay = todayKey();
    ensureAudioReady();
    syncMusicButtons();
    syncSoundChoice();
    renderConfiguredTime();
    renderStats();
    bind();
    registerWorker();
    track("app_open", { app_version: CACHE_ID });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
