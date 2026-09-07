class Reminders {
  constructor(store, { onEvent }) {
    this.store = store;
    this.onEvent = onEvent;
    this.timer = null;
    this.normalize();
  }

  // 兼容旧版数据 / 补齐字段
  normalize() {
    const data = this.store.get();
    const r = data.reminders;
    if (!r) data.reminders = { paused: false, items: [] };
    if (!Array.isArray(data.reminders.items)) {
      const s = data.settings || {};
      data.reminders.items = [
        {
          id: "water",
          kind: "water",
          label: "喝水",
          minutes: s.waterMin || 45,
          enabled: true,
          lastAt: 0,
        },
        {
          id: "stand",
          kind: "stand",
          label: "久坐起身",
          minutes: s.standMin || 60,
          enabled: true,
          lastAt: 0,
        },
      ];
    }
    data.reminders.items = data.reminders.items.map((it) => ({
      id: String(it.id || `r${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      kind: it.kind || "custom",
      label: String(it.label || "提醒"),
      minutes: Math.max(1, Math.min(600, Number(it.minutes) || 45)),
      enabled: it.enabled !== false,
      lastAt: Number(it.lastAt) || 0,
    }));
    this.store.save();
  }

  start() {
    if (!this.timer) {
      this.timer = setInterval(() => this.check(), 20000);
    }
  }

  check() {
    const s = this.store.get();
    if (s.reminders.paused) return;
    const now = Date.now();
    let changed = false;
    for (const it of s.reminders.items) {
      if (!it.enabled) continue;
      if (!it.lastAt) {
        it.lastAt = now;
        changed = true;
        continue;
      }
      if (now - it.lastAt >= it.minutes * 60000) {
        it.lastAt = now;
        changed = true;
        this.onEvent(it);
      }
    }
    if (changed) this.store.save();
  }

  setPaused(v) {
    this.store.get().reminders.paused = !!v;
    this.store.save();
  }

  getState() {
    return { paused: this.store.get().reminders.paused };
  }
}

module.exports = Reminders;
