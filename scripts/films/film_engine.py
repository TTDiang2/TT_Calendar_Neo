# -*- coding: utf-8 -*-
"""
film_engine.py — 「代码即影片」引擎：纯 Pillow 逐帧渲染，无任何视频/图像生成模型。

能力面：关键帧轨道与缓动族（含回弹/弹性）、精灵缓存与超采样文字、
宣纸底纹、漂移水墨晕染（低分辨率放大法）、胶片颗粒、暗角、
染色月历格子（弹簧开花）、年份花园、倒数日翻牌卡、代码绘制 App 图标。
"""
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── 品牌色板 ──
INK = (30, 41, 59)
MUTED = (100, 116, 139)
PAPER_A = (250, 246, 239)
PAPER_B = (243, 240, 235)
AMBER = (245, 158, 11)
GREEN = (34, 197, 94)
PURPLE = (168, 85, 247)
PINK = (236, 72, 153)
BLUE = (59, 130, 246)
GRAD = [(236, 72, 153), (139, 92, 246)]  # 品牌渐变 粉→紫

# ── 缓动族 ──
def linear(t): return t
def inq(t): return t ** 3
def outq(t): return 1 - (1 - t) ** 3
def inout(t): return 3 * t * t - 2 * t * t * t
def outback(t, s=1.70158):
    t -= 1
    return 1 + t * t * ((s + 1) * t + s)
def outelastic(t):
    if t in (0, 1): return t
    return 2 ** (-9 * t) * math.sin((t * 10 - 0.75) * (2 * math.pi / 3.2)) + 1

class Track:
    """关键帧轨道: [(t0, v0), (t1, v1, ease), ...] → sample(t)"""
    def __init__(self, keys):
        self.keys = sorted(keys, key=lambda k: k[0])
    def sample(self, t):
        ks = self.keys
        if t <= ks[0][0]: return ks[0][1]
        if t >= ks[-1][0]: return ks[-1][1]
        for i in range(len(ks) - 1):
            a, b = ks[i], ks[i + 1]
            if a[0] <= t <= b[0]:
                span = b[0] - a[0]
                if span <= 0: return b[1]
                f = (t - a[0]) / span
                e = (b[2] if len(b) > 2 else inout)(f)
                return a[1] + (b[1] - a[1]) * e
        return ks[-1][1]

def clamp01(x): return max(0.0, min(1.0, x))
def mix(a, b, t): return a + (b - a) * t
def mixc(a, b, t): return tuple(int(mix(a[i], b[i], t)) for i in range(len(a)))

