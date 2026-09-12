window.FROGBRAIN = (function () {
  function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 亲密度：陌生(<2h 叫人类) -> 熟悉(>=2h 叫老大) -> 挚友(>=24h)
  function callFor(seconds) {
    return seconds >= 2 * 3600 ? "老大" : "人类";
  }

  function levelInfo(seconds) {
    if (seconds >= 24 * 3600) return { level: 3, name: "挚友" };
    if (seconds >= 2 * 3600) return { level: 2, name: "熟悉" };
    return { level: 1, name: "陌生" };
  }

  function intimacyText(seconds) {
    const info = levelInfo(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const time = h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
    return `${info.name}（已陪伴 ${time}）`;
  }

  function fill(text, call) {
    return String(text).replace(/\{call\}/g, call);
  }

  function answer(raw, call) {
    const t = String(raw || "").trim();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    if (!t) return "问点啥都行，就是别问我会不会干活。";
    if (/(你好|嗨|哈喽|在吗|hi|hello)/i.test(t))
      return fill(
        randomOf([
          "{call}，在呢，不过别指望我干活。",
          "哟，{call}来了？我正趴着，你随意。",
          "在在在，先说好，不干活。",
          "来了来了，我刚好把今天的摆烂指标完成了。",
          "Hello, {call}. 本蛙的英语就这水平了。",
        ]),
        call
      );
    if (/(你是谁|你叫什么|你是啥)/.test(t))
      return randomOf([
        "我是审美吉蛙，一只负责好看、偶尔吐槽的外星蛙。",
        "蛙星驻地球办事处首席代表（自封的）。",
      ]);
    if (/(几点|时间)/.test(t))
      return fill(`现在 ${hh}:${mm}。{call}该干嘛自己看着办，反正我继续趴着。`, call);
    if (/(天气|气温|温度|下雨|晴)/.test(t))
      return randomOf([
        "本蛙星气象台播报：大概率晴，适合发呆。",
        "地球天气我不熟，你问「XX天气」我帮你联网查。",
        "天气预报说：适合摸鱼，不适合出门。",
      ]);
    if (/(吃|饿|饭)/.test(t))
      return fill(
        randomOf([
          "我不用吃饭，光合作用（大概）。{call}记得按时吃饭，别学我。",
          "又到饭点了？帮我闻闻味道就行。",
          "蛙星食谱：阳光、空气、和一点点摆烂。",
        ]),
        call
      );
    if (/(困|睡觉|睡)/.test(t))
      return fill(
        randomOf([
          "困了就睡，天塌下来有{call}顶着（不是）。",
          "睡觉是宇宙通用的休息方式，蛙星也这么干。",
          "本蛙一天睡 20 小时，剩下 4 小时负责好看。",
        ]),
        call
      );
    if (/(为什么)/.test(t))
      return randomOf([
        "为什么？因为我乐意。这只蛙的人生不需要理由。",
        "这个问题我研究过，结论是：不研究。",
        "因为所以，科学道理；不懂就问，问了我也不懂。",
      ]);
    if (/(怎么办|咋办|怎么弄)/.test(t))
      return randomOf([
        "怎么办？先躺一会儿，让问题自己解决自己。",
        "我的建议是：明天再说，明天的你更聪明。",
        "拆成小问题一个个解决，实在不行就求助——别学我装死。",
      ]);
    if (/(上班|工作|摸鱼|加班)/.test(t))
      return randomOf([
        "工作嘛，干不完的，摸鱼是劳动人民的自我修养。",
        "加班是地球人的迷惑行为，我们蛙星不加。",
        "效率第一，摸鱼第二，午睡第三。",
      ]);
    if (/(累|烦|难过|emo|丧)/.test(t))
      return randomOf([
        "累了就歇歇，{call}又不是机器；就算是机器，也得上油。",
        "来，跟我一起趴一会儿，治愈度拉满。",
        "本蛙的处方：发呆五分钟，烦恼少一半。",
      ]);
    if (/(加油|坚持|努力)/.test(t))
      return randomOf([
        "加油！虽然我也不懂加油有什么用，但精神上支持你。",
        "冲就完事了，实在冲不动就赖着，也是一种活法。",
      ]);
    if (/(外星|蛙星|飞碟|星球)/.test(t))
      return randomOf([
        "没错，我是从蛙星来的。飞碟停在你显示器后面，充电口是 Type-C。",
        "蛙星不加班、不下雨、满地都是青苔沙发，欢迎来玩。",
      ]);
    if (/(亲密度|熟悉|陌生|挚友|称呼)/.test(t))
      return fill(
        randomOf([
          "咱俩现在的亲密度：{call}。混熟了我就不跟你客气了。",
          "刚见面那会儿我叫你人类，现在……你自己看面板吧。",
        ]),
        call
      );
    if (/(心情|开心|高兴|emo|难过)/.test(t))
      return randomOf([
        "心情不好就趴一会儿，本蛙陪你一起趴。",
        "开心是免费的，就像阳光和摸鱼。",
        "要我说，今天适合开心，不适合内耗。",
      ]);
    if (/(星座)/.test(t))
      return "本蛙星座：蛙座。性格：爱趴、爱晒太阳、偶尔靠谱。";
    if (/(恋爱|喜欢的人|对象|表白)/.test(t))
      return randomOf([
        "感情问题啊……本蛙的建议：真诚最重要，外加一点勇气。",
        "蛙星不谈恋爱，只谈光合作用。但你不一样，冲吧。",
      ]);
    if (/(考试|学习|复习|作业)/.test(t))
      return randomOf([
        "学习这事，本蛙帮不了你，但可以陪你熬。",
        "把手机放远点，番茄钟开起来，学 25 分钟歇 5 分钟。",
      ]);
    if (/(钱|工资|穷|富)/.test(t))
      return "蛙星不用钱，但我们懂地球人的痛：钱不是万能的，没有钱是万万不能的。";
    if (/(游戏|打游戏)/.test(t))
      return "打游戏可以，但要记得喝水久坐提醒——本蛙的职责所在。";
    if (/(音乐|歌|唱歌)/.test(t))
      return "我会唱：呱呱呱呱呱……（蛙星语摇滚版）。";
    if (/(吉娃娃|狗)/.test(t))
      return "我有一半吉娃娃血统，所以既会趴窝又会看家（瞪你）。";
    if (/(审美|好看|帅|可爱)/.test(t))
      return "审美？找我啊，本蛙的审美：乱中有序，丑萌即正义。";
    if (/(小吉|吉吉|名字)/.test(t))
      return "叫我小吉或吉吉都行，但正式场合请叫我审美吉蛙。";
    const m = t.match(/(-?\d+)\s*([+\-*/xX])\s*(-?\d+)/);
    if (m) {
      const a = parseFloat(m[1]);
      const b = parseFloat(m[3]);
      let r = NaN;
      if (m[2] === "+") r = a + b;
      else if (m[2] === "-") r = a - b;
      else if (m[2] === "*" || m[2] === "x" || m[2] === "X") r = a * b;
      else if (m[2] === "/") r = b !== 0 ? a / b : NaN;
      if (!Number.isNaN(r))
        return `${a} ${m[2]} ${b} = ${r}。别问我怎么算的，蛙脑容量有限。`;
    }
    return fill(
      randomOf([
        "这个问题超出我这只蛙的学识范围了。",
        "我思考了一下，决定不思考。",
        "好问题，但我选择装死。",
        "这个嘛……等我摸完鱼再回答你。",
        "你说得对，但我没在听。",
        "我回蛙星问一下长老，明天再告诉你。",
        "呱……（蛙星语翻译：我不知道，但我说得很认真。）",
        "Sorry, this frog is on vacation mentally.",
      ]),
      call
    );
  }

  function cleanCity(q) {
    const s = String(q).replace(
      /(今天|明天|现在|这边|这里|那儿|当地|本地|一下|怎么样|如何|多少度|几度|的|了|吗|呢|呀|啊|\?|？|！|!)/g,
      ""
    );
    const m =
      s.match(/([\u4e00-\u9fa5A-Za-z]{2,12}?)(?:天气|气温|温度)/) ||
      s.match(/(?:天气|气温|温度)([\u4e00-\u9fa5A-Za-z]{2,12})/);
    return m ? String(m[1] || m[2] || "").trim() : "";
  }

  // 智能回答：天气联网 -> AI(可选) -> 本地蛙脑兜底
  async function smartAnswer(q, call, deps) {
    const t = String(q || "").trim();
    if (/(天气|气温|温度|下雨|晴|多云)/.test(t)) {
      if (deps && deps.weather) {
        try {
          const r = await deps.weather(cleanCity(t));
          if (r && r.ok) {
            if (deps.onSource) deps.onSource("weather");
            return r.text;
          }
          if (r && r.error === "no-city") {
            if (deps.onSource) deps.onSource("local");
            return "告诉我城市名吧，比如「上海天气」，我这就联网帮你查。";
          }
          if (deps.onWeatherError) deps.onWeatherError((r && r.error) || "未知错误");
        } catch (err) {
          if (deps.onWeatherError) deps.onWeatherError(String((err && err.message) || err));
        }
      }
      if (deps && deps.onSource) deps.onSource("local");
      return answer(t, call);
    }
    if (deps && deps.aiKey && deps.ask) {
      try {
        const r = await deps.ask(q, call);
        if (r && r.ok && r.text) {
          if (deps.onSource) deps.onSource("ai");
          return r.text;
        }
        if (deps.onAiError) deps.onAiError((r && r.error) || "未知错误");
      } catch (err) {
        if (deps.onAiError) deps.onAiError(String((err && err.message) || err));
      }
    }
    if (deps && deps.onSource) deps.onSource("local");
    return answer(q, call);
  }

  return { answer, smartAnswer, randomOf, callFor, levelInfo, intimacyText };
})();
