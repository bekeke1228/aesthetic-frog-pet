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

async function aiAsk(q, call) {
  const key = store.get().settings.aiKey;
  if (!key) return { ok: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
        max_tokens: 200,
        temperature: 0.9,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const text = (
      (data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content) ||
      ""
    ).trim();
    return text ? { ok: true, text } : { ok: false };
  } catch (_) {
    clearTimeout(timer);
    return { ok: false };
  }
}

async function aiWeather(city) {
  if (!city) return { ok: false };
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
  tray.setToolTip("审美吉蛙桌宠 v3.2");
  refreshTrayMenu();
}

function registerIpc() {
  ipcMain.handle("store:get", () => store.get());
  ipcMain.handle("store:set", (_e, patch) => {
    store.set(patch);
    const data = store.get();
    if (patch.settings) {
      if ("autostart" in patch.settings) {
        app.setLoginItemSettings({ openAtLogin: !!patch.settings.autostart });
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
  ipcMain.handle("ai:ask", (_e, q, call) =>
    aiAsk(String(q || ""), String(call || "人类"))
  );
  ipcMain.handle("ai:weather", (_e, city) => aiWeather(String(city || "")));
  ipcMain.handle("app:quit", () => app.quit());
}

app.whenReady().then(() => {
  store = new Store();
  app.setLoginItemSettings({ openAtLogin: !!store.get().settings.autostart });

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