class Film:
    def __init__(self, w, h, fps=30):
        self.w, self.h, self.fps = w, h, fps
        self._sprites = {}
        # 颗粒/暗角：预合成 4 张全尺寸 RGBA，运行时只做两次 alpha 合成
        self._grain = []
        for i in range(8):
            g = Image.effect_noise((w // 2, h // 2), 22).resize((w, h))
            self._grain.append(Image.merge('RGBA', (g, g, g, g.point(lambda x: 6))))
        vig = Image.radial_gradient('L').resize((w, h)).point(lambda x: int(max(0, x - 110) * 0.55))
        self._vig = Image.merge('RGBA', (Image.new('L', (w, h), 20),
                                         Image.new('L', (w, h), 16),
                                         Image.new('L', (w, h), 28), vig))
        self._paper = self._make_paper(w, h).convert('RGBA')
        self._blob_cache = {}
        self._blob_src = None

    def _make_paper(self, w, h):
        base = Image.new('RGB', (w, h))
        px = base.load()
        for y in range(h):
            t = y / h
            c = mixc(PAPER_B, PAPER_A, 0.5 + 0.5 * math.sin(t * math.pi))
            for x in range(w):
                px[x, y] = c
        noise = Image.effect_noise((w, h), 14).convert('L')
        base = Image.composite(
            Image.new('RGB', (w, h), (255, 255, 255)),
            base, noise.point(lambda x: 255 if x > 232 else 0))
        return base

    def base(self):
        """每帧起点：干净的 RGBA 宣纸拷贝。"""
        return self._paper.copy()

    def sprite(self, key, maker):
        if key not in self._sprites:
            self._sprites[key] = maker()
        return self._sprites[key]

    def font(self, path, size):
        return self.sprite(('font', path, size), lambda: ImageFont.truetype(path, size))

    # ── 精灵：超采样文字 ──
    def text_sprite(self, text, size, fill=INK, bold=True, kai=False, ss=3, pad=24):
        key = ('txt', text, size, fill, bold, kai)
        def maker():
            fp = r'C:\Windows\Fonts\simkai.ttf' if kai else (
                r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc')
            f = ImageFont.truetype(fp, size * ss)
            tmp = Image.new('RGBA', (10, 10))
            d = ImageDraw.Draw(tmp)
            box = d.textbbox((0, 0), text, font=f)
            w, h = box[2] - box[0], box[3] - box[1]
            img = Image.new('RGBA', (w + pad * ss * 2, h + pad * ss * 2), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((pad * ss - box[0], pad * ss - box[1]), text, font=f, fill=fill)
            img = img.resize((img.width // ss, img.height // ss), Image.LANCZOS)
            return img
        return self.sprite(key, maker)

    def draw_text(self, img, text, cx, cy, size, fill=INK, bold=True, kai=False,
                  alpha=1.0, scale=1.0, anchor_cy=True):
        """居中贴文字精灵；alpha/scale 可动画。返回精灵实际尺寸。"""
        if alpha <= 0.01 or scale <= 0.01: return (0, 0)
        sq = round(scale, 2)
        sp = self.text_sprite(text, size, fill, bold, kai)
        if sq != 1.0:
            sp = self.sprite(('txtsc', text, size, fill, bold, kai, sq),
                             lambda: sp.resize((max(1, int(sp.width * sq)), max(1, int(sp.height * sq))), Image.BILINEAR))
        if alpha < 0.999:
            sp = sp.copy()
            a = sp.getchannel('A').point(lambda x: int(x * alpha))
            sp.putalpha(a)
        x = int(cx - sp.width / 2)
        y = int(cy - sp.height / 2) if anchor_cy else int(cy)
        img.alpha_composite(sp, (x, y))
        return (sp.width, sp.height)

    # ── 水墨晕染层（1/4 分辨率渲染；0.4s 量化缓存，漂移极慢肉眼无感）──
    def blobs(self, t, palette, drift=1.0):
        tq = round(t * 2.5) / 2.5
        key = ('blobs', tuple(palette), drift, tq)
        def maker():
            w4, h4 = self.w // 4, self.h // 4
            img = Image.new('RGBA', (w4, h4), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            defs = [
                (0.16, 0.10, 0.34, palette[0], tq * 0.13),
                (0.88, 0.30, 0.30, palette[1], 1.7 + tq * 0.10),
                (0.10, 0.66, 0.28, palette[2], 3.1 + tq * 0.08),
                (0.86, 0.88, 0.30, palette[3], 4.9 + tq * 0.11),
            ]
            for fx, fy, fr, col, ph in defs:
                cx = (fx + 0.035 * math.sin(ph * 2.1) * drift) * w4
                cy = (fy + 0.045 * math.cos(ph * 1.7) * drift) * h4
                r = fr * min(w4, h4) * (1 + 0.05 * math.sin(ph * 2.7))
                for ring, a in ((1.35, 26), (1.0, 34), (0.62, 40)):
                    rr = r * ring
                    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col + (a,))
            img = img.filter(ImageFilter.GaussianBlur(w4 // 14))
            out = img.resize((self.w, self.h), Image.BILINEAR)
            # alpha 预乘在缓存生成时完成（调用处不得原地修改缓存对象）
            out.putalpha(out.getchannel('A').point(lambda a: int(a * 0.5)))
            return out
        return self.sprite(key, maker)

    # ── 胶片颗粒 + 暗角（全部预合成，只做两次合成）──
    def filmic(self, img, frame_idx, grain_alpha=6):
        img.alpha_composite(self._grain[(frame_idx // 2) % 8])
        img.alpha_composite(self._vig)

    # ── 染色月历格子：按颜色缓存开花精灵，按 k 缩放贴图 ──
    def cell(self, img, x, y, r, color, k=1.0, alpha=1.0, glow=False):
        """k: 0..1 开花进度（<0 不画）。"""
        if k <= 0.01 or alpha <= 0.01: return
        key = ('cell', color, glow)
        def maker():
            ss = 4
            R = 100 * ss
            img = Image.new('RGBA', (R * 2, R * 2), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            if glow:
                for gr, ga in ((1.9, 26), (1.5, 40)):
                    d.ellipse([R - R * gr, R - R * gr, R + R * gr, R + R * gr], fill=color + (ga,))
            d.ellipse([R - R * 0.92, R - R * 0.92, R + R * 0.92, R + R * 0.92], fill=color + (255,))
            # 高光（减淡，避免「眼球感」）
            d.ellipse([R - R * 0.6, R - R * 0.72, R - R * 0.1, R - R * 0.34], fill=(255, 255, 255, 26))
            return img.resize((200, 200), Image.LANCZOS)
        sp = self.sprite(key, maker)
        size = max(2, int(200 * r / 100 * (0.2 + 0.8 * k)))
        sp2 = sp.resize((size, size), Image.BILINEAR)
        if alpha < 0.999:
            sp2 = sp2.copy()
            sp2.putalpha(sp2.getchannel('A').point(lambda v: int(v * alpha)))
        img_alpha = sp2.getchannel('A')
        img.paste(sp2, (int(x - size / 2), int(y - size / 2)), img_alpha)

    # ── 圆角矩形卡（缓存按尺寸+圆角）──
    def card(self, img, box, radius, fill=(255, 255, 255, 235), outline=None, shadow=True):
        x0, y0, x1, y1 = [int(v) for v in box]
        # Pillow rounded_rectangle 的边界 off-by-one：半径必须留出正矩形空间
        radius = max(4, min(radius, (y1 - y0 - 2) // 2, (x1 - x0 - 2) // 2))
        key = ('card', x1 - x0, y1 - y0, radius, fill, outline is not None)
        def maker():
            pad_s = 30
            w, h = (x1 - x0) + pad_s * 2, (y1 - y0) + pad_s * 2
            im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            if shadow:
                sh = Image.new('RGBA', (w, h), (0, 0, 0, 0))
                ImageDraw.Draw(sh).rounded_rectangle(
                    [pad_s + 6, pad_s + 12, pad_s + (x1 - x0) + 6, pad_s + (y1 - y0) + 12],
                    radius, fill=(93, 63, 140, 60))
                sh = sh.filter(ImageFilter.GaussianBlur(12))
                im.alpha_composite(sh)
            d.rounded_rectangle([pad_s, pad_s, pad_s + (x1 - x0), pad_s + (y1 - y0)],
                                radius, fill=fill,
                                outline=outline, width=3 if outline else 0)
            return im
        sp = self.sprite(key, maker)
        img.alpha_composite(sp, (x0 - 30, y0 - 30))

    # ── App 图标复刻（代码绘制；光晕量化到 1/10 缓存）──
    def logo(self, size, glow=0.0):
        glow = round(glow, 1)
        key = ('logo', size, glow)
        def maker():
            ss = 4
            S = size * ss
            pad_g = int(S * (0.35 + glow * 0.5))
            img = Image.new('RGBA', (S + pad_g * 2, S + pad_g * 2), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            cx = S / 2 + pad_g
            if glow > 0:
                for gr, ga in ((1.55, int(70 * glow)), (1.25, int(90 * glow))):
                    d.ellipse([cx - S * gr / 2, cx - S * gr / 2, cx + S * gr / 2, cx + S * gr / 2],
                              fill=(236, 72, 153, ga))
            r = S * 0.225
            # 渐变圆角方块（粉→紫）
            body = Image.new('RGBA', (S, S), (0, 0, 0, 0))
            bd = ImageDraw.Draw(body)
            for y in range(S):
                t = y / S
                c = mixc(GRAD[0], GRAD[1], t)
                bd.line([(0, y), (S, y)], fill=c + (255,))
            mask = Image.new('L', (S, S), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], r, fill=255)
            img.paste(body, (int(pad_g), int(pad_g)), mask)
            # 白色日历板
            m = S * 0.16
            cw, chh = S - m * 2, S * 0.62
            ct, cy0 = m + S * 0.10, m + S * 0.10
            d.rounded_rectangle([pad_g + m, pad_g + cy0, pad_g + S - m, pad_g + cy0 + chh],
                                radius=S * 0.08, fill=(255, 255, 255, 255))
            # 顶部两个挂杆（贴住块顶，整数坐标）
            for hx in (0.36, 0.64):
                bx = int(pad_g + S * hx)
                d.rounded_rectangle([bx - int(S * 0.025), int(pad_g + S * 0.055),
                                     bx + int(S * 0.025), int(pad_g + S * 0.15)],
                                    radius=int(S * 0.02), fill=(255, 255, 255, 255))
            # 三颗点
            for i, dx in enumerate((-0.13, 0, 0.13)):
                d.ellipse([cx + S * dx - S * 0.022, pad_g + cy0 + S * 0.10 - S * 0.022,
                           cx + S * dx + S * 0.022, pad_g + cy0 + S * 0.10 + S * 0.022],
                          fill=(236, 72, 153, 255))
            # 大对勾
            chk = [(cx - S * 0.13, pad_g + cy0 + S * 0.30),
                   (cx - S * 0.035, pad_g + cy0 + S * 0.415),
                   (cx + S * 0.15, pad_g + cy0 + S * 0.17)]
            d.line(chk, fill=(236, 72, 153, 255), width=int(S * 0.055), joint='curve')
            return img.resize((img.width // ss, img.height // ss), Image.LANCZOS)
        return self.sprite(key, maker)

    # ── 粒子花瓣 ──
    def petal(self, img, x, y, r, color, angle, alpha=0.5):
        key = ('petal', color)
        def maker():
            ss = 4
            S = 60 * ss
            im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.ellipse([S * 0.18, S * 0.05, S * 0.82, S * 0.95], fill=color + (255,))
            return im.resize((60, 60), Image.LANCZOS)
        sp = self.sprite(key, maker)
        rot = sp.rotate(math.degrees(angle), resample=Image.BICUBIC, expand=False)
        size = max(2, int(60 * r / 30))
        rot = rot.resize((size, size), Image.BILINEAR)
        if alpha < 0.999:
            rot = rot.copy()
            rot.putalpha(rot.getchannel('A').point(lambda v: int(v * alpha)))
        img.paste(rot, (int(x - size / 2), int(y - size / 2)), rot.getchannel('A'))

    # ═══ v2：真机 UI 展示 ═══
    def shot(self, path, w):
        """真机截图按宽缩放缓存。"""
        key = ('shot', path, w)
        def maker():
            return Image.open(path).convert('RGB').resize(
                (w, int(Image.open(path).height * w / Image.open(path).width)), Image.LANCZOS)
        return self.sprite(key, maker)

    def phone_shot(self, img, path, cx, cy, w, alpha=1.0, dx=0.0, rot=0.0, frame=True):
        """真机截图 + 手机外框 + 阴影，中心 (cx+dx, cy)，可带旋转。
        层序：阴影 → 深色机身（圆角）→ 圆角裁剪的截图贴入（圆角外露机身色，绝不露白）。"""
        if alpha <= 0.01: return
        shot = self.shot(path, w)
        key = ('pframe', path, w)
        def maker():
            bw, rad = max(6, int(w * 0.024)), int(w * 0.085)
            fw, fh = shot.width + bw * 2, shot.height + bw * 2
            fr = Image.new('RGBA', (fw + 80, fh + 80), (0, 0, 0, 0))
            sh = Image.new('RGBA', fr.size, (0, 0, 0, 0))
            ImageDraw.Draw(sh).rounded_rectangle(
                [40 + 12, 40 + 30, 40 + fw + 12, 40 + fh + 30], rad + 6, fill=(60, 40, 100, 80))
            sh = sh.filter(ImageFilter.GaussianBlur(20))
            fr.alpha_composite(sh)
            body = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
            ImageDraw.Draw(body).rounded_rectangle([0, 0, fw - 1, fh - 1], rad, fill=(24, 24, 27, 255))
            fr.alpha_composite(body, (40, 40))
            # 圆角裁剪截图后贴入（截图圆角外是机身色）
            mask = Image.new('L', shot.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, shot.width - 1, shot.height - 1], rad - bw // 2, fill=255)
            rounded = Image.new('RGBA', shot.size, (0, 0, 0, 0))
            rounded.paste(shot, (0, 0), mask)
            fr.alpha_composite(rounded, (40 + bw, 40 + bw))
            return fr
        fr = self.sprite(key, maker) if frame else None
        if fr is None:
            out = shot.copy()
            x, y = int(cx + dx - out.width / 2), int(cy - out.height / 2)
        else:
            out = fr
            x, y = int(cx + dx - out.width / 2), int(cy - out.height / 2)
        if abs(rot) > 0.01:
            out = out.rotate(rot, resample=Image.BICUBIC, expand=True)
            x, y = int(cx + dx - out.width / 2), int(cy - out.height / 2)
        if alpha < 0.999:
            out = out.copy()
            out.putalpha(out.getchannel('A').point(lambda v: int(v * alpha)))
        img.alpha_composite(out, (x, y))

    def notify_banner(self, img, cx, top_y, alpha, title, body, icon_text='TT', k=1.0):
        """iOS 通知横幅：毛玻璃白卡 + 小圆标 + 两行字。k: 弹入进度。"""
        if alpha <= 0.01 or k <= 0.01: return
        key = ('notify', title, body)
        def maker():
            W2, H2 = 660, 132
            im = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.rounded_rectangle([0, 0, W2 - 1, H2 - 1], 34, fill=(255, 255, 255, 242))
            d.ellipse([22, H2 / 2 - 30, 82, H2 / 2 + 30], fill=(236, 72, 153, 255))
            f1 = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 30)
            f2 = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 26)
            d.text((106, 24), title, font=f1, fill=INK)
            d.text((106, 68), body, font=f2, fill=(100, 116, 139))
            return im
        sp = self.sprite(key, maker)
        if k < 1:
            sp = sp.resize((max(2, int(sp.width * (0.7 + 0.3 * k))), max(2, int(sp.height * (0.7 + 0.3 * k)))), Image.BILINEAR)
        if alpha < 0.999:
            sp = sp.copy()
            sp.putalpha(sp.getchannel('A').point(lambda v: int(v * alpha)))
        img.alpha_composite(sp, (int(cx - sp.width / 2), int(top_y)))

    def stamp_check(self, img, cx, cy, k, color=GREEN, r=90):
        """对勾 stamp：圆 + 勾，弹性放大。"""
        if k <= 0.01: return
        key = ('stamp', color)
        def maker():
            ss = 4
            R = r * ss
            im = Image.new('RGBA', (R * 2 + 40 * ss, R * 2 + 40 * ss), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            C = R + 20 * ss
            for gr, ga in ((1.35, 36), (1.0, 255)):
                d.ellipse([C - R * gr, C - R * gr, C + R * gr, C + R * gr],
                          fill=color + (ga,) if gr > 1 else color + (255,))
            pts = [(C - R * 0.42, C + R * 0.02), (C - R * 0.1, C + R * 0.36), (C + R * 0.46, C - R * 0.3)]
            d.line(pts, fill=(255, 255, 255, 255), width=int(R * 0.22), joint='curve')
            return im.resize(((r * 2 + 40), (r * 2 + 40)), Image.LANCZOS)
        sp = self.sprite(key, maker)
        size = int((r * 2 + 40) * (0.3 + 0.7 * k))
        sp2 = sp.resize((size, size), Image.BILINEAR)
        img.alpha_composite(sp2, (int(cx - size / 2), int(cy - size / 2)))

    def heat_wall(self, img, cx, cy, t, t0, cols=26, rows=7, cw=34, chh=30, gap=6):
        """26×7 GitHub 风热力墙逐格点亮（绿色渐层 + 少量 amber/purple）。"""
        import random
        rnd = random.Random(42)
        vals = [[rnd.choice([0, 1, 1, 2, 2, 3, 4, 3, 2, 1]) for _ in range(cols)] for _ in range(rows)]
        shades = [(226, 232, 240), (187, 227, 178), (110, 198, 124), (52, 168, 83), (22, 101, 52)]
        total = cols * rows
        for c in range(cols):
            for r in range(rows):
                idx = c * rows + r
                k = clamp01((t - t0 - idx * 0.012) / 0.3)
                if k <= 0: continue
                v = vals[r][c]
                col = shades[v]
                if v == 0: col = shades[0]
                x = cx + (c - cols / 2) * (cw + gap)
                y = cy + (r - rows / 2) * (chh + gap)
                d = 6 * int(v > 0)
                ImageDraw.Draw(img, 'RGBA').rounded_rectangle(
                    [x - cw / 2, y - chh / 2, x + cw / 2 + d, y + chh / 2], 6,
                    fill=col + (int(255 * outback(k)),))
        return vals

    def cycle_arrows(self, img, cx, cy, r, rot, color=BLUE, alpha=1.0, width=14):
        """循环箭头：两段弧 + 箭头头，绕中心旋转。"""
        if alpha <= 0.01: return
        key = ('cycle', r, color, round(rot / 0.8))
        def maker():
            ss = 4
            R = r * ss
            im = Image.new('RGBA', (R * 2 + 60 * ss, R * 2 + 60 * ss), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            C = R + 30 * ss
            for a0, a1, flip in ((200, 20, 1), (20, 160, -1)):
                bbox = [C - R, C - R, C + R, C + R]
                d.arc(bbox, a0, a1, fill=color + (255,), width=width * ss)
                import math as _m
                am = _m.radians((a0 + a1) / 2)
                ax, ay = C + R * _m.cos(am), C + R * _m.sin(am)
                sz = 26 * ss
                d.polygon([(ax + sz * _m.cos(am + 2.6) * flip, ay + sz * _m.sin(am + 2.6) * flip),
                           (ax + sz * _m.cos(am - 2.6) * flip, ay + sz * _m.sin(am - 2.6) * flip),
                           (ax, ay)], fill=color + (255,))
            return im.resize(((r * 2 + 60), (r * 2 + 60)), Image.LANCZOS)
        sp = self.sprite(('cycle2', r, color, round(rot / 0.8)), maker)
        if alpha < 0.999:
            sp = sp.copy()
            sp.putalpha(sp.getchannel('A').point(lambda v: int(v * alpha)))
        img.alpha_composite(sp, (int(cx - sp.width / 2), int(cy - sp.height / 2)))
