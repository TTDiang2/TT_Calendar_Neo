// TT 日历宣传短片 v2 配乐 —— 完整编曲版（鼓组/贝斯/锯齿铺底/琶音/音效/混响/母带）
// 51s · 92 BPM · F 大调。十幕对齐：intro(2bar)→beat进(4.5s)→全奏(16s)→降半(29s)→恢复+sparkle(34.5)→鼓停上扬(46)→尾声chime(50)
// 用法: node film_music2.mjs <out.wav>
import { writeFileSync } from 'node:fs'

const SR = 44100
const DUR = 51.0
const BPM = 92
const BEAT = 60 / BPM          // 0.6522
const BAR = BEAT * 4           // 2.6087
const N = Math.floor(SR * DUR)
const L = new Float64Array(N), R = new Float64Array(N)
const note = (m) => 440 * Math.pow(2, (m - 69) / 12)

const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r } }

// ── 鼓组 ──
function kick(t0, vel = 1.0) {
  const start = (t0 * SR) | 0, len = (0.26 * SR) | 0
  for (let i = 0; i < len; i++) {
    const tt = i / SR
    const f = 42 + 118 * Math.exp(-tt * 34)          // pitch envelope
    const env = Math.exp(-tt * 15) * Math.min(1, i / 30)
    add(start + i, Math.sin(2 * Math.PI * f * tt) * 0.62 * vel * env,
                     Math.sin(2 * Math.PI * f * tt) * 0.62 * vel * env)
  }
}
function snare(t0, vel = 1.0) {
  const start = (t0 * SR) | 0, len = (0.2 * SR) | 0
  let s = (t0 * 1e4) | 0
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1 }
  for (let i = 0; i < len; i++) {
    const tt = i / SR
    const env = Math.exp(-tt * 24) * Math.min(1, i / 200)
    const body = Math.sin(2 * Math.PI * 186 * tt) * 0.32 * Math.exp(-tt * 38)
    const n = rnd() * 0.5 * env
    add(start + i, (n * 0.8 + body) * vel, (n * 0.6 + body) * vel)
  }
}
function hat(t0, vel = 0.5, open = false) {
  const start = (t0 * SR) | 0, len = ((open ? 0.09 : 0.024) * SR) | 0
  let s = (t0 * 7919 + 13) | 0
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1 }
  for (let i = 0; i < len; i++) {
    const tt = i / SR
    const env = Math.exp(-tt * (open ? 36 : 210))
    const n = rnd()
    const hp = n - (i > 0 ? 0 : 0) // 近似高通：白噪直接用（高频能量已足）
    add(start + i, hp * 0.16 * vel * env, -hp * 0.16 * vel * env * -1)
  }
}
// ── 贝斯（正弦 sub + 锯齿泛音低通）──
let lp1 = 0
function bass(t0, midi, dur, vel = 0.5) {
  const f = note(midi), start = (t0 * SR) | 0, len = (dur * SR) | 0
  let lp = 0
  for (let i = 0; i < len; i++) {
    const tt = i / SR
    const env = Math.min(1, i / (SR * 0.02)) * Math.pow(Math.max(0, 1 - tt / dur), 0.6)
    const ph = (f * tt) % 1
    const saw = 2 * ph - 1
    lp += ((saw * 0.5) - lp) * 0.08                  // one-pole LP
    const s = (Math.sin(2 * Math.PI * f * tt) * 0.5 + lp * 0.4) * env * vel * 0.42
    add(start + i, s, s)
  }
}
// ── 铺底：3 失谐锯齿 + LP + 慢包络（比 v1 厚三倍）──
function pad2(t0, midis, dur, vel = 0.2) {
  const start = (t0 * SR) | 0, len = (dur * SR) | 0
  const atk = 0.9, rel = 1.2
  for (const m of midis) {
    const f = note(m)
    for (const det of [-0.006, 0, 0.007]) {
      let lp = 0, lp2 = 0
      for (let i = 0; i < len; i++) {
        const tt = i / SR
        const env = Math.min(1, tt / atk) * Math.pow(Math.max(0, Math.min(1, (dur - tt) / rel)), 0.8)
        if (env <= 0) continue
        const ph = (f * (1 + det) * tt) % 1
        lp += (((2 * ph - 1) * 0.5) - lp) * 0.055
        lp2 += (lp - lp2) * 0.22                      // 两级 LP 更柔
        const wob = 0.002 * Math.sin(2 * Math.PI * 0.19 * tt + m + det * 500)
        const s = Math.sin(2 * Math.PI * f * (1 + det + wob) * tt) * 0.45 + lp2
        add(start + i, s * env * vel * 0.075, s * env * vel * 0.085)
      }
    }
  }
}
// ── 拨弦琶音（v1 加厚）──
function pluck(t0, midi, dur, vel = 0.5, pan = 0) {
  const f = note(midi), start = (t0 * SR) | 0, len = (dur * SR) | 0
  for (let i = 0; i < len; i++) {
    const tt = i / SR, env = Math.exp(-tt * 3.4) * Math.min(1, i / 30)
    const s = (Math.sin(2 * Math.PI * f * tt)
      + Math.sin(2 * Math.PI * f * 2 * tt) * 0.4 * Math.exp(-tt * 5)
      + Math.sin(2 * Math.PI * f * 3.01 * tt) * 0.16 * Math.exp(-tt * 8)) * env * vel * 0.24
    add(start + i, s * (1 - Math.max(0, pan)), s * (1 + Math.min(0, pan)))
  }
}
// ── 风铃 ──
function chime(t0, midi, vel = 0.3, rev = true) {
  const f = note(midi), start = (t0 * SR) | 0, len = (2.2 * SR) | 0
  for (let i = 0; i < len; i++) {
    const tt = i / SR
    const s = (Math.sin(2 * Math.PI * f * tt) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * tt)
      + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * tt)) * Math.exp(-tt * 3.2) * vel * 0.15
    add(start + i, s * 0.8, s)
  }
}
// ── whoosh（幕间噪声扫频）──
function whoosh(t0, dur = 0.9) {
  const start = (t0 * SR) | 0, len = (dur * SR) | 0
  let s = 991
  let bp = 0
  for (let i = 0; i < len; i++) {
    const tt = i / SR, k = i / len
    const env = Math.sin(Math.PI * k) ** 2
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const n = (s / 0x3fffffff - 1)
    const f = 400 + 2600 * k                          // band 中心上扫
    bp += ((n - bp) * (2 * Math.PI * f / SR))         // 近似 bandpass
    const out = (n - bp) * env * 0.2
    add(start + i, out, -out * 0.9)
  }
}
// ── tick（翻牌）──
function tick(t0, vel = 0.4) {
  const start = (t0 * SR) | 0, len = (0.05 * SR) | 0
  let s = (t0 * 7717 + 5) | 0
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const env = Math.exp(-i / SR * 240)
    add(start + i, (s / 0x3fffffff - 1) * 0.18 * vel * env, (s / 0x3fffffff - 1) * 0.14 * vel * env)
  }
}

