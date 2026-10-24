# -*- coding: utf-8 -*-
"""
film_vertical.py — TT 日历 · 小红书竖屏宣传片（1080×1920 @30fps，36.0s）
四幕：提问(0-6.3) → 生长(6.3-15.5) → 丰盛(15.5-27) → 收束(27-36)
配乐 76BPM：开花与拨弦琶音对拍（第3小节起），结尾风铃落点对齐 logo 亮起。
用法: python film_vertical.py [前N帧]   → artifacts/films/tt-vertical-1080x1920.mp4
"""
import math, sys, subprocess
from PIL import Image
from film_engine import (Film, Track, INK, MUTED, AMBER, GREEN, PURPLE, PINK,
                         linear, outq, outback, outelastic, inq, clamp01, mix, mixc)

W, H, FPS, DUR = 1080, 1920, 30, 36.0
KAI = True

# 9 月的 35 天：0 空 1 暖黄(忙) 2 绿(沉淀) 3 紫(纪念)
CELL_COLORS = [2, 1, 2, 0, 2, 1, 2,
               2, 0, 1, 2, 1, 2, 0,
               1, 2, 0, 2, 3, 2, 1,
               2, 1, 2, 0, 2, 2, 3,
               0, 2, 1, 2, 0, 2, 1]
PALETTE = {0: (226, 232, 240), 1: AMBER, 2: GREEN, 3: PURPLE}
GARDEN_FILL = [2, 1, 2, 1, 2, 3, 2, 1, 2, 2, 0, 1, 2, 1, 3, 2, 1, 2, 2, 1, 0, 2, 2, 1, 3, 2, 1, 2, 1, 2, 0, 2, 2, 1, 2]

f = Film(W, H)

