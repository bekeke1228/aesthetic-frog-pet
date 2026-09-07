const { contextBridge, ipcRenderer } = require("electron");

const VALID_EVENTS = ["pet:event", "pomodoro:update", "store:update"];

contextBridge.exposeInMainWorld("api", {
  getStore: () => ipcRenderer.invoke("store:get"),
  setStore: (patch) => ipcRenderer.invoke("store:set", patch),
  getManifest: () => ipcRenderer.invoke("manifest:get"),
  pomodoro: {
    start: (minutes, name) => ipcRenderer.invoke("pomodoro:start", minutes, name),
    pause: () => ipcRenderer.invoke("pomodoro:pause"),
    skip: () => ipcRenderer.invoke("pomodoro:skip"),
    getState: () => ipcRenderer.invoke("pomodoro:getState"),
  },
  reminders: {
    pause: (v) => ipcRenderer.invoke("reminder:pause", !!v),
    getState: () => ipcRenderer.invoke("reminder:getState"),
  },
  panel: {
    open: () => ipcRenderer.invoke("panel:open"),
    close: () => ipcRenderer.invoke("panel:close"),
  },
  pet: {
    talk: (text) => ipcRenderer.invoke("pet:talk", text),
    toggleChat: () => ipcRenderer.invoke("pet:chatToggle"),
  },
  intimacy: {
    bump: () => ipcRenderer.invoke("intimacy:bump"),
  },
  window: {
    moveTo: (x, y) => ipcRenderer.invoke("window:moveTo", { x, y }),
    getPosition: () => ipcRenderer.invoke("window:getPosition"),
    setChatMode: (on) => ipcRenderer.invoke("window:setChatMode", !!on),
    setClickThrough: (on) => ipcRenderer.invoke("window:setClickThrough", !!on),
  },
  ai: {
    ask: (q, call) => ipcRenderer.invoke("ai:ask", q, call),
    weather: (city) => ipcRenderer.invoke("ai:weather", city),
  },
  menu: { popup: () => ipcRenderer.invoke("menu:popup") },
  app: { quit: () => ipcRenderer.invoke("app:quit") },
  on: (channel, cb) => {
    if (VALID_EVENTS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => cb(...args));
    }
  },
});
