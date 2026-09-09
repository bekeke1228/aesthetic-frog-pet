const frog = document.getElementById("frog");
const bubble = document.getElementById("bubble");
const bubbleText = document.getElementById("bubbleText");
const timerChip = document.getElementById("timerChip");
const chatBtn = document.getElementById("chatBtn");
const chatBar = document.getElementById("chatBar");
const chatInput = document.getElementById("chatInput");

let manifest = null;
let settings = { sound: true };
let intimacy = { seconds: 0 };
let stateName = "idle";
let idleSince = Date.now();
let bubbleTimer = null;
let stateTimer = null;
let randomTimer = null;
let typeTimer = null;
let drag = null;

const SLEEP_AFTER_MS = 90 * 1000;
const RANDOM_MIN_MS = 30 * 60 * 1000;
const RANDOM_MAX_MS = 60 * 60 * 1000;

function stateInfo(name) {
  const s = manifest.states[name];
  if (s && s.frames && s.frames.length) return s;
  return { frames: [manifest.fallbackUrl], fps: 3, static: true };
}

function callTerm() {
  return window.FROGBRAIN
    ? FROGBRAIN.callFor(intimacy.seconds || 0)
    : "人类";
}

// 所有形态都是静态帧：setState 只随机挑一帧展示，绝不轮换
function setState(name, opts = {}) {
  stateName = name;
  const info = stateInfo(name);
  frog.src = info.frames[Math.floor(Math.random() * info.frames.length)];
  if (opts.resetIdle !== false && name !== "sleep") idleSince = Date.now();
  setTimeout(applyShape, 80);
}

// 显示某个形态的指定一帧（拖拽表情：drag_01 / drag_02）
function showFrame(name, index) {
  stateName = name;
  const info = stateInfo(name);
  frog.src =
    info.frames[Math.max(0, Math.min(index, info.frames.length - 1))] ||
    manifest.fallbackUrl;
  idleSince = Date.now();
  setTimeout(applyShape, 80);
}

// 互动后的新姿势：只从「待机」分类里随机挑一帧，不与其他分类混用
function nextIdlePose() {
  setState("idle");
}

function say(text, ms = 0, emoji = "") {
  const full = (emoji ? emoji + " " : "") + String(text).replace(/\{call\}/g, callTerm());
  // 按字数动态决定气泡宽度，尽量单行显示全部内容
  const maxW = Math.max(120, window.innerWidth - 14);
  bubble.style.width = Math.min(64 + full.length * 13.5, maxW) + "px";
  clearInterval(typeTimer);
  clearTimeout(bubbleTimer);
  bubbleText.textContent = "";
  bubbleText.classList.add("typing");
  bubble.classList.remove("show");
  void bubble.offsetWidth;
  bubble.classList.add("show");
  let i = 0;
  typeTimer = setInterval(() => {
    i += 1;
    bubbleText.textContent = full.slice(0, i);
    if (i >= full.length) {
      clearInterval(typeTimer);
      bubbleText.classList.remove("typing");
    }
  }, 100);
  const duration = Math.max(ms, Math.min(2800 + full.length * 110, 10000));
  bubbleTimer = setTimeout(() => {
    clearInterval(typeTimer);
    bubbleText.classList.remove("typing");
    bubble.classList.remove("show");
  }, duration);
}

function flash(name, ms, quote, emoji = "") {
  clearTimeout(stateTimer);
  setState(name);
  if (quote) say(quote, Math.min(ms, 3500), emoji);
  stateTimer = setTimeout(nextIdlePose, Math.max(ms, 1200));
}

function playSound(name) {
  if (!settings.sound || !manifest) return;
  const url = manifest.sounds[name];
  if (!url) return;
  try {
    new Audio(url).play().catch(() => {});
  } catch (_) {
    /* 忽略播放失败 */
  }
}

const clickCanvas = document.createElement("canvas");
const clickCtx = clickCanvas.getContext("2d", { willReadFrequently: true });
let clickDrawnSrc = "";
let shapeTimer = null;

