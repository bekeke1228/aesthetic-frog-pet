const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  screen,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");

const { Store } = require("./store");
const Pomodoro = require("./pomodoro");
const Reminders = require("./reminders");
const Intimacy = require("./intimacy");
const { buildMenuTemplate } = require("./tray");

const ROOT = path.join(__dirname, "..", "..");
const ASSETS = path.join(ROOT, "assets");
const PET_SIZE = { width: 380, height: 220 };
const PANEL_SIZE = { width: 380, height: 680 };

let store;
let pomodoro;
let reminders;
let intimacy;
let petWin = null;
let panelWin = null;
let tray = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (petWin && !petWin.isDestroyed()) {
      petWin.show();
      petWin.focus();
    }
  });
}

app.setAppUserModelId("com.aesthetic.frog.pet");

function fileUrl(p) {
  return pathToFileURL(path.resolve(p)).href;
}

function broadcast(channel, payload) {
  for (const win of [petWin, panelWin]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function sendPet(type, extra = {}) {
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send("pet:event", { type, ...extra });
  }
}

function notify(title, body) {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: true });
    n.on("click", () => openPanel());
    n.show();
  }
}

const NOTIFY_MAP = {
  water: ["喝水提醒", "起来喝口水，别学我当干蛙。"],
  stand: ["久坐提醒", "坐太久啦，起来扭两下。"],
  workDone: ["番茄完成", "又搞定一个番茄，休息一下吧！"],
  breakDone: ["休息结束", "摸完鱼了，该回去干活啦。"],
};

function defaultPetPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - PET_SIZE.width - 10,
    y: wa.y + wa.height - PET_SIZE.height - 10,
  };
}

function applyPetPos() {
  const saved = store.get().windowPos;
  const displays = screen.getAllDisplays();
  const ok =
    saved &&
    displays.some((d) => {
      const a = d.workArea;
      return (
        saved.x >= a.x - 60 &&
        saved.y >= a.y - 60 &&
        saved.x <= a.x + a.width - 40 &&
        saved.y <= a.y + a.height - 40
      );
    });
  const p = ok ? saved : defaultPetPos();
  petWin.setPosition(Math.round(p.x), Math.round(p.y));
}

function saveWindowPos() {
  if (!petWin || petWin.isDestroyed()) return;
  const [x, y] = petWin.getPosition();
  store.set({ windowPos: { x, y } });
}

