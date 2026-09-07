const { todayStr } = require("./store");

class Pomodoro {
  constructor(store, { onUpdate, onEvent }) {
    this.store = store;
    this.onUpdate = onUpdate;
    this.onEvent = onEvent;
    this.timer = null;
    this.normalizePresets();
    this.ensureToday();
  }

  normalizePresets() {
    const p = this.store.get().pomodoro;
    if (!p.presets || !p.presets.length) {
      const s = this.store.get().settings;
      p.presets = [
        {
          id: "focus",
          name: "专注",
          minutes: Math.max(1, Math.min(600, Number(s.workMin) || 25)),
        },
        { id: "deep", name: "深度工作", minutes: 50 },
      ];
    }
    p.presets = p.presets.map((x) => ({
      id: String(x.id || `p${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      name: String(x.name || "专注").slice(0, 10),
      minutes: Math.max(1, Math.min(600, Number(x.minutes) || 25)),
    }));
    if (!p.label) p.label = "专注";
    this.store.save();
  }

  durationMs(kind) {
    const s = this.store.get().settings;
    return (kind === "work" ? s.workMin : s.breakMin) * 60 * 1000;
  }

  ensureToday() {
    const p = this.store.get().pomodoro;
    if (p.todayDate !== todayStr()) {
      p.todayCount = 0;
      p.todayDate = todayStr();
      this.store.save();
    }
  }

  getState() {
    this.ensureToday();
    const p = this.store.get().pomodoro;
    const s = this.store.get().settings;
    return {
      mode: p.mode,
      label: p.label,
      remainingMs: p.remainingMs,
      running: p.running,
      todayCount: p.todayCount,
      workMin: s.workMin,
      breakMin: s.breakMin,
      presets: p.presets,
    };
  }

  // minutes: 工作分钟数（可选）；name：当前工作项目名（可选）
  start(minutes, name) {
    const p = this.store.get().pomodoro;
    if (p.running) return;
    if (p.remainingMs <= 0) {
      p.mode = "work";
      const m = Number(minutes);
      p.remainingMs = (m > 0 ? m : this.durationMs("work") / 60000) * 60000;
      if (name) p.label = String(name).slice(0, 10);
    }
    p.running = true;
    this.store.save();
    this.ensureTick();
    this.onEvent(p.mode === "work" ? "workStart" : "breakStart");
    this.onUpdate();
  }

  pause() {
    const p = this.store.get().pomodoro;
    if (!p.running) return;
    p.running = false;
    this.store.save();
    this.onUpdate();
  }

  skip() {
    const p = this.store.get().pomodoro;
    if (p.mode === "work") {
      p.mode = "break";
      p.remainingMs = this.durationMs("break");
      p.running = true;
      this.onEvent("breakStart");
    } else {
      p.mode = "work";
      p.remainingMs = 0;
      p.running = false;
      const first = (p.presets && p.presets[0]) || { name: "专注" };
      p.label = first.name;
      this.onEvent("workIdle");
    }
    this.store.save();
    this.ensureTick();
    this.onUpdate();
  }

  tick() {
    const p = this.store.get().pomodoro;
    if (!p.running) return;
    p.remainingMs -= 1000;
    if (p.remainingMs <= 0) {
      this.completePhase();
      return;
    }
    this.store.save();
    this.onUpdate();
  }

  completePhase() {
    const p = this.store.get().pomodoro;
    this.ensureToday();
    if (p.mode === "work") {
      p.todayCount += 1;
      p.mode = "break";
      p.remainingMs = this.durationMs("break");
      p.running = true;
      this.onEvent("workDone");
    } else {
      p.mode = "work";
      p.remainingMs = 0;
      p.running = false;
      const first = (p.presets && p.presets[0]) || { name: "专注" };
      p.label = first.name;
      this.onEvent("breakDone");
    }
    this.store.save();
    this.onUpdate();
  }

  ensureTick() {
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 1000);
    }
  }
}

module.exports = Pomodoro;
