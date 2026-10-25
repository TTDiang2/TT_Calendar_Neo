// CDP 录制器：headless Chrome/Edge + Page.startScreencast 抓帧 + Runtime.evaluate 驱动真实交互
// 用法: node cdp_record.mjs <take名>  → artifacts/films/rec/<take名>/f####.png
// 帧带时间戳（screencastFrame.metadata.timestamp），装配时补齐为恒定 60fps。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TAKE = process.argv[2] ?? 'A'
const OUT = `E:/TT_Calendar_Neo/artifacts/films/rec/${TAKE}`
const APP = 'http://127.0.0.1:5199/'
const WS = process.argv[3] // browser ws url，由外部传入

mkdirSync(OUT, { recursive: true })

// ── 交互时间表（秒 → page 内 JS）。click 辅助在注入的 helper 里 ──
const PLANS = {
  A: [ // 切视图：月→日→年→倒数→月
    [0.6, "clickView('日')"],
    [3.1, "clickView('年')"],
    [5.6, "clickView('倒数')"],
    [8.1, "clickView('月')"],
  ],
  B: [ // 新建待办（打字机 + 表单）
    [0.4, "clickTab('待办')"],
    [1.8, "clickFab()"],
    [3.0, "clickMenuItem('新建待办')"],
    [4.2, "typeTitle('给项目写周报大纲')"], // 内部逐字
    [7.6, "setDueToday()"],
    [9.0, "clickImportance('重要')"],
    [10.6, "clickAdd()"],
  ],
  C: [ // 连续点掉 4 条待办
    [0.5, "completeFirst()"],
    [2.3, "completeFirst()"],
    [4.1, "completeFirst()"],
    [5.9, "completeFirst()"],
  ],
  D: [ // 统计页 + 区间切换
    [0.4, "clickTab('分析')"],
    [3.2, "clickRange('14天')"],
    [5.4, "clickRange('7天')"],
    [7.6, "clickRange('30天')"],
  ],
}

// ── CDP WebSocket 客户端 ──
class CDP {
  constructor(ws) {
    this.ws = new WebSocket(ws)
    this.id = 0
    this.pending = new Map()
    this.handlers = new Map()
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else if (msg.method && this.handlers.has(msg.method)) {
        this.handlers.get(msg.method)(msg.params)
      }
    }
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.ws.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  on(method, fn) { this.handlers.set(method, fn) }
  ready() { return new Promise(r => { this.ws.onopen = r }) }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const bws = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json()).then(j => j.webSocketDebuggerUrl)
const cdp = new CDP(bws)
await cdp.ready()

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
const S = (m, p) => cdp.send(m, p, sessionId)

await S('Page.enable')
await S('Runtime.enable')

// 高清移动视口：CSS 430×932，DPR 2 → 帧图 860×1864
await S('Emulation.setDeviceMetricsOverride', {
  width: 430, height: 932, deviceScaleFactor: 2, mobile: true,
})

// 门禁注入：每次导航前自动执行
await S('Page.addScriptToEvaluateOnNewDocument', {
  source: `localStorage.setItem('tt.lang','zh-CN');
    localStorage.setItem('tt.onboarded-v1','1');
    localStorage.setItem('tt.tour-done-v1','1');`,
})

await S('Page.navigate', { url: APP })
await sleep(3500)

// helper 注入（交互函数都挂 window.__h）
const evalJs = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('page err: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  return r.result?.value
}
await evalJs(`(() => {
  const q = (sel) => document.querySelector(sel);
  const byText = (sel, txt) => [...document.querySelectorAll(sel)].find(e => (e.textContent ?? '').trim() === txt);
  const byAria = (txt) => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === txt);
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  window.__h = {
    clickView: (v) => { const b = byText('nav button, nav [role=button], nav button *', v) ?? [...document.querySelectorAll('nav button')].find(x => x.textContent?.trim() === v); fire(b ?? byText('button', v)); },
    clickTab: (v) => { const nav = [...document.querySelectorAll('nav')].find(n => n.getAttribute('aria-label') === '主导航'); fire([...nav.querySelectorAll('button')].find(x => x.textContent?.trim() === v)); },
    clickFab: () => fire(byAria('新建')),
    clickMenuItem: (v) => fire([...document.querySelectorAll('button,[role=menuitem]')].find(x => (x.textContent ?? '').trim() === v)),
    typeTitle: async (text) => {
      const tb = q('input[placeholder="要做什么？"]') ?? q('textarea[placeholder="要做什么？"]') ?? [...document.querySelectorAll('input')].find(i => i.placeholder?.includes('要做什么'));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      tb.focus();
      for (const ch of text) {
        setter.call(tb, tb.value + ch);
        tb.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 55));
      }
    },
    setDueToday: () => {
      const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('今天')));
      if (sel) { sel.value = [...sel.options].find(o => o.textContent.includes('今天')).value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    },
    clickImportance: (v) => fire(byText('button', v)),
    clickAdd: () => fire([...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '添加待办' && !b.disabled)),
    completeFirst: () => fire([...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '') === '标记为已完成')),
    clickRange: (v) => fire([...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === v && !b.getAttribute('aria-label'))),
  };
  return 'helpers ok';
})()`)

// ── screencast 抓帧 ──
const frames = []
S('Page.startScreencast', { format: 'png', everyFrame: true }).catch(() => {})
cdp.on('Page.screencastFrame', (p) => {
  const { data, metadata, sessionId: sid } = p
  frames.push({ t: metadata.timestamp, data })
  const f = frames.length
  writeFileSync(join(OUT, `f${String(f).padStart(5, '0')}.png`), Buffer.from(data, 'base64'))
  S('Page.screencastFrameAck', { sessionId: sid }).catch(() => {})
})

const t0 = Date.now()
const plan = PLANS[TAKE] ?? []
const dur = plan.length ? plan[plan.length - 1][0] + 2.2 : 3
for (const [at, js] of plan) {
  const wait = at * 1000 - (Date.now() - t0)
  if (wait > 0) await sleep(wait)
  try { await evalJs(`(window.__h) ? (window.__h.${js}) : 'noh'`); console.log(`[${TAKE}] @${at}s ${js} ✓`) }
  catch (e) { console.log(`[${TAKE}] @${at}s ${js} ✗ ${e.message.slice(0, 120)}`) }
}
const rest = dur * 1000 - (Date.now() - t0)
if (rest > 0) await sleep(rest)
await S('Page.stopScreencast').catch(() => {})
await sleep(300)
// 真实时间戳清单（相对首帧，秒）——重采样必须按它，不能按平均帧率
const t0f = frames[0]?.t ?? 0
writeFileSync(join(OUT, 'timestamps.tsv'),
  frames.map((fr, i) => `${i + 1}\t${(fr.t - t0f).toFixed(4)}`).join('\n'))
console.log(`[${TAKE}] done: ${frames.length} frames, ${(frames.at(-1)?.t - frames[0]?.t).toFixed(2)}s span`)
await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
process.exit(0)
