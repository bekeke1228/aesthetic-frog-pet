const $ = (id) => document.getElementById(id);
const RING_C = 364.4;

let store = null;
let pomo = null;
let askHistory = [];
let lastAiMsg = null;

function renderAsks() {
  const list = $("askList");
  list.innerHTML = "";
  for (const item of askHistory) {
    const q = document.createElement("li");
    q.className = "msg user";
    q.textContent = item.q;
    const a = document.createElement("li");
    a.className = "msg frog";
    a.textContent = "🐸 " + item.a;
    list.append(q, a);
  }
  list.scrollTop = list.scrollHeight;
}

async function askFrog() {
  const input = $("askInput");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  const call = FROGBRAIN.callFor(store.intimacy.seconds || 0);
  const aiEnabled = !!(store.settings.aiOn && store.settings.aiKey);
  let source = "local";
  const a = await FROGBRAIN.smartAnswer(q, call, {
    aiKey: aiEnabled ? store.settings.aiKey : "",
    ask: (text, c) => api.ai.ask(text, c),
    weather: (city) => api.ai.weather(city),
    onSource: (s) => {
      source = s;
    },
    onAiError: (msg) => {
      lastAiMsg = `上次 AI 调用失败：${msg}`;
      renderAiStatus();
    },
    onWeatherError: (msg) => {
      lastAiMsg = `上次天气查询失败：${msg}`;
      renderAiStatus();
    },
  });
  const text = source === "local" && aiEnabled ? `${a}（本地）` : a;
  askHistory.push({ q, a: text });
  renderAsks();
  api.pet.talk(text);
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function setTodos(todos) {
  api.setStore({ todos });
}

function saveReminders(items) {
  api.setStore({ reminders: { items, paused: store.reminders.paused } });
}

function updateRem(id, patch) {
  saveReminders(
    store.reminders.items.map((x) => (x.id === id ? { ...x, ...patch } : x))
  );
}

function addReminder() {
  const label = $("remLabel").value.trim();
  if (!label) return;
  const minutes = clampInt($("remMinutes").value, 1, 600);
  saveReminders([
    ...store.reminders.items,
    {
      id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      kind: "custom",
      label: label.slice(0, 12),
      minutes,
      enabled: true,
      lastAt: 0,
    },
  ]);
  $("remLabel").value = "";
}

function savePresets(presets) {
  api.setStore({ pomodoro: { presets } });
}

function updatePreset(id, patch) {
  savePresets(
    store.pomodoro.presets.map((x) => (x.id === id ? { ...x, ...patch } : x))
  );
}

function addPreset() {
  const name = $("preName").value.trim();
  const minutes = clampInt($("preMinutes").value, 1, 600);
  savePresets([
    ...store.pomodoro.presets,
    {
      id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: (name || "专注").slice(0, 8),
      minutes,
    },
  ]);
  $("preName").value = "";
}

function renderPresets() {
  const list = $("presetList");
  list.innerHTML = "";
  for (const pr of store.pomodoro.presets || []) {
    const row = document.createElement("div");
    row.className = "pre-row";

    const go = document.createElement("button");
    go.className = "pre-go";
    go.textContent = "▶";
    go.title = `开始「${pr.name}」${pr.minutes} 分钟`;
    go.addEventListener("click", () => api.pomodoro.start(pr.minutes, pr.name));

    const name = document.createElement("input");
    name.type = "text";
    name.className = "pre-name";
    name.value = pr.name;
    name.maxLength = 8;
    name.title = "重命名";
    name.addEventListener("change", () => {
      const v = name.value.trim();
      if (v) updatePreset(pr.id, { name: v.slice(0, 8) });
      else name.value = pr.name;
    });

    const min = document.createElement("input");
    min.type = "number";
    min.className = "pre-min";
    min.min = "1";
    min.max = "180";
    min.value = pr.minutes;
    min.title = "时长（分钟）";
    min.addEventListener("change", () => {
      updatePreset(pr.id, { minutes: clampInt(min.value, 1, 600) });
    });

    const unit = document.createElement("span");
    unit.className = "rem-unit";
    unit.textContent = "分钟";

    const del = document.createElement("button");
    del.className = "rem-del";
    del.textContent = "删";
    del.title = "删除预设";
    del.addEventListener("click", () => {
      savePresets(store.pomodoro.presets.filter((x) => x.id !== pr.id));
    });

    row.append(go, name, min, unit, del);
    list.appendChild(row);
  }
}

function renderReminders() {
  const list = $("reminderList");
  list.innerHTML = "";
  for (const it of store.reminders.items || []) {
    const row = document.createElement("div");
    row.className = "rem-row";

    const en = document.createElement("input");
    en.type = "checkbox";
    en.className = "rem-en";
    en.checked = it.enabled;
    en.title = "启用/停用";
    en.addEventListener("change", () => {
      updateRem(it.id, { enabled: en.checked, lastAt: 0 });
    });

    const label = document.createElement("input");
    label.type = "text";
    label.className = "rem-label-input";
    label.value = it.label;
    label.maxLength = 12;
    label.title = "重命名";
    label.addEventListener("change", () => {
      const v = label.value.trim();
      if (v) updateRem(it.id, { label: v.slice(0, 12) });
      else label.value = it.label;
    });

    const min = document.createElement("input");
    min.type = "number";
    min.className = "rem-min";
    min.min = "1";
    min.max = "240";
    min.value = it.minutes;
    min.title = "间隔分钟";
    min.addEventListener("change", () => {
      updateRem(it.id, { minutes: clampInt(min.value, 1, 600), lastAt: 0 });
    });

    const unit = document.createElement("span");
    unit.className = "rem-unit";
    unit.textContent = "分钟";

    const del = document.createElement("button");
    del.className = "rem-del";
    del.textContent = "删";
    del.title = "删除";
    del.addEventListener("click", () => {
      saveReminders(store.reminders.items.filter((x) => x.id !== it.id));
    });

    row.append(en, label, min, unit, del);
    list.appendChild(row);
  }
}

function renderAiStatus() {
  const el = $("aiStatus");
  if (!el || !store) return;
  if (lastAiMsg) {
    el.textContent = lastAiMsg;
    return;
  }
  const provider = store.settings.aiProvider || "openai";
  const names = { openai: "OpenAI", deepseek: "DeepSeek", custom: "自定义" };
  const models = { openai: "gpt-4o-mini", deepseek: "deepseek-chat", custom: "自定义模型" };
  const bases = { openai: "api.openai.com", deepseek: "api.deepseek.com", custom: "自定义地址" };
  const model = store.settings.aiModel || models[provider] || "";
  const base = store.settings.aiBaseUrl || bases[provider] || "";
  el.textContent =
    `当前：${names[provider] || provider} · ${model} · ${base} · ` +
    `Key${store.settings.aiKey ? "已填" : "未填"} · ${store.settings.aiOn ? "已开启" : "未开启"}` +
    (store.settings.weatherCity ? ` · 默认城市 ${store.settings.weatherCity}` : "");
}

function renderTodos() {
  const list = $("todoList");
  list.innerHTML = "";
  for (const t of store.todos) {
    const li = document.createElement("li");
    li.className = t.done ? "done" : "";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!t.done;
    cb.addEventListener("change", () =>
      setTodos(store.todos.map((x) => (x.id === t.id ? { ...x, done: cb.checked } : x)))
    );
    const span = document.createElement("span");
    span.textContent = t.text;
    const del = document.createElement("button");
    del.textContent = "删";
    del.className = "del";
    del.addEventListener("click", () => setTodos(store.todos.filter((x) => x.id !== t.id)));
    li.append(cb, span, del);
    list.appendChild(li);
  }
}

function syncInput(id, value) {
  const el = $(id);
  if (el && String(el.value) !== String(value)) el.value = value;
}

function render() {
  if (!store) return;
  syncInput("breakMin", store.settings.breakMin);
  $("soundOn").checked = store.settings.sound;
  $("autostart").checked = store.settings.autostart;
  syncInput("aiKey", store.settings.aiKey || "");
  $("aiOn").checked = !!store.settings.aiOn;
  const provider = store.settings.aiProvider || "openai";
  $("aiProvider").value = provider;
  syncInput("aiBaseUrl", store.settings.aiBaseUrl || "");
  syncInput("aiModel", store.settings.aiModel || "");
  syncInput("weatherCity", store.settings.weatherCity || "");
  const defaults = {
    openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    custom: { base: "https://your-endpoint/v1", model: "your-model" },
  };
  const d = defaults[provider] || defaults.custom;
  $("aiBaseUrl").placeholder = `接口地址，如 ${d.base}`;
  $("aiModel").placeholder = `模型，如 ${d.model}`;
  $("remindPause").checked = store.reminders.paused;
  const iv = $("intimacyVal");
  if (iv && store.intimacy) {
    iv.textContent = FROGBRAIN.intimacyText(store.intimacy.seconds || 0);
  }
  renderReminders();
  renderPresets();
  renderTodos();
  renderAiStatus();
}

function renderPomo() {
  if (!pomo) return;
  const total = (pomo.mode === "work" ? pomo.workMin : pomo.breakMin) * 60000;
  const progress = total > 0 ? Math.min(1, Math.max(0, pomo.remainingMs / total)) : 0;
  const fg = $("pomoRingFg");
  if (fg) fg.style.strokeDashoffset = String(RING_C * (1 - progress));
  const mm = String(Math.floor(pomo.remainingMs / 60000)).padStart(2, "0");
  const ss = String(Math.floor((pomo.remainingMs % 60000) / 1000)).padStart(2, "0");
  $("pomoTime").textContent = `${mm}:${ss}`;
  const label = pomo.label || "专注";
  $("pomoMode").textContent = pomo.running
    ? pomo.mode === "work"
      ? `${label} · 工作中`
      : "休息中"
    : pomo.remainingMs > 0
      ? `${label} · 已暂停`
      : "未开始";
  $("pomoToggle").textContent = pomo.running ? "暂停" : pomo.remainingMs > 0 ? "继续" : "开始";
  $("pomoCount").textContent = String(pomo.todayCount);
}

function addTodo() {
  const input = $("todoInput");
  const text = input.value.trim();
  if (!text) return;
  setTodos([
    ...store.todos,
    {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      done: false,
      createdAt: Date.now(),
    },
  ]);
  input.value = "";
}

$("closeBtn").addEventListener("click", () => api.panel.close());
$("pomoToggle").addEventListener("click", () => {
  if (pomo.running) api.pomodoro.pause();
  else {
    const p0 = (store.pomodoro.presets && store.pomodoro.presets[0]) || {};
    api.pomodoro.start(p0.minutes, p0.name);
  }
});
$("pomoSkip").addEventListener("click", () => api.pomodoro.skip());
$("todoAdd").addEventListener("click", addTodo);
$("todoInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTodo();
});
$("todoClear").addEventListener("click", () => setTodos(store.todos.filter((t) => !t.done)));
$("askBtn").addEventListener("click", askFrog);
$("askInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") askFrog();
});
$("askClear").addEventListener("click", () => {
  askHistory = [];
  renderAsks();
});
$("soundOn").addEventListener("change", (e) => api.setStore({ settings: { sound: e.target.checked } }));
$("autostart").addEventListener("change", (e) =>
  api.setStore({ settings: { autostart: e.target.checked } })
);
$("aiKey").addEventListener("change", (e) => {
  const v = e.target.value.trim();
  api.setStore({ settings: { aiKey: v, aiOn: v ? true : false } });
});
$("aiOn").addEventListener("change", (e) =>
  api.setStore({ settings: { aiOn: e.target.checked } })
);
$("aiProvider").addEventListener("change", (e) =>
  api.setStore({
    settings: { aiProvider: e.target.value, aiBaseUrl: "", aiModel: "" },
  })
);
$("aiBaseUrl").addEventListener("change", (e) =>
  api.setStore({ settings: { aiBaseUrl: e.target.value.trim() } })
);
$("aiModel").addEventListener("change", (e) =>
  api.setStore({ settings: { aiModel: e.target.value.trim() } })
);
$("weatherCity").addEventListener("change", (e) =>
  api.setStore({ settings: { weatherCity: e.target.value.trim().slice(0, 12) } })
);
$("weatherTest").addEventListener("click", async () => {
  const el = $("aiStatus");
  if (el) el.textContent = "正在查询天气…";
  const r = await api.ai.weather(store.settings.weatherCity || "");
  if (el) {
    el.textContent = r && r.ok
      ? `天气查询成功：${r.text}`
      : `天气查询失败：${(r && r.error) || "未知错误"}`;
  }
});
$("aiTest").addEventListener("click", async () => {
  const el = $("aiStatus");
  if (el) el.textContent = "正在测试连接…";
  const r = await api.ai.test();
  if (el) {
    el.textContent = r && r.ok
      ? `连接成功：${String(r.text || "").slice(0, 30)}`
      : `连接失败：${(r && r.error) || "未知错误"}`;
  }
});
$("remindPause").addEventListener("change", (e) => {
  store.reminders.paused = e.target.checked;
  api.reminders.pause(e.target.checked);
});
$("breakMin").addEventListener("change", (e) =>
  api.setStore({ settings: { breakMin: clampInt(e.target.value, 1, 60) } })
);
$("preAdd").addEventListener("click", addPreset);
$("preName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addPreset();
});
$("preMinutes").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addPreset();
});
$("remAdd").addEventListener("click", addReminder);
$("remLabel").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addReminder();
});
$("remMinutes").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addReminder();
});

async function init() {
  store = await api.getStore();
  pomo = await api.pomodoro.getState();
  render();
  renderPomo();
  api.on("store:update", (s) => {
    store = s;
    render();
  });
  api.on("pomodoro:update", (p) => {
    pomo = p;
    renderPomo();
  });
}

init();
