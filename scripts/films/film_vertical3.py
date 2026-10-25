# -*- coding: utf-8 -*-
"""
film_vertical3.py — v3 全功能 + 真实操作实录 · 竖屏 1080×1920 @60fps 54s
四段实录（CDP 驱动真机操作，60fps 预合成进手机框）：
  A 切视图(月日年倒数) / B 新建待办 / C 点掉待办 / D 统计页
pop 音效落点：B 添加@17.3 · C 点掉@18.0/19.8（与 tt-theme-v3.wav 对齐）
"""
import math, sys, subprocess, os, json
from PIL import Image
from film_engine import (Film, Track, INK, MUTED, AMBER, GREEN, PURPLE, PINK,
                         linear, outq, outback, outelastic, inq, clamp01, mix, mixc)

W, H, FPS, DUR = 1080, 1920, 60, 54.0
DEV = r'E:\TT_Calendar_Neo\artifacts\preview\device'
CROPS = r'E:\TT_Calendar_Neo\artifacts\preview\crops'
REC = r'E:\TT_Calendar_Neo\artifacts\films\rec'

f = Film(W, H)

# ── 实录段帧库 ──
class LiveSeg:
    def __init__(self, take, t0, t1, start=0.0):
        self.dir = os.path.join(REC, f'{take}-phone')
        self.n = len([x for x in os.listdir(self.dir) if x.endswith('.png')])
        self.t0, self.t1, self.start = t0, t1, start
        wj = os.path.join(self.dir, 'white.json')
        self.white = json.load(open(wj)) if os.path.exists(wj) else {}
        self.white = {int(k): v for k, v in self.white.items()}
    def frame_at(self, t):
        rel = self.start + (t - self.t0)          # 段内秒
        i = max(0, min(self.n - 1, int(rel * 60)))
        i = self.white.get(i, i)                  # 视图切换白屏帧 → 回退白屏前最后一帧
        return Image.open(os.path.join(self.dir, f'p{i:05d}.png'))

SEG = {
    'A': LiveSeg('A', 4.5, 10.9, start=2.0),
    'B': LiveSeg('B', 10.9, 17.5, start=4.2),
    'C': LiveSeg('C', 17.5, 23.0, start=0.2),
    'D': LiveSeg('D', 23.0, 28.8, start=1.0),
}

def phone_live(img, seg, t, alpha=1.0, dx=0.0, w=700):
    """实录帧贴入（预合成手机框图缩放到 w 宽，中心对齐）。"""
    if alpha <= 0.01: return
    fr = seg.frame_at(t)
    if fr.width != w:
        fr = fr.resize((w, int(fr.height * w / fr.width)), Image.BILINEAR)
    if alpha < 0.999:
        fr = fr.copy()
        fr.putalpha(fr.getchannel('A').point(lambda v: int(v * alpha)))
    img.alpha_composite(fr, (int(W / 2 + dx - fr.width / 2), int(H / 2 - fr.height / 2)))

def fade_in(t, t0, d=0.5):
    return outq(clamp01((t - t0) / d))
def fade_out(t, t1, d=0.4):
    return outq(clamp01((t1 - t) / d))

def petals(img, t, n=12, seed_phase=0, alpha=0.32):
    for p in range(n):
        ph = p * 2.399 + seed_phase
        x = (0.5 + 0.42 * math.sin(ph * 1.7 + t * 0.31)) * W
        y = ((t * (46 + 18 * math.sin(ph)) + p * 137) % (H + 200)) - 100
        col = [PINK, AMBER, PURPLE, GREEN][p % 4]
        f.petal(img, x, y, 16 + 7 * math.sin(ph), col, ph + t * 0.6, alpha)