# ── 布局 ──
COLS, ROWS = 7, 5
CELL_R, GAP_X, GAP_Y = 57, 140, 132
GRID_CX, GRID_TOP = W / 2, 830
def month_pos(i):
    return (GRID_CX + (i % COLS - 3) * GAP_X, GRID_TOP + (i // COLS) * GAP_Y)
# 年份花园：4 列 × 3 行迷你月
G_COLS, G_R, G_GAP = 4, 13, 31
G_CX, G_TOP, G_PITCH_X, G_PITCH_Y = W / 2, 760, 252, 236
def garden_color(mi, ci):
    if (mi * 7 + ci * 13) % 11 == 0:
        return 0
    return [1, 2, 2, 3, 2][(mi * 5 + ci * 3) % 5]

def garden_pos(mi, ci):
    gx = G_CX + (mi % G_COLS - 1.5) * G_PITCH_X
    gy = G_TOP + (mi // G_COLS) * G_PITCH_Y
    return (gx + (ci % COLS - 3) * G_GAP, gy + (ci // COLS) * G_GAP)

# ── 时间轴（对拍：BPM76 → 拍0.789s 小节3.158s）──
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
    img = f._paper.copy().convert('RGBA')
    # 水墨晕染底（整段存在，强度随幕起落）
    bl = f.blobs(t, [PINK, (165, 200, 255), GREEN, (216, 180, 254)])
    bl.putalpha(bl.getchannel('A').point(lambda a: int(a * 0.5)))
    img.alpha_composite(bl)

    # ── 幕1：提问 ──
    a1 = Track([(0.7, 0, outq), (1.4, 1)]).sample(t) * Track([(4.9, 1), (5.9, 0, inq)]).sample(t)
    a2 = Track([(2.3, 0, outq), (3.0, 1)]).sample(t) * Track([(4.9, 1), (5.9, 0, inq)]).sample(t)
    if a1 > 0:
        f.draw_text(img, '一年 365 天', W/2, H*0.30 + (1-a1)*30, 108, INK, kai=KAI, alpha=a1)
    if a2 > 0:
        f.draw_text(img, '你记得几天？', W/2, H*0.30 + 190 + (1-a2)*26, 92, (120, 100, 80), kai=KAI, alpha=a2)
    if t < 6.0: petals(img, t, -80, 12, 1.3)

    # ── 幕2：染色月历（35 格开花 + 上色）──
    grid_a = 1.0 - MORPH.sample(t)
    if grid_a > 0.01:
        for i in range(35):
            x0, y0 = month_pos(i)
            # 形变：往花园第一个月的位置收
            gx, gy = garden_pos(0, i)
            x = mix(x0, gx, MORPH.sample(t)); y = mix(y0, gy, MORPH.sample(t))
            r = CELL_R * (1 - MORPH.sample(t) * 0.76)
            k = max(pop_k(i, t), 0.25) if t > POP_T0 else 0.0
            ck = color_k(i, t)
            col = mixc(PALETTE[0], PALETTE[CELL_COLORS[i]], ck) if CELL_COLORS[i] else PALETTE[0]
            # 弹性开花时短暂放大
            vis_k = k if ck <= 0 else max(k, 0.2 + 0.8 * ck)
            f.cell(img, x, y, r * (1 + 0.12 * max(0, ck - 0.5) * 2), col if ck > 0 or CELL_COLORS[i] == 0 else PALETTE[0],
                   vis_k * grid_a, alpha=grid_a)
            if ck > 0.6 and (i % 5 == 0):  # 部分格子上色时飘花瓣
                f.petal(img, x, y - r, 14, PALETTE[CELL_COLORS[i]], t * 2 + i, 0.4 * grid_a)
    # 图注
    lg = Track([(10.1, 0, outq), (10.9, 1)]).sample(t) * (1 - MORPH.sample(t))
    if lg > 0:
        f.draw_text(img, '忙是暖黄 · 沉淀是绿 · 纪念是紫', W/2, GRID_TOP - 118 + (1-lg)*24, 54, MUTED, bold=False, alpha=lg)

    # ── 幕3a：年份花园 ──
    garden_vis = MORPH.sample(t) * FADE_ALL.sample(t) * (1 - 0.5 * CARD.sample(t))
    for mi in range(12):
        for ci in range(35):
            k = garden_k(mi, ci, t) * MORPH.sample(t)
            if k > 0.01:
                x, y = garden_pos(mi, ci)
                col = PALETTE[garden_color(mi, ci)]
                f.cell(img, x, y, G_R, col, k, alpha=0.95 * garden_vis)
    ga = MORPH.sample(t) * Track([(19.6, 0, outq), (20.3, 1)]).sample(t) * (1 - CARD.sample(t))
    if ga > 0.01:
        f.draw_text(img, '一整年，长成一座花园', W/2, 505 + (1-MORPH.sample(t))*60, 64, INK, alpha=ga)
    # 连续纪录徽章
    st = Track([(20.6, 0, outback), (21.2, 1)]).sample(t) * FADE_ALL.sample(t) * CARD_OUT.sample(t)
    if st > 0.01:
        f.card(img, (W/2-250, 1600, W/2+250, 1720), 60)
        f.draw_text(img, '连续记录 17 天', W/2, 1660, 56, GREEN, alpha=st)

    # ── 幕3b：倒数日翻牌卡 ──
    ck_ = CARD.sample(t) * CARD_OUT.sample(t)
    if ck_ > 0.01:
        cy = H*0.62 + (1-CARD.sample(t))*140
        a = min(1.0, ck_ * 2)
        f.card(img, (W/2-330, cy-210, W/2+330, cy+210), 64)
        f.draw_text(img, '距离期中考试', W/2, cy-118, 52, MUTED, bold=False, alpha=a)
        n = int(47 - 2 * clamp01((t - 22.6) / 1.1))
        f.draw_text(img, f'{n}', W/2 - 40, cy+30, 200, PINK, alpha=a, scale=1.0)
        f.draw_text(img, '天', W/2 + 128, cy+64, 72, INK, alpha=a)
        f.draw_text(img, '重要的日子，开始倒数', W/2, cy+262, 48, MUTED, bold=False, alpha=a*Track([(23.2,0),(23.8,1,outq)]).sample(t))

    # ── 幕4：主口号 + 结尾卡 ──
    ha = HERO.sample(t) * HERO_OUT.sample(t)
    if ha > 0.01:
        f.draw_text(img, '坚持，看得见', W/2, H*0.44, 128, INK, kai=KAI, alpha=ha, scale=0.9 + 0.1*ha)
        f.draw_text(img, '每一天的努力，都值得被看见', W/2, H*0.44 + 150, 52, (150, 135, 110), bold=False, kai=KAI,
                    alpha=ha*Track([(29.2,0),(29.9,1,outq)]).sample(t))
    ea = END.sample(t)
    if ea > 0.01:
        glow = 0.5 + 0.5 * math.sin(t * 2.4)
        lg_img = f.logo(300, glow=0.35 + 0.25 * glow)
        lg_img = lg_img.copy(); lg_img.putalpha(lg_img.getchannel('A').point(lambda v: int(v * ea)))
        img.alpha_composite(lg_img, (int(W/2 - lg_img.width/2), int(H*0.36 - lg_img.height/2)))
        f.draw_text(img, 'TT 日历', W/2, H*0.63, 96, INK, alpha=ea)
        f.draw_text(img, '染色月历 · 待办 · 倒数日', W/2, H*0.63 + 110, 48, MUTED, bold=False,
                    alpha=ea * Track([(33.0,0),(33.6,1,outq)]).sample(t))
        f.draw_text(img, 'App Store 搜索「TT日历」', W/2, H*0.63 + 210, 44, PINK,
                    alpha=ea * Track([(33.8,0),(34.4,1,outq)]).sample(t))
    if t > 31.5: petals(img, t, -60, 10, 4.2)

    # 电影感收尾
    f.filmic(img, int(t * FPS))
    return img

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else int(DUR * FPS)
    import os
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, 'artifacts', 'films', 'tt-vertical-1080x1920.mp4')
    wav = os.path.join(root, 'artifacts', 'films', 'tt-theme.wav')
    errlog = open(os.path.join(root, 'artifacts', 'films', 'ffmpeg-vertical.log'), 'w')
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