function createPetWindow() {
  petWin = new BrowserWindow({
    ...PET_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWin.setAlwaysOnTop(true, "screen-saver");
  petWin.loadFile(path.join(__dirname, "..", "renderer", "pet", "index.html"));
  petWin.once("ready-to-show", () => {
    console.log("PET_READY_TO_SHOW");
    applyPetPos();
    petWin.show();
  });
  petWin.webContents.once("did-finish-load", () => {
    console.log("PET_DID_FINISH_LOAD");
    applyPetPos();
    petWin.show();
  });
  // 兜底：无论加载是否完成，2 秒后强制显示
  setTimeout(() => {
    if (petWin && !petWin.isDestroyed() && !petWin.isVisible()) {
      console.log("PET_FORCE_SHOW");
      petWin.show();
    }
  }, 2000);
  petWin.on("moved", saveWindowPos);
  petWin.on("closed", () => {
    petWin = null;
    if (process.platform !== "darwin") app.quit();
  });
}

function createPanelWindow() {
  panelWin = new BrowserWindow({
    ...PANEL_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWin.loadFile(path.join(__dirname, "..", "renderer", "panel", "index.html"));
  panelWin.on("blur", () => {
    if (panelWin && !panelWin.isDestroyed()) panelWin.hide();
  });
  panelWin.on("closed", () => {
    panelWin = null;
  });
}

function openPanel() {
  if (!panelWin || panelWin.isDestroyed()) createPanelWindow();
  const [pw] = panelWin.getSize();
  const [px, py] = petWin ? petWin.getPosition() : defaultPetPos();
  const wa = screen.getDisplayNearestPoint({ x: px, y: py }).workArea;
  let x = px - pw - 12;
  if (x < wa.x) x = px + PET_SIZE.width + 12;
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - pw));
  const y = Math.max(wa.y, Math.min(py, wa.y + wa.height - PANEL_SIZE.height));
  panelWin.setPosition(Math.round(x), Math.round(y));
  panelWin.show();
  panelWin.focus();
}

function closePanel() {
  if (panelWin && !panelWin.isDestroyed()) panelWin.hide();
}

function setClickThrough(ignore) {
  if (!petWin || petWin.isDestroyed()) return;
  if (petWin.clickThroughState !== ignore) {
    petWin.clickThroughState = ignore;
    petWin.setIgnoreMouseEvents(ignore, { forward: true });
  }
}

// ---- 开机自启（自写注册表，保证命令行带上正确的应用路径）----
const AUTOSTART_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const AUTOSTART_NAME = "AestheticFrogPet";

function autostartCommand() {
  // 打包版：直接运行自身 exe；开发版：需要把项目目录作为参数传给 electron
  return app.isPackaged
    ? `"${process.execPath}"`
    : `"${process.execPath}" "${ROOT}"`;
}

function applyAutostart(enabled) {
  if (process.platform !== "win32") {
    try {
      app.setLoginItemSettings({ openAtLogin: !!enabled });
    } catch (_) {
      /* 忽略 */
    }
    return;
  }
  try {
    if (enabled) {
      execFileSync(
        "reg",
        [
          "add",
          AUTOSTART_KEY,
          "/v",
          AUTOSTART_NAME,
          "/t",
          "REG_SZ",
          "/d",
          autostartCommand(),
          "/f",
        ],
        { windowsHide: true }
      );
      // 清理早期错误写法留下的条目（会导致开机只弹出空白 Electron 页面）
      for (const legacy of ["aesthetic-frog-pet", "electron"]) {
        try {
          execFileSync(
            "reg",
            ["delete", AUTOSTART_KEY, "/v", legacy, "/f"],
            { windowsHide: true, stdio: "ignore" }
          );
        } catch (_) {
          /* 没有该条目 */
        }
      }
    } else {
      try {
        execFileSync(
          "reg",
          ["delete", AUTOSTART_KEY, "/v", AUTOSTART_NAME, "/f"],
          { windowsHide: true, stdio: "ignore" }
        );
      } catch (_) {
        /* 没有该条目 */
      }
      for (const legacy of ["aesthetic-frog-pet", "electron"]) {
        try {
          execFileSync(
            "reg",
            ["delete", AUTOSTART_KEY, "/v", legacy, "/f"],
            { windowsHide: true, stdio: "ignore" }
          );
        } catch (_) {
          /* 没有该条目 */
        }
      }
    }
  } catch (err) {
    console.error("设置开机自启失败:", err.message);
  }
}

function autostartRegistryEntry() {
  if (process.platform !== "win32") return "";
  try {
    const out = execFileSync(
      "reg",
      ["query", AUTOSTART_KEY, "/v", AUTOSTART_NAME],
      { windowsHide: true }
    ).toString();
    const m = out.match(/REG_SZ\s+(.+)\s*$/m);
    return m ? m[1].trim() : "";
  } catch (_) {
    return "";
  }
}

const WMO = {
  0: "晴",
  1: "基本晴",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "毛毛雨",
  53: "小雨",
  55: "中雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "强阵雨",
  82: "暴雨",
  95: "雷雨",
  96: "雷雨伴冰雹",
  99: "强雷雨冰雹",
};

const AI_PROVIDERS = {
  openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
};

function resolveAi() {
  const s = store.get().settings;
  const provider = s.aiProvider || "openai";
  const preset = AI_PROVIDERS[provider] || {};
  return {
    provider,
    base: String(s.aiBaseUrl || preset.base || "").replace(/\/+$/, ""),
    model: String(s.aiModel || preset.model || "gpt-4o-mini"),
    key: String(s.aiKey || ""),
    enabled: !!s.aiOn && !!s.aiKey && !!(s.aiBaseUrl || preset.base),
  };
}

async function aiAsk(q, call, maxTokens) {
  const cfg = resolveAi();
  if (!cfg.enabled) return { ok: false, error: "未启用 AI 或缺少 API Key" };
  const key = cfg.key;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          {
            role: "system",
            content:
              `你是「审美吉蛙」，一只从蛙星来到地球的外星青蛙桌宠。` +
              `性格：躺平但不消极、吐槽但不伤人、嘴硬心软。叫用户「${call}」。` +
              `回答简短（不超过 80 字）、有趣，带一点毒舌和温柔。` +
              `如果用户问正经问题（学习、工作、常识等），认真给出靠谱简明的答案。`,
          },
          { role: "user", content: q },
        ],
        max_tokens: maxTokens || 200,
        temperature: 0.9,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch (_) {
        /* 忽略 */
      }
      return {
        ok: false,
        error: `HTTP ${res.status}${detail ? " " + detail : ""}`,
      };
    }
    const data = await res.json();
    const text = (
      (data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content) ||
      ""
    ).trim();
    return text ? { ok: true, text } : { ok: false, error: "返回内容为空" };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: String((err && err.message) || err) };
  }
}

