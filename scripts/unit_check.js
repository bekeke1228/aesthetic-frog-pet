/* 番茄钟与提醒逻辑的快速单元检查（无需 Electron 图形界面） */
const assert = require("assert");
const Pomodoro = require("../src/main/pomodoro");
const Reminders = require("../src/main/reminders");

function fakeStore(data) {
  return { get: () => data, save: () => {}, set: () => data };
}

// ---- 番茄钟 ----
const pdata = {
  settings: { workMin: 1, breakMin: 1 },
  pomodoro: {
    todayCount: 0,
    todayDate: "2099-01-01",
    mode: "work",
    remainingMs: 0,
    running: false,
  },
};
const events = [];
const pomo = new Pomodoro(fakeStore(pdata), {
  onUpdate: () => {},
  onEvent: (e) => events.push(e),
});

pomo.start();
assert.strictEqual(pdata.pomodoro.running, true, "start 后应运行");
assert.strictEqual(pdata.pomodoro.remainingMs, 60000, "1 分钟 = 60000ms");
assert.strictEqual(events[0], "workStart");

for (let i = 0; i < 60; i++) pomo.tick();
assert.ok(events.includes("workDone"), "工作结束应触发 workDone");
assert.strictEqual(pdata.pomodoro.todayCount, 1, "番茄计数 +1");
assert.strictEqual(pdata.pomodoro.mode, "break", "自动进入休息");
assert.strictEqual(pdata.pomodoro.running, true, "休息应自动运行");

for (let i = 0; i < 60; i++) pomo.tick();
assert.ok(events.includes("breakDone"), "休息结束应触发 breakDone");
assert.strictEqual(pdata.pomodoro.mode, "work");
assert.strictEqual(pdata.pomodoro.running, false, "休息后回到待机");

pomo.pause();
pomo.skip();
assert.strictEqual(pdata.pomodoro.mode, "break", "跳过工作阶段进入休息");
assert.strictEqual(pdata.pomodoro.running, true);
console.log("Pomodoro OK");

// ---- 提醒 ----
const rdata = {
  settings: {},
  reminders: {
    paused: false,
    items: [
      {
        id: "a",
        kind: "water",
        label: "喝水",
        minutes: 45,
        enabled: true,
        lastAt: 0,
      },
    ],
  },
};
const revents = [];
const rem = new Reminders(fakeStore(rdata), { onEvent: (e) => revents.push(e) });

rem.check();
assert.strictEqual(revents.length, 0, "首次启动不应立即提醒");
assert.ok(rdata.reminders.items[0].lastAt > 0, "首次启动应记录基准时间");

rdata.reminders.items[0].lastAt = Date.now() - 46 * 60000;
rem.check();
assert.strictEqual(revents.length, 1, "超时应触发提醒");
assert.strictEqual(revents[0].kind, "water");

rdata.reminders.paused = true;
revents.length = 0;
rdata.reminders.items[0].lastAt = Date.now() - 100 * 60000;
rem.check();
assert.strictEqual(revents.length, 0, "暂停时不应提醒");
console.log("Reminders OK");

// 旧版数据结构迁移
const legacy = {
  settings: { waterMin: 40, standMin: 55 },
  reminders: { paused: false, lastWater: 1, lastStand: 2 },
};
const rem2 = new Reminders(fakeStore(legacy), { onEvent: () => {} });
assert.strictEqual(legacy.reminders.items.length, 2, "旧数据应迁移为两个默认提醒");
assert.strictEqual(legacy.reminders.items[0].minutes, 40);
assert.strictEqual(legacy.reminders.items[1].minutes, 55);
console.log("Reminder migration OK");

clearInterval(pomo.timer);
console.log("ALL CHECKS PASSED");