function ensureSpriteCanvas() {
  const rect = frog.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (!frog.complete || !frog.naturalWidth || w <= 0 || h <= 0) return null;
  if (
    clickCanvas.width !== w ||
    clickCanvas.height !== h ||
    clickDrawnSrc !== frog.src
  ) {
    clickCanvas.width = w;
    clickCanvas.height = h;
    clickCtx.clearRect(0, 0, w, h);
    clickCtx.drawImage(frog, 0, 0, w, h);
    clickDrawnSrc = frog.src;
  }
  return { rect, w, h };
}

function spriteBBox() {
  const info = ensureSpriteCanvas();
  if (!info) return null;
  const { rect, w, h } = info;
  let data;
  try {
    data = clickCtx.getImageData(0, 0, w, h).data;
  } catch (_) {
    return null;
  }
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return {
    x: Math.round(rect.left + x0),
    y: Math.round(rect.top + y0),
    width: Math.round(x1 - x0 + 1),
    height: Math.round(y1 - y0 + 1),
  };
}

// 用原生窗口形状实现精确点击区域：只有吉蛙轮廓与对话按钮可点，
// 其余透明区域完全不接收鼠标，跨电脑表现一致
function applyShape() {
  clearTimeout(shapeTimer);
  shapeTimer = setTimeout(() => {
    if (!api || !api.window) return;
    if (document.body.classList.contains("chatting") || drag) {
      api.window.setShape([]);
      return;
    }
    const parts = [];
    const body = spriteBBox();
    if (body) parts.push(body);
    const btn = chatBtn.getBoundingClientRect();
    parts.push({
      x: Math.round(btn.left),
      y: Math.round(btn.top),
      width: Math.max(1, Math.round(btn.width)),
      height: Math.max(1, Math.round(btn.height)),
    });
    api.window.setShape(parts);
  }, 30);
}

function wake() {
  if (stateName === "sleep") nextIdlePose();
  idleSince = Date.now();
}

function onClick() {
  playSound("pop");
  flash("click", 1000, randomOf(QUOTES.click), "🤏");
}

function updateChip(p) {
  if (!p || (!p.running && p.remainingMs <= 0)) {
    timerChip.classList.remove("show");
    return;
  }
  const mm = String(Math.floor(p.remainingMs / 60000)).padStart(2, "0");
  const ss = String(Math.floor((p.remainingMs % 60000) / 1000)).padStart(2, "0");
  const name =
    p.mode === "work" ? p.label || "工作" : "休息";
  timerChip.textContent = `${name} ${mm}:${ss}`;
  timerChip.classList.add("show");
}

function toggleChat(forceOpen) {
  const willOpen = forceOpen === true ? true : !chatBar.classList.contains("show");
  chatBar.classList.toggle("show", willOpen);
  document.body.classList.toggle("chatting", willOpen);
  api.window.setChatMode(willOpen);
  setTimeout(applyShape, 140);
  if (willOpen) {
    chatInput.focus();
  } else {
    chatInput.blur();
  }
}

async function sendChat() {
  const q = chatInput.value.trim();
  if (!q) return;
  chatInput.value = "";
  const call = callTerm();
  const a = await FROGBRAIN.smartAnswer(q, call, {
    aiKey: settings.aiOn && settings.aiKey ? settings.aiKey : "",
    ask: (text, c) => api.ai.ask(text, c),
    weather: (city) => api.ai.weather(city),
  });
  flash("talk", Math.min(2800 + a.length * 110, 10000), a, "🐸");
  api.intimacy.bump();
  chatInput.focus();
}

