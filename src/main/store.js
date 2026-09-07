const { app } = require("electron");
const fs = require("fs");
const path = require("path");

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function defaults() {
  return {
    settings: {
      workMin: 25,
      breakMin: 5,
      waterMin: 45,
      standMin: 60,
      sound: true,
      autostart: false,
      aiKey: "",
      aiOn: false,
    },
    todos: [],
    pomodoro: {
      todayCount: 0,
      todayDate: todayStr(),
      mode: "work",
      label: "专注",
      presets: [
        { id: "focus", name: "专注", minutes: 25 },
        { id: "deep", name: "深度工作", minutes: 50 },
      ],
      remainingMs: 0,
      running: false,
    },
    reminders: {
      paused: false,
      items: [
        {
          id: "water",
          kind: "water",
          label: "喝水",
          minutes: 45,
          enabled: true,
          lastAt: 0,
        },
        {
          id: "stand",
          kind: "stand",
          label: "久坐起身",
          minutes: 60,
          enabled: true,
          lastAt: 0,
        },
      ],
    },
    intimacy: { seconds: 0 },
    windowPos: null,
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function merge(target, patch) {
  if (isPlainObject(target) && isPlainObject(patch)) {
    for (const k of Object.keys(patch)) {
      if (isPlainObject(patch[k]) && isPlainObject(target[k])) {
        merge(target[k], patch[k]);
      } else {
        target[k] = patch[k];
      }
    }
  }
  return target;
}

class Store {
  constructor() {
    this.file = path.join(app.getPath("userData"), "store.json");
    this.data = defaults();
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      merge(this.data, raw);
    } catch (_) {
      /* 首次启动或文件损坏：使用默认值 */
    }
  }

  get() {
    return this.data;
  }

  set(patch) {
    merge(this.data, patch);
    this.save();
    return this.data;
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      console.error("保存配置失败:", err);
    }
  }
}

module.exports = { Store, todayStr, defaults };
