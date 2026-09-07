class Intimacy {
  constructor(store, { onLevelUp } = {}) {
    this.store = store;
    this.onLevelUp = onLevelUp || (() => {});
    this.lastLevel = this.level();
  }

  seconds() {
    return this.store.get().intimacy.seconds || 0;
  }

  level() {
    const s = this.seconds();
    if (s >= 24 * 3600) return 3;
    if (s >= 2 * 3600) return 2;
    return 1;
  }

  addSeconds(n) {
    const data = this.store.get();
    if (!data.intimacy) data.intimacy = { seconds: 0 };
    data.intimacy.seconds = (data.intimacy.seconds || 0) + Math.max(0, Math.round(n));
    this.store.save();
    const lv = this.level();
    if (lv > this.lastLevel) {
      this.lastLevel = lv;
      this.onLevelUp(lv);
    }
    return data.intimacy.seconds;
  }
}

module.exports = Intimacy;