function handlePetEvent({ type, text, kind, label }) {
  switch (type) {
    case "water":
      playSound("reminder");
      flash("talk", 2600, randomOf(QUOTES.water), "💧");
      break;
    case "stand":
      playSound("reminder");
      flash("talk", 2600, randomOf(QUOTES.stand), "🧘");
      break;
    case "reminder":
      playSound("reminder");
      if (kind === "water") {
        flash("talk", 2800, randomOf(QUOTES.water), "💧");
      } else if (kind === "stand") {
        flash("talk", 2800, randomOf(QUOTES.stand), "🧘");
      } else {
        flash(
          "talk",
          3000,
          `${label || "提醒"}时间到！本蛙负责提醒，你负责行动。`,
          "⏰"
        );
      }
      break;
    case "workStart":
      playSound("pop");
      flash("talk", 2600, randomOf(QUOTES.workStart), "🍅");
      break;
    case "breakStart":
      playSound("pop");
      flash("talk", 2400, randomOf(QUOTES.breakStart), "☕");
      break;
    case "workDone":
      playSound("done");
      flash("celebrate", 3400, randomOf(QUOTES.workDone), "🎉");
      break;
    case "breakDone":
      playSound("reminder");
      flash("talk", 2600, randomOf(QUOTES.breakDone), "💼");
      break;
    case "workIdle":
      say("阶段已跳过。", 2400, "⏭️");
      break;
    case "talk":
      playSound("pop");
      flash(
        "talk",
        Math.min(2400 + (text ? text.length * 80 : 0), 5500),
        text || "嗯？",
        "🐸"
      );
      break;
    case "chatToggle":
      toggleChat();
      break;
    case "intimacyUp":
      playSound("pop");
      flash("talk", 4200, text || "咱俩关系好像变近了。", "🐸");
      break;
    default:
      break;
  }
}

function scheduleRandomTalk() {
  clearTimeout(randomTimer);
  const delay = RANDOM_MIN_MS + Math.random() * (RANDOM_MAX_MS - RANDOM_MIN_MS);
  randomTimer = setTimeout(() => {
    if (stateName !== "sleep")
      flash("talk", 2600, randomOf(QUOTES.idleRandom));
    scheduleRandomTalk();
  }, delay);
}

frog.addEventListener("mousedown", async (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  wake();
  const pos = await api.window.getPosition();
  drag = {
    moved: false,
    sx: e.screenX,
    sy: e.screenY,
    px: pos[0],
    py: pos[1],
    t: Date.now(),
  };
  showFrame("drag", 0);
  api.window.setShape([]);
});

window.addEventListener("mousemove", (e) => {
  if (drag) {
    const dx = e.screenX - drag.sx;
    const dy = e.screenY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) api.window.moveTo(drag.px + dx, drag.py + dy);
  }
});

window.addEventListener("mouseup", (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  const isClick = !d.moved && e.button === 0 && Date.now() - d.t < 500;
  if (isClick) onClick();
  else {
    // 拖拽结束：短暂显示 drag_02（不乐），再回到随机待机
    clearTimeout(stateTimer);
    showFrame("drag", 1);
    stateTimer = setTimeout(nextIdlePose, 1100);
  }
  applyShape();
});

frog.addEventListener("dblclick", (e) => {
  e.preventDefault();
  api.panel.open();
});

frog.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  api.menu.popup();
});

chatBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleChat();
});

chatInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") sendChat();
  else if (e.key === "Escape") toggleChat(false);
});

window.addEventListener("keydown", (e) => {
  if (
    document.activeElement === document.body &&
    (e.key === "t" || e.key === "T" || e.key === "/")
  ) {
    toggleChat(true);
  }
});

frog.addEventListener("mouseenter", wake);

setInterval(() => {
  if (stateName !== "sleep" && Date.now() - idleSince > SLEEP_AFTER_MS) {
    setState("sleep", { resetIdle: false });
  }
}, 5000);

async function init() {
  manifest = await api.getManifest();
  const store = await api.getStore();
  settings = store.settings;
  intimacy = store.intimacy || { seconds: 0 };
  frog.addEventListener("load", applyShape);
  nextIdlePose();
  setTimeout(applyShape, 160);
  say("{call}，我是审美吉蛙 v3.3。戳我换姿势，问问题也可以。", 0, "🐸");
  api.on("store:update", (s) => {
    settings = s.settings;
    intimacy = s.intimacy || intimacy;
  });
  api.on("pet:event", handlePetEvent);
  api.on("pomodoro:update", updateChip);
  const p = await api.pomodoro.getState();
  updateChip(p);
  scheduleRandomTalk();
}

init();
