// TT 日历宣传短片配乐 —— 纯代码合成（无采样、无生成模型）
// 36.0s · 76 BPM · F 大调五声。结构对齐画面四幕：留白(2小节)→生长(4)→丰盛(4)→收束(2)
// 用法: node film_music.mjs <out.wav>
import { writeFileSync } from 'node:fs'

const SR = 44100
const DUR = 36.0
const BPM = 76
const BEAT = 60 / BPM // 0.7895s
const BAR = BEAT * 4 // 3.158s
const N = Math.floor(SR * DUR)

const L = new Float64Array(N), R = new Float64Array(N)
const note = (m) => 440 * Math.pow(2, (m - 69) / 12) // MIDI → Hz

// ── 音色 ─────────────────────────────────────────────
// 拨弦：正弦+泛音，指数衰减
function pluck(t0, midi, dur, vel = 0.5, pan = 0) {
  const f = note(midi), start = Math.floor(t0 * SR), len = Math.floor(dur * SR)
  for (let i = 0; i < len; i++) {
    const tt = i / SR, env = Math.exp(-tt * 3.2) * Math.min(1, i / 40)
    const s = (Math.sin(2 * Math.PI * f * tt)
      + Math.sin(2 * Math.PI * f * 2 * tt) * 0.35 * Math.exp(-tt * 6)
      + Math.sin(2 * Math.PI * f * 3.01 * tt) * 0.12 * Math.exp(-tt * 9)) * env * vel * 0.28
    const g = Math.exp(-i / (len * 0.9))
    const idx = start + i
    if (idx >= N) break
    L[idx] += s * (1 - Math.max(0, pan)) * g
    R[idx] += s * (1 + Math.min(0, pan)) * g
  }
}
// 铺底：失谐正弦对，慢起慢收
function pad(t0, midis, dur, vel = 0.16) {
  const start = Math.floor(t0 * SR), len = Math.floor(dur * SR)
  const atk = 1.1, rel = 1.6
  for (const m of midis) {
    const f = note(m)
    for (let i = 0; i < len; i++) {
      const tt = i / SR
      const env = Math.min(1, tt / atk) * Math.pow(Math.max(0, Math.min(1, (dur - tt) / rel)), 0.7)
      if (env <= 0) continue
      const wob = Math.sin(2 * Math.PI * 0.13 * tt + m) * 0.004
      const s = (Math.sin(2 * Math.PI * f * (tt + wob)) + Math.sin(2 * Math.PI * f * 1.003 * tt)) * 0.5 * env * vel * 0.22
      const idx = start + i
      if (idx >= N) break
      L[idx] += s * 0.62; R[idx] += s * 0.78
    }
  }
}
// 贝斯：正弦半音符
function bass(t0, midi, dur, vel = 0.4) {
  const f = note(midi), start = Math.floor(t0 * SR), len = Math.floor(dur * SR)
  for (let i = 0; i < len; i++) {
    const tt = i / SR
    const env = Math.min(1, i / (SR * 0.05)) * Math.pow(Math.max(0, Math.min(1, (dur - tt) / 0.2)), 0.5)
    const s = Math.sin(2 * Math.PI * f * tt) * env * vel * 0.3
    const idx = start + i
    if (idx >= N) break
    L[idx] += s; R[idx] += s
  }
}
// 风铃：高频正弦簇快衰减
function chime(t0, midi, vel = 0.3) {
  const f = note(midi), start = Math.floor(t0 * SR), len = Math.floor(1.8 * SR)
  for (let i = 0; i < len; i++) {
    const tt = i / SR
    const s = (Math.sin(2 * Math.PI * f * tt) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * tt)) * Math.exp(-tt * 4.5) * vel * 0.16
    const idx = start + i
    if (idx >= N) break
    L[idx] += s * 0.8; R[idx] += s
  }
}

