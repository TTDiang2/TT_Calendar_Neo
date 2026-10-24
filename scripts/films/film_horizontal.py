# -*- coding: utf-8 -*-
"""
film_horizontal.py — TT 日历 · 横屏宣传片（1920×1080 @30fps，36.0s）
同样四幕，横版构图：月历居左、文案居右 → 年份花园全景 → 倒数卡 → 居中收尾。
配乐同一首（76BPM），画面节拍对齐。
用法: python film_horizontal.py [前N帧]  → artifacts/films/tt-horizontal-1920x1080.mp4
"""
import math, sys, subprocess
from PIL import Image
from film_engine import (Film, Track, INK, MUTED, AMBER, GREEN, PURPLE, PINK,
                         linear, outq, outback, outelastic, inq, clamp01, mix, mixc)

W, H, FPS, DUR = 1920, 1080, 30, 36.0

CELL_COLORS = [2, 1, 2, 0, 2, 1, 2,
               2, 0, 1, 2, 1, 2, 0,
               1, 2, 0, 2, 3, 2, 1,
               2, 1, 2, 0, 2, 2, 3,
               0, 2, 1, 2, 0, 2, 1]
PALETTE = {0: (226, 232, 240), 1: AMBER, 2: GREEN, 3: PURPLE}
GARDEN_FILL = [2, 1, 2, 1, 2, 3, 2, 1, 2, 2, 0, 1, 2, 1, 3, 2, 1, 2, 2, 1, 0, 2, 2, 1, 3, 2, 1, 2, 1, 2, 0, 2, 2, 1, 2]

f = Film(W, H)