async function aiTest() {
  const r = await aiAsk("你好，请只回复：在呢", "人类", 16);
  return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
}

async function aiWeather(cityRaw) {
  let city = String(cityRaw || "").trim();
  if (!city) city = String(store.get().settings.weatherCity || "").trim();
  // 没有城市时用 IP 粗略定位兜底
  if (!city) {
    try {
      const ipRes = await fetch("https://ipapi.co/json/");
      const info = await ipRes.json();
      city = String((info && (info.city || info.region)) || "").trim();
    } catch (_) {
      city = "";
    }
  }
  if (!city) return { ok: false, error: "no-city" };
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city
      )}&count=1&language=zh`
    );
    const geo = await geoRes.json();
    const loc = geo && geo.results && geo.results[0];
    if (!loc) return { ok: false };
    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&timezone=auto`
    );
    const data = await wxRes.json();
    const cw = data && data.current_weather;
    if (!cw) return { ok: false };
    const desc = WMO[cw.weathercode] || "未知天气";
    const temp = Math.round(cw.temperature);
    return {
      ok: true,
      text: `${loc.name}现在 ${temp}°C，${desc}。本蛙星气象台友情播报。`,
    };
  } catch (_) {
    return { ok: false };
  }
}

function buildActions() {
  return {
    getPomodoro: () => pomodoro.getState(),
    getReminders: () => reminders.getState(),
    petVisible: () => petWin && !petWin.isDestroyed() && petWin.isVisible(),
    togglePet: () => {
      if (!petWin || petWin.isDestroyed()) return;
      if (petWin.isVisible()) petWin.hide();
      else petWin.show();
    },
    togglePomodoro: () => {
      const s = pomodoro.getState();
      if (s.running) pomodoro.pause();
      else pomodoro.start();
    },
    skipPomodoro: () => pomodoro.skip(),
    toggleReminders: () => reminders.setPaused(!reminders.getState().paused),
    openPanel,
    toggleChat: () => sendPet("chatToggle"),
    quit: () => app.quit(),
  };
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(buildActions())));
}

function popupContextMenu() {
  const menu = Menu.buildFromTemplate(buildMenuTemplate(buildActions()));
  menu.popup({ window: petWin || undefined });
}

function createTray() {
  tray = new Tray(path.join(ASSETS, "tray.png"));
  tray.setToolTip("审美吉蛙桌宠 v3.6");
  refreshTrayMenu();
}

