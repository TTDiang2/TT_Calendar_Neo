#!/usr/bin/env python
# App 预览视频：9 屏 Ken Burns 缓推 + 交叉淡化，1290x2796 H.264 ≤30s（6.7" 规格）
# 用法：python make-preview-video.py <lang>  → artifacts/asc/v110-preview-<lang>.mp4
import subprocess, sys, os

lang = sys.argv[1] if len(sys.argv) > 1 else 'zh-Hans'
d = 'E:/TT_Calendar_Neo/artifacts/preview/v3-out/final'
out = f'E:/TT_Calendar_Neo/artifacts/asc/v110-preview-{lang}.mp4'

SLIDES = ['01', '02', '03', '04', '05', '06', '07', '08', '09']
DUR = 2.2   # 每屏时长
FADE = 0.4  # 交叉淡化
FPS = 30

inputs = []
for s in SLIDES:
    inputs += ['-loop', '1', '-t', str(DUR), '-i', f'{d}/{lang}-{s}.png']
# 静音 AAC 轨（Apple 预览转码对无音轨文件偶发 FAILED）
inputs += ['-f', 'lavfi', '-t', str(DUR * len(SLIDES)), '-i', 'anullsrc=r=44100:cl=stereo']

fc = []
for i in range(len(SLIDES)):
    frames = int(DUR * FPS)
    # 缓慢推近 1.00→1.07，中心聚焦；交替方向增加动感
    if i % 2 == 0:
        z = f"min(zoom+{0.07/frames:.6f},1.07)"
    else:
        z = f"if(lte(zoom,1.0),1.07,max(1.001,zoom-{0.07/frames:.6f}))"
    fc.append(
        f"[{i}:v]scale=1290:2796,setsar=1,"
        f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1290x2796:fps={FPS},format=yuv420p[v{i}]"
    )

# xfade 链
prev = 'v0'
offset = DUR - FADE
for i in range(1, len(SLIDES)):
    outl = f"x{i}" if i < len(SLIDES) - 1 else "vout"
    fc.append(f"[{prev}][v{i}]xfade=transition=fade:duration={FADE}:offset={offset:.2f}[{outl}]")
    prev = outl
    offset += DUR - FADE
fc.append(f"[{prev}]scale=886:1920:force_original_aspect_ratio=increase,crop=886:1920,format=yuv420p[vfinal]")

# 视频规格按 Apple 预览安全表：886×1920 (6.7") H.264 High@4.0 CFR + 静音 AAC
total = DUR * len(SLIDES) - FADE * (len(SLIDES) - 1)
cmd = ['ffmpeg', '-y'] + inputs + ['-filter_complex', ';'.join(fc),
       '-map', '[vfinal]', '-map', f'{len(SLIDES)}:a',
       '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0', '-preset', 'medium', '-crf', '22',
       '-r', str(FPS), '-fps_mode', 'cfr',
       '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', out]
print('总时长', round(total, 1), 's')
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-2000:]); sys.exit(1)
print('OK', out, os.path.getsize(out) // 1024, 'KB')