// ── 和声：F / Dm / Bb / C（根音 MIDI：F3=53 Dm3=50 Bb2=46 C3=48）──
const CH = {
  F:  { bass: 41, pad: [53, 57, 60, 65] },   // F2 bass; F3 A3 C4 F4
  Dm: { bass: 38, pad: [50, 53, 57, 62] },   // D2;     D3 F3 A3 D4
  Bb: { bass: 34, pad: [46, 53, 58, 62] },   // Bb1;    Bb2 F3 Bb3 D4
  C:  { bass: 36, pad: [48, 55, 60, 64] },   // C2;     C3 G3 C4 E4
}
const PROG = ['F', 'F', 'Dm', 'Dm', 'Bb', 'Bb', 'C', 'C', 'F', 'Dm', 'Bb', 'C'] // 12 小节
const F_PENTA = [65, 67, 69, 72, 74, 77, 79, 81, 84] // F G A C D F G A C（F4 起）

// ── 编曲 ─────────────────────────────────────────────
for (let bar = 0; bar < PROG.length; bar++) {
  const t0 = bar * BAR
  const ch = CH[PROG[bar]]
  // 铺底贯穿全曲（第一小节更轻）
  pad(t0, ch.pad, BAR * 1.05, bar === 0 ? 0.1 : 0.16)
  // 贝斯从第 3 小节进（画面「开花」段）
  if (bar >= 2) {
    bass(t0, ch.bass, BEAT * 2.1, 0.42)
    bass(t0 + BEAT * 2, ch.bass, BEAT * 1.9, 0.3)
  }
  // 拨弦琶音：第 3 小节起，八分音符，五声音阶环绕和弦音
  if (bar >= 2) {
    const root = ch.pad[0]
    for (let e = 0; e < 8; e++) {
      const tt = t0 + e * BEAT / 2
      if (tt > DUR - 0.5) break
      // 模式：上行-回落，重拍用和弦根/三音
      const seq = [0, 2, 1, 3, 2, 4, 3, 2]
      let m = root + [0, 4, 7, 12][seq[e] % 4] + (seq[e] >= 4 ? 12 : 0)
      // 收进 F 五声音阶集合
      let best = F_PENTA[0]
      for (const p of F_PENTA) if (Math.abs(p - m) < Math.abs(best - m)) best = p
      const vel = (e % 2 === 0 ? 0.5 : 0.32) * (bar >= 8 ? 0.9 : 1)
      pluck(tt, best, 1.4, vel, ((e % 3) - 1) * 0.5)
    }
  }
  // 第 1-2 小节：留白里三颗单音（画面「提问」）
  if (bar === 0) {
    pluck(0.05, 77, 2.2, 0.4, -0.3)
    pluck(BEAT * 1.5, 72, 2.2, 0.34, 0.3)
    pluck(BEAT * 3, 69, 2.4, 0.36, 0)
  }
  // 段落风铃：第 5、9 小节首拍
  if (bar === 4 || bar === 8) chime(t0, bar === 8 ? 89 : 84, 0.32)
  if (bar === 10) { chime(t0, 89, 0.3); chime(t0 + BEAT * 2, 96, 0.24) } // 结尾高音铃
}

// ── 空气感噪声 + 母带 ────────────────────────────────
let seed = 7
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5
let peak = 0
for (let i = 0; i < N; i++) {
  const air = rnd() * 0.006
  const t = i / SR
  // 轻软底噪包络：段落间呼吸
  const breathe = 0.7 + 0.3 * Math.sin(2 * Math.PI * t / 9)
  let l = (L[i] + air * breathe), r = (R[i] + air * breathe)
  // 结尾 2.5s 淡出
  const fade = Math.min(1, (DUR - t) / 2.5)
  l *= fade; r *= fade
  L[i] = l; R[i] = r
  peak = Math.max(peak, Math.abs(l), Math.abs(r))
}
const gain = 0.86 / peak
// 16-bit WAV
const bytes = Buffer.alloc(44 + N * 4)
bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + N * 4, 4); bytes.write('WAVEfmt ', 8)
bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22)
bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 4, 28); bytes.writeUInt16LE(4, 32)
bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * gain * 32767))), 44 + i * 4)
  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * gain * 32767))), 46 + i * 4)
}
writeFileSync(process.argv[2] ?? 'artifacts/films/tt-theme.wav', bytes)
console.log('WAV OK', DUR + 's', 'peak', peak.toFixed(2), '→ gain', gain.toFixed(2))
