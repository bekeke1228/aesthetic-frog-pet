function buildMenuTemplate(actions) {
  const p = actions.getPomodoro();
  const reminders = actions.getReminders();
  const pomoLabel = p.running
    ? "暂停番茄钟"
    : p.remainingMs > 0
      ? "继续番茄钟"
      : "开始番茄钟";
  return [
    { label: actions.petVisible() ? "隐藏吉蛙" : "显示吉蛙", click: actions.togglePet },
    { label: pomoLabel, click: actions.togglePomodoro },
    { label: "跳过当前阶段", click: actions.skipPomodoro },
    { label: reminders.paused ? "恢复提醒" : "暂停提醒", click: actions.toggleReminders },
    { type: "separator" },
    { label: "打开面板", click: actions.openPanel },
    { label: "和吉蛙对话", click: actions.toggleChat },
    { label: "退出", click: actions.quit },
  ];
}

module.exports = { buildMenuTemplate };