# ── 布局：月历左，文案右 ──
COLS, ROWS = 7, 5
CELL_R, GAP_X, GAP_Y = 50, 122, 116
GRID_CX, GRID_TOP = 560, 400
def month_pos(i):
    return (GRID_CX + (i % COLS - 3) * GAP_X, GRID_TOP + (i // COLS) * GAP_Y)
G_COLS, G_R, G_GAP = 6, 11, 26
G_LEFT, G_TOP, G_PITCH_X, G_PITCH_Y = 240, 330, 300, 210
def garden_color(mi, ci):
    if (mi * 7 + ci * 13) % 11 == 0:
        return 0
    return [1, 2, 2, 3, 2][(mi * 5 + ci * 3) % 5]

def garden_pos(mi, ci):
    gx = G_LEFT + (mi % G_COLS) * G_PITCH_X + G_PITCH_X * 0.5 - G_GAP * 3
    gy = G_TOP + (mi // G_COLS) * G_PITCH_Y
    return (gx + (ci % COLS - 3) * G_GAP, gy + (ci // COLS) * G_GAP)
RIGHT_CX = 1470  # 右侧文案轴

# ── 时间轴 ──
POP_T0, POP_STAG = 6.42, 0.09
COLOR_T0, COLOR_STAG = 9.8, 0.18
MORPH = Track([(15.8, 0), (18.0, 1, outq)])
GARDEN_T0, GARDEN_STAG = 18.2, 0.028
CARD = Track([(21.8, 0, outback), (22.5, 1)])
CARD_OUT = Track([(26.8, 1), (27.7, 0, outq)])
FADE_ALL = Track([(26.8, 1), (28.2, 0, outq)])
HERO = Track([(28.2, 0, outback), (29.0, 1)])
HERO_OUT = Track([(31.0, 1), (31.8, 0, outq)])
LOGO_T = 31.6
END = Track([(31.8, 0, outq), (32.6, 1)])

def pop_k(i, t):
    k = (t - (POP_T0 + i * POP_STAG)) / 0.5
    return outback(clamp01(k)) if k > 0 else 0.0

def color_k(i, t):
    if CELL_COLORS[i] == 0: return 0.0
    k = (t - (COLOR_T0 + i * COLOR_STAG)) / 0.45
    return outelastic(clamp01(k)) if k > 0 else 0.0

def garden_k(mi, ci, t):
    k = (t - (GARDEN_T0 + (mi * COLS + ci) * GARDEN_STAG)) / 0.4
    return outback(clamp01(k)) if k > 0 else 0.0

def petals(img, t, y_center, n=14, seed_phase=0):
    for p in range(n):
        ph = p * 2.399 + seed_phase
        x = (0.5 + 0.42 * math.sin(ph * 1.7 + t * 0.31)) * W
        y = y_center + ((t * (46 + 18 * math.sin(ph)) + p * 137) % (H + 200)) - 100
        col = [PINK, AMBER, PURPLE, GREEN][p % 4]
        f.petal(img, x, y, 16 + 7 * math.sin(ph), col, ph + t * 0.6, 0.34)

def frame(t):
    img = f.base()
    bl = f.blobs(t, [PINK, (165, 200, 255), GREEN, (216, 180, 254)])
    bl.putalpha(bl.getchannel('A').point(lambda a: int(a * 0.5)))
    img.alpha_composite(bl)

    # ── 幕1：提问（全屏居中）──
    a1 = Track([(0.7, 0, outq), (1.4, 1)]).sample(t) * Track([(4.9, 1), (5.9, 0, inq)]).sample(t)
    a2 = Track([(2.3, 0, outq), (3.0, 1)]).sample(t) * Track([(4.9, 1), (5.9, 0, inq)]).sample(t)
    if a1 > 0:
        f.draw_text(img, '一年 365 天', W/2, H*0.38 + (1-a1)*30, 120, INK, kai=True, alpha=a1)
    if a2 > 0:
        f.draw_text(img, '你记得几天？', W/2, H*0.38 + 180 + (1-a2)*26, 96, (120, 100, 80), kai=True, alpha=a2)
    if t < 6.0: petals(img, t, -60, 12, 1.3)

    # ── 幕2：月历（左）+ 右侧竖排文案 ──
    grid_a = 1.0 - MORPH.sample(t)
    if grid_a > 0.01:
        for i in range(35):
            x0, y0 = month_pos(i)
            gx, gy = garden_pos(0, i)
            x = mix(x0, gx, MORPH.sample(t)); y = mix(y0, gy, MORPH.sample(t))
            r = CELL_R * (1 - MORPH.sample(t) * 0.72)
            k = max(pop_k(i, t), 0.25) if t > POP_T0 else 0.0
            ck = color_k(i, t)
            col = mixc(PALETTE[0], PALETTE[CELL_COLORS[i]], ck) if CELL_COLORS[i] else PALETTE[0]
            vis_k = k if ck <= 0 else max(k, 0.2 + 0.8 * ck)
            f.cell(img, x, y, r * (1 + 0.12 * max(0, ck - 0.5) * 2), col,
                   vis_k * grid_a, alpha=grid_a)
            if ck > 0.6 and (i % 5 == 0):
                f.petal(img, x, y - r, 13, PALETTE[CELL_COLORS[i]], t * 2 + i, 0.4 * grid_a)
    lg = Track([(10.1, 0, outq), (10.9, 1)]).sample(t) * (1 - MORPH.sample(t))
    if lg > 0:
        f.draw_text(img, '忙是暖黄', RIGHT_CX, H*0.30, 64, AMBER, alpha=lg)
        f.draw_text(img, '沉淀是绿', RIGHT_CX, H*0.30 + 92, 64, GREEN, alpha=lg * Track([(10.5,0),(11.1,1,outq)]).sample(t))
        f.draw_text(img, '纪念是紫', RIGHT_CX, H*0.30 + 184, 64, PURPLE, alpha=lg * Track([(10.9,0),(11.5,1,outq)]).sample(t))
        f.draw_text(img, '一天一格，把日子染上颜色', RIGHT_CX, H*0.30 + 300, 42, MUTED, bold=False,
                    alpha=lg * Track([(11.6,0),(12.3,1,outq)]).sample(t))

    # ── 幕3a：年份花园（全景横铺）──
    garden_vis = MORPH.sample(t) * FADE_ALL.sample(t) * (1 - 0.5 * CARD.sample(t))
    for mi in range(12):
        for ci in range(35):
            k = garden_k(mi, ci, t) * MORPH.sample(t)
            if k > 0.01:
                x, y = garden_pos(mi, ci)
                col = PALETTE[garden_color(mi, ci)]
                f.cell(img, x, y, G_R, col, k, alpha=0.95 * garden_vis)
    ga = MORPH.sample(t) * Track([(19.4, 0, outq), (20.1, 1)]).sample(t) * (1 - CARD.sample(t)) * 1.0
    if ga > 0.01:
        f.draw_text(img, '一整年，长成一座花园', W/2, 150 + (1-MORPH.sample(t))*40, 62, INK, alpha=ga)
    st = Track([(20.6, 0, outback), (21.2, 1)]).sample(t) * FADE_ALL.sample(t) * CARD_OUT.sample(t)
    if st > 0.01:
        f.card(img, (W/2-270, 880, W/2+270, 990), 55)
        f.draw_text(img, '连续记录 17 天', W/2, 935, 52, GREEN, alpha=st)

    # ── 幕3b：倒数卡（右侧）──
    ck_ = CARD.sample(t) * CARD_OUT.sample(t)
    if ck_ > 0.01:
        cy = H*0.52 + (1-CARD.sample(t))*100
        a = min(1.0, ck_ * 2)
        f.card(img, (RIGHT_CX-300, cy-190, RIGHT_CX+300, cy+190), 60)
        f.draw_text(img, '距离期中考试', RIGHT_CX, cy-104, 48, MUTED, bold=False, alpha=a)
        n = int(47 - 2 * clamp01((t - 22.6) / 1.1))
        f.draw_text(img, f'{n}', RIGHT_CX - 38, cy+22, 170, PINK, alpha=a)
        f.draw_text(img, '天', RIGHT_CX + 118, cy+52, 64, INK, alpha=a)
        f.draw_text(img, '重要的日子，开始倒数', RIGHT_CX, cy+128, 42, MUTED, bold=False,
                    alpha=a*Track([(23.2,0),(23.8,1,outq)]).sample(t))

    # ── 幕4：口号 + 结尾（居中）──
    ha = HERO.sample(t) * HERO_OUT.sample(t)
    if ha > 0.01:
        f.draw_text(img, '坚持，看得见', W/2, H*0.42, 140, INK, kai=True, alpha=ha, scale=0.9 + 0.1*ha)
        f.draw_text(img, '每一天的努力，都值得被看见', W/2, H*0.42 + 140, 50, (150, 135, 110), bold=False, kai=True,
                    alpha=ha*Track([(29.2,0),(29.9,1,outq)]).sample(t))
    ea = END.sample(t)
    if ea > 0.01:
        glow = 0.5 + 0.5 * math.sin(t * 2.4)
        lg_img = f.logo(280, glow=0.35 + 0.25 * glow)
        lg_img = lg_img.copy(); lg_img.putalpha(lg_img.getchannel('A').point(lambda v: int(v * ea)))
        img.alpha_composite(lg_img, (int(W/2 - lg_img.width/2), int(H*0.33 - lg_img.height/2)))
        f.draw_text(img, 'TT 日历', W/2, H*0.68, 92, INK, alpha=ea)
        f.draw_text(img, '染色月历 · 待办 · 倒数日', W/2, H*0.68 + 96, 44, MUTED, bold=False,
                    alpha=ea * Track([(33.0,0),(33.6,1,outq)]).sample(t))
        f.draw_text(img, 'App Store 搜索「TT日历」', W/2, H*0.68 + 178, 44, PINK,
                    alpha=ea * Track([(33.8,0),(34.4,1,outq)]).sample(t))
    if t > 31.5: petals(img, t, -40, 10, 4.2)

    f.filmic(img, int(t * FPS))
    return img

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else int(DUR * FPS)
    import os
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, 'artifacts', 'films', 'tt-horizontal-1920x1080.mp4')
    wav = os.path.join(root, 'artifacts', 'films', 'tt-theme.wav')
    errlog = open(os.path.join(root, 'artifacts', 'films', 'ffmpeg-horizontal.log'), 'w')
    cmd = ['ffmpeg', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-s', f'{W}x{H}',
           '-pix_fmt', 'rgb24', '-r', str(FPS), '-i', '-', '-i', wav,
           '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-profile:v', 'high',
           '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=errlog)
    import time
    t0 = time.time()
    for i in range(limit):
        img = frame(i / FPS)
        proc.stdin.write(img.convert('RGB').tobytes())
        if i % 120 == 0:
            print(f'frame {i}/{limit}  {time.time()-t0:.0f}s', flush=True)
    proc.stdin.close(); proc.wait()
    print('DONE', out, f'{time.time()-t0:.0f}s')

if __name__ == '__main__':
    main()