function registerIpc() {
  ipcMain.handle("store:get", () => store.get());
  ipcMain.handle("store:set", (_e, patch) => {
    store.set(patch);
    const data = store.get();
    if (patch.settings) {
      if ("autostart" in patch.settings) {
        applyAutostart(!!patch.settings.autostart);
      }
      if (
        !data.pomodoro.running &&
        ("workMin" in patch.settings || "breakMin" in patch.settings)
      ) {
        data.pomodoro.remainingMs = data.settings.workMin * 60 * 1000;
      }
      store.save();
    }
    broadcast("store:update", data);
    refreshTrayMenu();
    return data;
  });

  ipcMain.handle("manifest:get", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(ASSETS, "manifest.json"), "utf8")
    );
    const states = {};
    for (const [name, info] of Object.entries(raw.states)) {
      states[name] = {
        frames: info.frames.map((rel) => fileUrl(path.join(ROOT, rel))),
        fps: info.fps,
      };
    }
    return {
      frameSize: raw.frameSize,
      states,
      fallbackUrl: fileUrl(path.join(ASSETS, "fallback", "frog.svg")),
      sounds: {
        reminder: fileUrl(path.join(ASSETS, "sounds", "reminder.wav")),
        done: fileUrl(path.join(ASSETS, "sounds", "done.wav")),
        pop: fileUrl(path.join(ASSETS, "sounds", "pop.wav")),
      },
    };
  });

  ipcMain.handle("pomodoro:start", (_e, minutes, name) =>
    pomodoro.start(minutes, name)
  );
  ipcMain.handle("pomodoro:pause", () => pomodoro.pause());
  ipcMain.handle("pomodoro:skip", () => pomodoro.skip());
  ipcMain.handle("pomodoro:getState", () => pomodoro.getState());
  ipcMain.handle("reminder:pause", (_e, v) => reminders.setPaused(v));
  ipcMain.handle("reminder:getState", () => reminders.getState());
  ipcMain.handle("panel:open", () => openPanel());
  ipcMain.handle("panel:close", () => closePanel());
  ipcMain.handle("pet:talk", (_e, text) => {
    intimacy.addSeconds(300);
    broadcast("store:update", store.get());
    sendPet("talk", { text: String(text || "").slice(0, 200) });
  });
  ipcMain.handle("pet:chatToggle", () => sendPet("chatToggle"));
  ipcMain.handle("intimacy:bump", () => {
    intimacy.addSeconds(300);
    broadcast("store:update", store.get());
  });
  ipcMain.handle("menu:popup", () => popupContextMenu());
  ipcMain.handle("window:moveTo", (_e, { x, y }) => {
    if (petWin && !petWin.isDestroyed()) {
      petWin.setPosition(Math.round(x), Math.round(y));
    }
  });
  ipcMain.handle("window:getPosition", () =>
    petWin && !petWin.isDestroyed() ? petWin.getPosition() : [0, 0]
  );
  ipcMain.handle("window:setChatMode", (_e, on) => {
    if (!petWin || petWin.isDestroyed()) return;
    const h = on ? 330 : 220;
    const [x, y] = petWin.getPosition();
    const wa = screen.getDisplayNearestPoint({ x, y }).workArea;
    const delta = h - petWin.getSize()[1];
    petWin.setSize(380, h);
    let ny = y - delta;
    ny = Math.max(wa.y, Math.min(ny, wa.y + wa.height - h));
    let nx = Math.max(wa.x, Math.min(x, wa.x + wa.width - 380));
    petWin.setPosition(Math.round(nx), Math.round(ny));
    // 聊天时窗口需要正常接收点击
    petWin.clickThroughState = null;
    petWin.setIgnoreMouseEvents(false, { forward: true });
  });
  ipcMain.handle("window:setClickThrough", (_e, ignore) =>
    setClickThrough(!!ignore)
  );
  ipcMain.handle("window:setShape", (_e, rects) => {
    if (!petWin || petWin.isDestroyed()) return;
    try {
      if (Array.isArray(rects) && rects.length) {
        petWin.setShape(
          rects.map((r) => ({
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.max(1, Math.round(r.width)),
            height: Math.max(1, Math.round(r.height)),
          }))
        );
      } else {
        petWin.setShape([]);
      }
    } catch (_) {
      /* 部分平台不支持时忽略 */
    }
  });
  ipcMain.handle("ai:ask", (_e, q, call) =>
    aiAsk(String(q || ""), String(call || "人类"))
  );
  ipcMain.handle("ai:weather", (_e, city) => aiWeather(String(city || "")));
  ipcMain.handle("ai:test", () => aiTest());
  ipcMain.handle("app:quit", () => app.quit());
}