// ── 编曲 ──
const CH = {
  F:  { b: 29, p: [53, 57, 60, 65] },
  Dm: { b: 26, p: [50, 53, 57, 62] },
  Bb: { b: 22, p: [46, 53, 58, 62] },
  C:  { b: 24, p: [48, 55, 60, 64] },
}
const PROG = ['F','F','Dm','Dm','Bb','Bb','C','C','F','Dm','Bb','C','F','F','Bb','C','F','Dm','Bb','C']
const PENT = [65, 67, 69, 72, 74, 77, 79, 81, 84, 86]

const T_BEAT = 4.56      // 鼓组进入（M2）
const T_FULL = 16.0      // 全奏（M4）
const T_HALF = 29.0      // 降半（M6）
const T_BACK = 34.5      // 恢复（M7）
const T_OUT  = 46.0      // 鼓停（M9）
const T_END  = 50.0      // 尾声（M10）

for (let bar = 0; bar < PROG.length; bar++) {
  const t0 = bar * BAR
  if (t0 > DUR) break
  const ch = CH[PROG[bar]]
  const tRemain = DUR - t0
  pad2(t0, ch.p, Math.min(BAR * 1.02, tRemain), t0 < 1 ? 0.12 : 0.2)
  // 贝斯：从 M2 起
  if (t0 >= T_BEAT && t0 < T_OUT) {
    bass(t0, ch.b, BEAT * 1.8, 0.55)
    bass(t0 + BEAT * 2, ch.b, BEAT * 1.6, 0.4)
  }
  // 琶音：M3(11s) 起十六分
  if (t0 >= 11.0 && t0 < T_OUT) {
    const root = ch.p[0]
    for (let e = 0; e < 16; e++) {
      const tt = t0 + e * BEAT / 4
      if (tt > DUR - 0.4) break
      const seq = [0, 2, 1, 3, 2, 4, 3, 2, 4, 3, 2, 5, 3, 2, 1, 0]
      let m = root + [0, 4, 7, 12][seq[e] % 4] + (seq[e] >= 4 ? 12 : 0)
      let best = PENT[0]
      for (const p of PENT) if (Math.abs(p - m) < Math.abs(best - m)) best = p
      const vel = (e % 4 === 0 ? 0.5 : e % 2 === 0 ? 0.34 : 0.24)
      pluck(tt, best, 1.0, vel * (t0 >= T_HALF && t0 < T_BACK ? 0.7 : 1), ((e % 3) - 1) * 0.6)
    }
  }
  // 鼓组
  if (t0 >= T_BEAT && t0 < T_OUT) {
    const full = t0 >= T_FULL || t0 >= T_BACK, half = t0 >= T_HALF && t0 < T_BACK
    for (let b = 0; b < 4; b++) {
      const tt = t0 + b * BEAT
      kick(tt, 0.9)
      if (!half) { hat(tt + BEAT / 2, 0.4); hat(tt, 0.24) }
      else hat(tt, 0.2)
      if (full && (b === 1 || b === 3)) snare(tt, 0.55)
    }
    if (full) hat(t0 + BAR - BEAT / 4, 0.3, true)   // 小节尾开镲
  }
}
// 幕间 whoosh
for (const w of [4.3, 15.8, 28.8, 40.8, 49.7]) whoosh(w)
// 翻牌 tick（M6 内 29.8-33.6）
for (let t = 29.9; t < 33.7; t += 0.62) tick(t, 0.5)
// M7 sparkle 上行簇
{ let i = 0
  for (const m of [77, 79, 81, 84, 86, 89]) { chime(34.6 + i * 0.34, m, 0.26); i++ } }