def frame(t):
    img = f.base()
    bl = f.blobs(t, [PINK, (165, 200, 255), GREEN, (216, 180, 254)])
    img.alpha_composite(bl)

    # ── M1 钩子 0-4.5 ──
    a1 = fade_in(t, 0.6, 0.7) * fade_out(t, 4.3)
    if a1 > 0:
        f.draw_text(img, '你的一天', W / 2, H * 0.32, 130, INK, kai=True, alpha=a1)
        f.draw_text(img, '值得被看见', W / 2, H * 0.32 + 170, 130, INK, kai=True,
                    alpha=a1 * fade_in(t, 1.3, 0.7))
        f.draw_text(img, 'TT 日历 · 不只是日历', W / 2, H * 0.32 + 360, 48, MUTED, bold=False,
                    alpha=a1 * fade_in(t, 2.2))
    if t < 4.6: petals(img, t, 12, 1.3)

    # ── M2 实录A 切视图 4.5-10.9 ──
    if 4.3 <= t < 10.9:
        ain = outback(clamp01((t - 4.5) / 0.55))
        aout = fade_out(t, 10.7, 0.3)
        phone_live(img, SEG['A'], t, alpha=ain * aout, dx=(1 - ain) * 300)
        la = ain * aout * fade_in(t, 5.0)
        if la > 0:
            f.draw_text(img, '月 · 日 · 年 · 倒数', W / 2, 210, 72, INK, alpha=la)
            f.draw_text(img, '一个生活，四种看法', W / 2, 1810, 46, MUTED, bold=False,
                        alpha=la * fade_in(t, 5.6))

    # ── M3 实录B 新建待办 10.9-17.5 ──
    if 10.7 <= t < 17.5:
        ain = outback(clamp01((t - 10.9) / 0.55))
        aout = fade_out(t, 17.3, 0.3)
        phone_live(img, SEG['B'], t, alpha=ain * aout, dx=-(1 - ain) * 300)
        la = ain * aout * fade_in(t, 11.4)
        if la > 0:
            f.draw_text(img, '新建：想到就记下', W / 2, 210, 66, INK, alpha=la)
            f.draw_text(img, '截止 · 重要性，随手标好', W / 2, 1810, 44, MUTED, bold=False,
                        alpha=la * fade_in(t, 12.0))

    # ── M4 实录C 点掉待办 17.5-23.0 ──
    if 17.3 <= t < 23.0:
        ain = outback(clamp01((t - 17.5) / 0.55))
        aout = fade_out(t, 22.8, 0.3)
        phone_live(img, SEG['C'], t, alpha=ain * aout, dx=(1 - ain) * 300)
        la = ain * aout * fade_in(t, 18.0)
        if la > 0:
            f.draw_text(img, '点掉：一下一个', W / 2, 210, 72, INK, alpha=la)
            f.draw_text(img, '完成的爽感，看得见', W / 2, 1810, 46, GREEN, bold=False,
                        alpha=la * fade_in(t, 18.6))

    # ── M5 实录D 统计 23.0-28.8 ──
    if 22.8 <= t < 28.8:
        ain = outback(clamp01((t - 23.0) / 0.55))
        aout = fade_out(t, 28.6, 0.3)
        phone_live(img, SEG['D'], t, alpha=ain * aout, dx=-(1 - ain) * 300)
        la = ain * aout * fade_in(t, 23.5)
        if la > 0:
            f.draw_text(img, '26 周热力 · 日积月累', W / 2, 210, 66, INK, alpha=la)
            f.draw_text(img, '每点掉一条，图就亮一格', W / 2, 1810, 44, MUTED, bold=False,
                        alpha=la * fade_in(t, 24.1))

    # ── M6 提醒与重复 28.8-34.3（静态）──
    if 28.6 <= t < 34.3:
        bg = fade_in(t, 28.9) * fade_out(t, 34.2)
        if bg > 0.01:
            f.phone_shot(img, f'{DEV}/04-待办列表.png', W / 2, H / 2, 520, alpha=0.22 * bg)
            n1 = outback(clamp01((t - 29.4) / 0.5))
            n2 = outback(clamp01((t - 31.0) / 0.5))
            f.notify_banner(img, W / 2, 560, bg * min(1, n1), '闹钟提醒',
                            '「复习线性代数」到点了', k=n1)
            f.notify_banner(img, W / 2, 730, bg * min(1, n2) * 0.9, '重复待办',
                            '每周跑步 · 完成后自动排下一期', k=n2)
            f.draw_text(img, '到点必达 · 循环不息', W / 2, 1760, 56, INK,
                        alpha=bg * fade_in(t, 32.0))

    # ── M7 小组件 34.3-39.5（静态）──
    if 34.1 <= t < 39.5:
        s1 = fade_in(t, 34.4) * (1 - outq(clamp01((t - 36.6) / 0.3)))
        s2 = fade_in(t, 36.8) * fade_out(t, 39.4)
        wa = max(fade_in(t, 34.9), s2) * fade_out(t, 39.3, 0.3)
        if s1 > 0.01:
            f.phone_shot(img, f'{DEV}/10-小组件1.png', W / 2, H / 2, 600, alpha=s1,
                         dx=(1 - outback(clamp01((t - 34.4) / 0.5))) * 280)
        if s2 > 0.01:
            f.phone_shot(img, f'{DEV}/11-小组件2.png', W / 2, H / 2, 600, alpha=s2,
                         dx=-(1 - outback(clamp01((t - 36.8) / 0.5))) * 280)
        if wa > 0.01:
            f.draw_text(img, '桌面小组件', W / 2, 220, 68, INK, alpha=wa)
            f.draw_text(img, '今日待办 · 倒数日 · 完成热力 · 一键打卡', W / 2, 1760, 44, MUTED,
                        bold=False, alpha=wa * fade_in(t, 35.5))
            for wname, k0, x, y, rot, sc in [
                    ('w-heat.png', 35.2, 350, 520, -4, 0.46), ('w-onetap.png', 35.7, 790, 480, 3, 0.46),
                    ('w-cd.png', 36.2, 300, 1360, 3, 0.5)]:
                k = outback(clamp01((t - k0) / 0.45)) * wa
                if k > 0.01:
                    sp = Image.open(f'{CROPS}/{wname}').convert('RGBA')
                    sp = sp.resize((int(sp.width * sc * k) + 2, int(sp.height * sc * k) + 2), Image.BILINEAR)
                    if rot: sp = sp.rotate(rot, resample=Image.BICUBIC, expand=True)
                    img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height / 2)))

    # ── M8 倒数日 39.5-44.0（静态 + 翻牌卡）──
    if 39.3 <= t < 44.2:
        ain = outback(clamp01((t - 39.6) / 0.55))
        aout = fade_out(t, 43.9, 0.35)
        f.phone_shot(img, f'{DEV}/09-倒数日.png', W / 2 - 170, H / 2, 460,
                     alpha=ain * aout, dx=-(1 - ain) * 260)
        ck = outback(clamp01((t - 40.1) / 0.5)) * fade_out(t, 44.0)
        if ck > 0.01:
            cx, cy = W / 2 + 265, H / 2 - 60
            f.card(img, (cx - 200, cy - 190, cx + 200, cy + 190), 56)
            f.draw_text(img, '距离发布', cx, cy - 120, 44, MUTED, bold=False, alpha=ck)
            n = int(round(47 - 7 * clamp01((t - 40.4) / (3.4 - 0.62))))
            f.draw_text(img, f'{n}', cx - 30, cy + 10, 190, PINK, alpha=ck)
            f.draw_text(img, '天', cx + 110, cy + 46, 64, INK, alpha=ck)
            f.draw_text(img, '重要的日子，开始倒数', W / 2, 300, 62, INK,
                        alpha=ck * fade_in(t, 40.9))

    # ── M9 快闪 44.0-48.0 ──
    if 43.9 <= t < 48.2:
        rows = [
            (44.25, '滴答清单 / Todoist 一键搬家', AMBER),
            (44.95, '8 种语言', GREEN),
            (45.65, '本地数据 · 无广告 · 无追踪', PURPLE),
        ]
        for i, (t0, txt, col) in enumerate(rows):
            a = outback(clamp01((t - t0) / 0.3)) * fade_out(t, 47.95, 0.3)
            if a > 0.01:
                y = 640 + i * 240
                f.cell(img, W / 2 - 360, y, 34, col, min(1, a * 1.4))
                f.draw_text(img, txt, W / 2 + 150, y, 58, INK, alpha=a)

    # ── M10 收束 48.0-54 ──
    ea = fade_in(t, 48.4, 0.6)
    if ea > 0.01:
        glow = 0.5 + 0.5 * math.sin(t * 2.4)
        lg_img = f.logo(260, glow=0.35 + 0.25 * glow)
        lg_img = lg_img.copy()
        lg_img.putalpha(lg_img.getchannel('A').point(lambda v: int(v * ea)))
        img.alpha_composite(lg_img, (int(W / 2 - lg_img.width / 2), int(H * 0.33 - lg_img.height / 2)))
        f.draw_text(img, '坚持，看得见', W / 2, H * 0.55, 110, INK, kai=True,
                    alpha=ea * fade_in(t, 48.9, 0.5))
        f.draw_text(img, 'App Store 搜索「TT日历」', W / 2, H * 0.55 + 150, 46, PINK,
                    alpha=ea * fade_in(t, 49.4, 0.5))
    if t > 48.0: petals(img, t, 10, 4.2)

    f.filmic(img, int(t * FPS))
    return img

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else int(DUR * FPS)
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, 'artifacts', 'films', 'tt-v3-vertical-1080x1920.mp4')
    wav = os.path.join(root, 'artifacts', 'films', 'tt-theme-v3.wav')
    errlog = open(os.path.join(root, 'artifacts', 'films', 'ffmpeg-v3v.log'), 'w')
    cmd = ['ffmpeg', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-s', f'{W}x{H}',
           '-pix_fmt', 'rgb24', '-r', str(FPS), '-i', '-', '-i', wav,
           '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-profile:v', 'high',
           '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=errlog)
    import time
    t0 = time.time()
    for i in range(limit):
        proc.stdin.write(frame(i / FPS).convert('RGB').tobytes())
        if i % 300 == 0:
            print(f'frame {i}/{limit}  {time.time()-t0:.0f}s', flush=True)
    proc.stdin.close(); proc.wait()
    print('DONE', out, f'{time.time()-t0:.0f}s')

if __name__ == '__main__':
    main()