app.whenReady().then(() => {
  store = new Store();
  // 启动时重写一次自启项：既保证路径正确，也会清掉早期错误条目
  applyAutostart(!!store.get().settings.autostart);

  pomodoro = new Pomodoro(store, {
    onUpdate: () => broadcast("pomodoro:update", pomodoro.getState()),
    onEvent: (type) => {
      sendPet(type);
      if (type === "workDone") {
        intimacy.addSeconds(600);
        broadcast("store:update", store.get());
      }
      if (NOTIFY_MAP[type]) {
        notify(...NOTIFY_MAP[type]);
      }
    },
  });

  reminders = new Reminders(store, {
    onEvent: (item) => {
      sendPet("reminder", { kind: item.kind, label: item.label });
      const title = `${item.label}提醒`;
      const body =
        item.kind === "water"
          ? "起来喝口水吧，别学我当干蛙。"
          : item.kind === "stand"
            ? "坐太久了，起来活动活动。"
            : `${item.label}时间到了，行动起来吧。`;
      notify(title, body);
    },
  });
  reminders.start();

  intimacy = new Intimacy(store, {
    onLevelUp: (lv) => {
      const text =
        lv >= 3
          ? "老大，我发现我已经离不开你的桌面了。"
          : "人类…不对，熟都熟了，以后叫你老大吧。";
      sendPet("intimacyUp", { text });
      notify("亲密度提升", text);
    },
  });
  // 每 60 秒累计 1 分钟陪伴时长
  setInterval(() => {
    intimacy.addSeconds(60);
    broadcast("store:update", store.get());
  }, 60000);

  createPetWindow();
  createPanelWindow();
  createTray();
  registerIpc();

  if (process.env.SMOKE_TEST === "1") {
    console.log("SMOKE_START");
    setTimeout(async () => {
      try {
        // 测试期间：清掉挂起的反应定时器并禁用鼠标交互，排除真实点击/悬停干扰
        await petWin.webContents.executeJavaScript(
          "clearTimeout(stateTimer); document.getElementById('frog').style.pointerEvents = 'none'"
        );
        const src1 = await petWin.webContents.executeJavaScript(
          "document.getElementById('frog').src"
        );
        await new Promise((r) => setTimeout(r, 3000));
        const src2 = await petWin.webContents.executeJavaScript(
          "document.getElementById('frog').src"
        );
        console.log("FRAME_SAME", src1 === src2);
        console.log("SRC1", src1);
        console.log("SRC2", src2);
        console.log("STATE_A", await petWin.webContents.executeJavaScript("stateName"));
        await petWin.webContents.executeJavaScript("setState('celebrate')");
        const src3 = await petWin.webContents.executeJavaScript(
          "document.getElementById('frog').src"
        );
        await new Promise((r) => setTimeout(r, 2000));
        const src4 = await petWin.webContents.executeJavaScript(
          "document.getElementById('frog').src"
        );
        console.log("CELEBRATE_STATIC", src3 === src4);
        console.log("SRC3", src3);
        console.log("SRC4", src4);
        console.log("STATE_B", await petWin.webContents.executeJavaScript("stateName"));
        const imgs = await panelWin.webContents.executeJavaScript(
          "Array.from(document.querySelectorAll('img')).map(i => ({ src: i.src.split('/').pop(), w: i.naturalWidth }))"
        );
        console.log("PANEL_IMGS", JSON.stringify(imgs));
        console.log(
          "BUBBLE_W",
          await petWin.webContents.executeJavaScript(
            "document.getElementById('bubble').style.width"
          )
        );
        console.log(
          "BUBBLE_LEFT",
          await petWin.webContents.executeJavaScript(
            "document.getElementById('bubble').getBoundingClientRect().left"
          )
        );
        console.log(
          "PET_BRAIN",
          await petWin.webContents.executeJavaScript("typeof FROGBRAIN")
        );
        console.log(
          "PANEL_BRAIN",
          await panelWin.webContents.executeJavaScript("typeof FROGBRAIN")
        );
        console.log(
          "BRAIN_ANSWER",
          await petWin.webContents.executeJavaScript("FROGBRAIN.answer('你好')")
        );
        console.log(
          "CHAT_OPEN",
          await petWin.webContents.executeJavaScript(
            "toggleChat(true); document.getElementById('chatBar').classList.contains('show')"
          )
        );
        console.log(
          "LAYOUT",
          await petWin.webContents.executeJavaScript(
            "JSON.stringify((() => { const b = document.getElementById('bubble').getBoundingClientRect(); const c = document.getElementById('chatBar').getBoundingClientRect(); return { bubbleTop: Math.round(b.top), bubbleBottom: Math.round(b.bottom), chatTop: Math.round(c.top), chatBottom: Math.round(c.bottom), overlap: b.bottom > c.top && b.top < c.bottom }; })())"
          )
        );
        console.log(
          "BRAIN2",
          await petWin.webContents.executeJavaScript(
            "JSON.stringify({ call0: FROGBRAIN.callFor(0), call2h: FROGBRAIN.callFor(3*3600), level: FROGBRAIN.levelInfo(0).name, txt: FROGBRAIN.answer('你好', FROGBRAIN.callFor(0)) })"
          )
        );
        console.log("STORE_INTIMACY", JSON.stringify(store.get().intimacy));
        console.log(
          "CHAT_STATE",
          await petWin.webContents.executeJavaScript(
            "(async () => { document.getElementById('chatInput').value = '你好'; await sendChat(); return stateName; })()"
          )
        );
        console.log(
          "BRAIN3",
          await petWin.webContents.executeJavaScript(
            "FROGBRAIN.smartAnswer('今天天气怎么样', '人类', {}).then(x => 'local:' + x)"
          )
        );
        console.log(
          "AI_TEST",
          JSON.stringify(await panelWin.webContents.executeJavaScript("api.ai.test()"))
        );
        console.log(
          "WEATHER_TEST",
          JSON.stringify(await panelWin.webContents.executeJavaScript("api.ai.weather('')"))
        );
        await panelWin.webContents.executeJavaScript(
          "api.setStore({ settings: { autostart: true } })"
        );
        console.log("AUTOSTART_ON", autostartRegistryEntry());
        await panelWin.webContents.executeJavaScript(
          "api.setStore({ settings: { autostart: false } })"
        );
        console.log("AUTOSTART_OFF", autostartRegistryEntry());
        console.log(
          "CLICK_TEST",
          await petWin.webContents.executeJavaScript(
            `(async () => {
              const frogEl = document.getElementById('frog');
              const fire = (type, x, y, sx, sy, t) =>
                t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, screenX: sx, screenY: sy }));
              fire('mousedown', 100, 180, 100, 180, frogEl);
              await new Promise((r) => setTimeout(r, 80));
              fire('mouseup', 100, 180, 100, 180, window);
              fire('click', 100, 180, 100, 180, frogEl);
              await new Promise((r) => setTimeout(r, 320));
              const s1 = {
                state: stateName,
                isClick: frog.src.indexOf('/click/') >= 0,
                isDrag: frog.src.indexOf('/drag/') >= 0,
                bubbleShow: document.getElementById('bubble').classList.contains('show'),
              };
              await new Promise((r) => setTimeout(r, 2200));
              const s2 = {
                bubbleShow: document.getElementById('bubble').classList.contains('show'),
                textLen: document.getElementById('bubbleText').textContent.length,
              };
              return JSON.stringify({ s1, s2 });
            })()`
          )
        );
        console.log(
          "DRAG_TEST",
          await petWin.webContents.executeJavaScript(
            `(async () => {
              const frogEl = document.getElementById('frog');
              const fire = (type, x, y, sx, sy, t) =>
                t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, screenX: sx, screenY: sy }));
              fire('mousedown', 100, 180, 100, 180, frogEl);
              await new Promise((r) => setTimeout(r, 80));
              fire('mousemove', 160, 180, 160, 180, window);
              await new Promise((r) => setTimeout(r, 120));
              fire('mouseup', 160, 180, 160, 180, window);
              await new Promise((r) => setTimeout(r, 300));
              const a = {
                state: stateName,
                f2: frog.src.indexOf('drag/frame-2') >= 0,
              };
              await new Promise((r) => setTimeout(r, 1200));
              const b = { state: stateName };
              return JSON.stringify({ a, b });
            })()`
          )
        );
      } catch (err) {
        console.log("FRAME_TEST_ERROR", err.message);
      }
      console.log("SMOKE_OK");
      app.quit();
    }, 8000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