// M1 intro 三音 & 尾声
pluck(0.6, 77, 2.4, 0.4, -0.3); pluck(2.0, 72, 2.4, 0.34, 0.3); pluck(3.4, 69, 2.6, 0.38, 0)
chime(T_END + 0.2, 89, 0.34); chime(T_END + 0.9, 84, 0.3); chime(T_END + 1.5, 77, 0.3)

// ── Schroeder 混响（wet 总线）──
function reverb(mix = 0.22) {
  const combs = [[1117, 0.80], [1277, 0.78], [1397, 0.76], [1147, 0.82]]
  const aps = [[225, 0.5], [231, 0.5], [353, 0.5]]
  const cbuf = combs.map(() => new Float32Array(0))
  const cidx = new Array(combs.length).fill(0)
  const abuf = aps.map(() => new Float32Array(0))
  const aidx = new Array(aps.length).fill(0)
  const WL = new Float64Array(N), WR = new Float64Array(N)
  for (let ch = 0; ch < 2; ch++) {
    const src = ch === 0 ? L : R, dst = ch === 0 ? WL : WR
    for (let ci = 0; ci < combs.length; ci++) {
      cbuf[ci] = new Float32Array(combs[ci][0]); cidx[ci] = 0
      const buf = cbuf[ci], fb = combs[ci][1], len = combs[ci][0]
      for (let i = 0; i < N; i++) {
        const y = buf[cidx[ci]]
        buf[cidx[ci]] = src[i] * 0.28 + y * fb
        if (++cidx[ci] >= len) cidx[ci] = 0
        dst[i] += y
      }
    }
    let lastA = 0
    for (let ai = 0; ai < aps.length; ai++) {
      abuf[ai] = new Float32Array(aps[ai][0]); aidx[ai] = 0
      const buf = abuf[ai], len = aps[ai][0]
      for (let i = 0; i < N; i++) {
        const x = dst[i], y = buf[aidx[ai]]
        buf[aidx[ai]] = x + y * 0.5
        if (++aidx[ai] >= len) aidx[ai] = 0
        dst[i] = y - x * 0.5
      }
    }
  }
  for (let i = 0; i < N; i++) {
    L[i] = L[i] * (1 - mix) + WL[i] * mix * 2.6
    R[i] = R[i] * (1 - mix) + WR[i] * mix * 2.6
  }
}
reverb(0.2)

// ── 母带：soft clip + normalize ──
let peak = 0
for (let i = 0; i < N; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])) }
const g = 0.9 / peak
const clip = (x) => Math.tanh(x * 1.4) / Math.tanh(1.4)
const bytes = Buffer.alloc(44 + N * 4)
bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + N * 4, 4); bytes.write('WAVEfmt ', 8)
bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22)
bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 4, 28); bytes.writeUInt16LE(4, 32)
bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, (DUR - t) / 2.0)
  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clip(L[i] * g) * fade * 32767))), 44 + i * 4)
  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clip(R[i] * g) * fade * 32767))), 46 + i * 4)
}
writeFileSync(process.argv[2] ?? 'artifacts/films/tt-theme-v2.wav', bytes)
console.log('WAV v2 OK', DUR + 's', 'pre-peak', peak.toFixed(2), 'gain', g.toFixed(2))
