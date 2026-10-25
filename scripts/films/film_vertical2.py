# -*- coding: utf-8 -*-
"""
film_vertical2.py — TT 日历全功能宣传片 · 竖屏 1080×1920 @30fps 51s
十幕（真实 UI 截图为骨架 + 代码动效包装），节点对齐 tt-theme-v2.wav：
whoosh 4.3/15.8/28.8/40.8/49.7 · 鼓进4.56 · 琶音11 · 全奏16 · 降半29 · 恢复34.5 · 鼓停46 · 尾声50
"""
import math, sys, subprocess, os
from PIL import Image
from film_engine import (Film, Track, INK, MUTED, AMBER, GREEN, PURPLE, PINK, BLUE,
                         linear, outq, outback, outelastic, inq, clamp01, mix, mixc)

W, H, FPS, DUR = 1080, 1920, 30, 51.0
DEV = r'E:\TT_Calendar_Neo\artifacts\preview\device'
CROPS = r'E:\TT_Calendar_Neo\artifacts\preview\crops'
SHOT_W = 600
SHOT_CY = 1010

f = Film(W, H)

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

def shot_slide(img, path, t, t_in, t_out, label, sub=None, from_dx=340):
    """截图滑入-停留-滑出 + 标签。"""
    ain = outback(clamp01((t - t_in) / 0.55))
    aout = 1 - outq(clamp01((t - (t_out - 0.35)) / 0.35)) if t_out else 1.0
    a = min(ain, aout)
    if a > 0.01:
        dx = (1 - ain) * from_dx
        f.phone_shot(img, path, W / 2, SHOT_CY, SHOT_W, alpha=a, dx=dx)
    la = fade_in(t, t_in + 0.3) * aout
    if la > 0.01:
        f.draw_text(img, label, W / 2, 250, 74, INK, alpha=la)
        if sub:
            f.draw_text(img, sub, W / 2, 345, 46, MUTED, bold=False,
                        alpha=la * fade_in(t, t_in + 0.55))

def frame(t):
    img = f.base()
    bl = f.blobs(t, [PINK, (165, 200, 255), GREEN, (216, 180, 254)])
    img.alpha_composite(bl)

    # ── M1 开场 0-4.56 ──
    a1 = fade_in(t, 0.6, 0.7) * fade_out(t, 4.4)
    if a1 > 0:
        f.draw_text(img, '你的一天', W / 2, H * 0.32, 130, INK, kai=True, alpha=a1)
        f.draw_text(img, '值得被看见', W / 2, H * 0.32 + 170, 130, INK, kai=True,
                    alpha=a1 * fade_in(t, 1.3, 0.7))
        f.draw_text(img, 'TT 日历 · 不只是日历', W / 2, H * 0.32 + 360, 48, MUTED, bold=False,
                    alpha=a1 * fade_in(t, 2.2))
    if t < 4.6: petals(img, t, 12, 1.3)

    # ── M2 染色月历 4.56-11 ──
    if 4.4 <= t < 11.2:
        ain = outback(clamp01((t - 4.56) / 0.6))
        aout = fade_out(t, 11.05, 0.3)
        f.phone_shot(img, f'{DEV}/01-月视图.png', W / 2, SHOT_CY, SHOT_W,
                     alpha=ain * aout, dx=(1 - ain) * 300)
        f.draw_text(img, '染色月历', W / 2, 230, 76, INK,
                    alpha=ain * aout * fade_in(t, 5.1))
        legend = [('忙 · 暖黄', AMBER, 5.6), ('沉淀 · 绿', GREEN, 6.1), ('纪念 · 紫', PURPLE, 6.6)]
        for i, (txt, col, t0) in enumerate(legend):
            k = outback(clamp01((t - t0) / 0.4)) * aout
            if k > 0.01:
                gx = W / 2 + (i - 1) * 340
                f.cell(img, gx - 130, 1748, 24, col, k)
                f.draw_text(img, txt, gx + 55, 1748, 40, INK, bold=False,
                            alpha=clamp01((t - t0) / 0.3) * aout)

    # ── M3 年视图 11-16 ──
    if 10.8 <= t < 16.2:
        ain = outback(clamp01((t - 11.1) / 0.55))
        aout = fade_out(t, 15.85, 0.3)
        f.phone_shot(img, f'{DEV}/02-年视图.png', W / 2, SHOT_CY, SHOT_W,
                     alpha=ain * aout, dx=-(1 - ain) * 300)
        f.draw_text(img, '十二个月，一眼看尽', W / 2, 230, 68, INK,
                    alpha=ain * aout * fade_in(t, 11.6))
        f.draw_text(img, '每一格，都是你真实度过的一天', W / 2, 320, 44, MUTED, bold=False,
                    alpha=ain * aout * fade_in(t, 12.1))

    # ── M4 待办三连 16-24 ──
    if 15.8 <= t < 24.2:
        f.draw_text(img, '待办：先做真正要紧的事', W / 2, 215, 68, INK,
                    alpha=fade_in(t, 16.1) * fade_out(t, 24.1))
        segs = [
            (16.3, 19.3, f'{DEV}/04-待办列表.png', '列表 · 截止/计划/重要性三轴排序', 17.2),
            (19.3, 22.3, f'{DEV}/05-待办矩阵.png', '四象限 · 重要性 × 紧急度', 20.2),
            (22.3, 24.2, f'{DEV}/06-待办便签.png', '便签 · 墙上一目了然', 23.0),
        ]
        for t_in, t_out, path, label, t_stamp in segs:
            ain = outback(clamp01((t - t_in) / 0.45))
            aout = 1 - outq(clamp01((t - (t_out - 0.3)) / 0.3))
            a = min(ain, aout)
            if a > 0.01:
                f.phone_shot(img, path, W / 2, SHOT_CY + 40, SHOT_W - 40, alpha=a,
                             dx=(1 - ain) * 280)
                f.draw_text(img, label, W / 2, 1750, 48, MUTED, bold=False,
                            alpha=a * fade_in(t, t_in + 0.35))
                sk = outelastic(clamp01((t - t_stamp) / 0.5))
                f.stamp_check(img, 798, 612, sk, GREEN, r=54)

    # ── M5 提醒与重复 24-29 ──
    if 23.8 <= t < 29.2:
        bg = fade_in(t, 24.1) * fade_out(t, 29.1)
        if bg > 0.01:
            f.phone_shot(img, f'{DEV}/04-待办列表.png', W / 2, SHOT_CY, SHOT_W - 120,
                         alpha=0.22 * bg)
            n1 = outback(clamp01((t - 24.6) / 0.5))
            n2 = outback(clamp01((t - 26.2) / 0.5))
            f.notify_banner(img, W / 2, 560, bg * min(1, n1), '闹钟提醒',
                            '「复习线性代数」到点了', k=n1)
            f.notify_banner(img, W / 2, 730, bg * min(1, n2) * 0.9, '重复待办',
                            '每周跑步 · 完成后自动排下一期', k=n2)
            f.draw_text(img, '到点必达 · 循环不息', W / 2, 1760, 56, INK,
                        alpha=bg * fade_in(t, 27.2))

    # ── M6 倒数日 29-34.5 ──
    if 28.8 <= t < 34.7:
        ain = outback(clamp01((t - 29.1) / 0.55))
        aout = fade_out(t, 34.4, 0.35)
        f.phone_shot(img, f'{DEV}/09-倒数日.png', W / 2 - 170, SHOT_CY, SHOT_W - 140,
                     alpha=ain * aout, dx=-(1 - ain) * 260)
        ck = outback(clamp01((t - 29.6) / 0.5)) * fade_out(t, 34.5)
        if ck > 0.01:
            cx, cy = W / 2 + 265, SHOT_CY - 60
            f.card(img, (cx - 200, cy - 190, cx + 200, cy + 190), 56)
            f.draw_text(img, '距离发布', cx, cy - 120, 44, MUTED, bold=False, alpha=ck)
            n = int(round(47 - 7 * clamp01((t - 29.9) / (4.34 - 0.62))))
            f.draw_text(img, f'{n}', cx - 30, cy + 10, 190, PINK, alpha=ck)
            f.draw_text(img, '天', cx + 110, cy + 46, 64, INK, alpha=ck)
            f.draw_text(img, '重要的日子，开始倒数', W / 2, 300, 62, INK,
                        alpha=ck * fade_in(t, 30.4))

    # ── M7 洞察 34.5-41 ──
    if 34.3 <= t < 41.2:
        ain = outback(clamp01((t - 34.6) / 0.55))
        aout = fade_out(t, 41.0, 0.3)
        f.phone_shot(img, f'{DEV}/08-分析页面.png', W / 2, SHOT_CY, SHOT_W - 40,
                     alpha=ain * aout, dx=(1 - ain) * 260)
        f.draw_text(img, '26 周热力 · 看见坚持', W / 2, 300, 62, INK,
                    alpha=ain * aout * fade_in(t, 35.4))
        sk = outback(clamp01((t - 36.4) / 0.5)) * fade_out(t, 41.0)
        if sk > 0.01:
            f.card(img, (W / 2 - 260, 1560, W / 2 + 260, 1680), 60)
            f.draw_text(img, '连续记录 17 天', W / 2, 1620, 54, GREEN, alpha=sk)

    # ── M8 小组件 41-46 ──
    if 40.8 <= t < 46.2:
        s1 = fade_in(t, 41.1) * (1 - outq(clamp01((t - 43.3) / 0.3)))
        s2 = fade_in(t, 43.5) * fade_out(t, 46.1)
        wa = max(fade_in(t, 41.6), s2) * fade_out(t, 46.0, 0.3)
        if s1 > 0.01:
            f.phone_shot(img, f'{DEV}/10-小组件1.png', W / 2, SHOT_CY, SHOT_W, alpha=s1,
                         dx=(1 - outback(clamp01((t - 41.1) / 0.5))) * 280)
        if s2 > 0.01:
            f.phone_shot(img, f'{DEV}/11-小组件2.png', W / 2, SHOT_CY, SHOT_W, alpha=s2,
                         dx=-(1 - outback(clamp01((t - 43.5) / 0.5))) * 280)
        if wa > 0.01:
            f.draw_text(img, '桌面小组件', W / 2, 220, 68, INK, alpha=wa)
            f.draw_text(img, '今日待办 · 倒数日 · 完成热力 · 一键打卡', W / 2, 1760, 44, MUTED,
                        bold=False, alpha=wa * fade_in(t, 42.0))
            for wname, k0, x, y, rot, sc in [
                    ('w-heat.png', 41.9, 350, 520, -4, 0.46), ('w-onetap.png', 42.4, 790, 480, 3, 0.46),
                    ('w-cd.png', 42.9, 300, 1360, 3, 0.5)]:
                k = outback(clamp01((t - k0) / 0.45)) * wa
                if k > 0.01:
                    sp = Image.open(f'{CROPS}/{wname}').convert('RGBA')
                    sp = sp.resize((int(sp.width * sc * k) + 2, int(sp.height * sc * k) + 2), Image.BILINEAR)
                    if rot: sp = sp.rotate(rot, resample=Image.BICUBIC, expand=True)
                    img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height / 2)))

    # ── M9 快闪 46-48.6 ──
    if 45.9 <= t < 48.8:
        rows = [
            (46.15, '滴答清单 / Todoist 一键搬家', AMBER),
            (46.85, '8 种语言', GREEN),
            (47.55, '本地数据 · 无广告 · 无追踪', PURPLE),
        ]
        for i, (t0, txt, col) in enumerate(rows):
            a = outback(clamp01((t - t0) / 0.3)) * fade_out(t, 48.55, 0.3)
            if a > 0.01:
                y = 640 + i * 240
                f.cell(img, W / 2 - 360, y, 34, col, min(1, a * 1.4))
                f.draw_text(img, txt, W / 2 + 150, y, 58, INK, alpha=a)

    # ── M10 收束 48.6-51 ──
    ea = fade_in(t, 48.9, 0.6)
    if ea > 0.01:
        glow = 0.5 + 0.5 * math.sin(t * 2.4)
        lg_img = f.logo(260, glow=0.35 + 0.25 * glow)
        lg_img = lg_img.copy()
        lg_img.putalpha(lg_img.getchannel('A').point(lambda v: int(v * ea)))
        img.alpha_composite(lg_img, (int(W / 2 - lg_img.width / 2), int(H * 0.33 - lg_img.height / 2)))
        f.draw_text(img, '坚持，看得见', W / 2, H * 0.55, 110, INK, kai=True,
                    alpha=ea * fade_in(t, 49.4, 0.5))
        f.draw_text(img, 'App Store 搜索「TT日历」', W / 2, H * 0.55 + 150, 46, PINK,
                    alpha=ea * fade_in(t, 49.9, 0.5))
    if t > 48.5: petals(img, t, 10, 4.2)

    f.filmic(img, int(t * FPS))
    return img

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else int(DUR * FPS)
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, 'artifacts', 'films', 'tt-v2-vertical-1080x1920.mp4')
    wav = os.path.join(root, 'artifacts', 'films', 'tt-theme-v2.wav')
    errlog = open(os.path.join(root, 'artifacts', 'films', 'ffmpeg-v2v.log'), 'w')
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
        if i % 150 == 0:
            print(f'frame {i}/{limit}  {time.time()-t0:.0f}s', flush=True)
    proc.stdin.close(); proc.wait()
    print('DONE', out, f'{time.time()-t0:.0f}s')

if __name__ == '__main__':
    main()
