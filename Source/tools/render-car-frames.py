#!/usr/bin/env python3
"""Prepare a coherent recorded front and stationary photographic body locally.

Requires Pillow. The supplied body is registered to the video camera already.
Hood, engine, cowl and front fascia retain their recorded geometry together.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SOURCE = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=SOURCE / 'assets')
parser.add_argument('--review', type=Path)
parser.add_argument('--reference-frames', type=Path,
                    help='Import 48 prepared 1080 x 600 RGBA frames, 001.png..048.png')
args = parser.parse_args()
cal = json.loads((SOURCE / 'tools/car-hood-calibration.json').read_text())
size = tuple(cal['size'])
body = Image.open(SOURCE / 'assets' / cal['body']).convert('RGBA')
if body.size != size:
    raise ValueError('Registered body dimensions do not match calibration')
reference = cal['reference']
reference_path = SOURCE / 'assets' / reference['asset']
if args.reference_frames:
    sheet = Image.new('RGBA', (size[0]*reference['columns'], size[1]*reference['rows']))
    for index in range(cal['count']):
        frame = Image.open(args.reference_frames / f'{index+1:03}.png').convert('RGBA')
        if frame.size != size:
            raise ValueError('Imported reference dimensions do not match calibration')
        sheet.paste(frame, ((index % reference['columns'])*size[0],
                            (index // reference['columns'])*size[1]))
    sheet.save(reference_path, lossless=True, method=6)
sheet = Image.open(reference_path).convert('RGBA')
if sheet.size != (size[0]*reference['columns'], size[1]*reference['rows']):
    raise ValueError('Reference atlas dimensions do not match calibration')

# Preserve the complete recorded mechanism in one camera coordinate system.
# Only the join to the photographic door/wheel/rear body is feathered.
front = Image.new('L', size)
ImageDraw.Draw(front).polygon([tuple(point) for point in cal['native_front_polygon']], fill=255)
front = front.filter(ImageFilter.GaussianBlur(cal['feather_px']))
ownership = front.point(lambda value: 255 if value else 0)
empty = Image.new('RGBA', size)
base = Image.composite(empty, body, ownership)
frames, motion = [], []
for index in range(cal['count']):
    x = (index % reference['columns'])*size[0]
    y = (index // reference['columns'])*size[1]
    native = sheet.crop((x, y, x+size[0], y+size[1]))
    combined = Image.composite(native, body, front)
    # Disjoint pixel ownership lets transparent recorded gaps clear the closed
    # photograph underneath, rather than revealing a duplicate bonnet.
    overlay = Image.composite(combined, empty, ownership)
    motion.append(overlay)
    frames.append(Image.alpha_composite(base, overlay))
args.output.mkdir(parents=True, exist_ok=True)
base.save(args.output / 'car-studio-base.webp', lossless=True, method=6)
for part in range(4):
    atlas = Image.new('RGBA', (size[0]*3, size[1]*4))
    for cell in range(12):
        atlas.paste(motion[part*12+cell], ((cell % 3)*size[0], (cell // 3)*size[1]))
    path = args.output / f'car-hood-frames-{part+1}.webp'
    atlas.save(path, quality=97, method=6)
    # Posters and review frames use the actual decoded runtime assets, so a
    # fallback cannot visibly change the final image. Alpha stays lossless.
    decoded = Image.open(path).convert('RGBA')
    for cell in range(12):
        x, y = (cell % 3)*size[0], (cell // 3)*size[1]
        layer = decoded.crop((x, y, x+size[0], y+size[1]))
        frames[part*12+cell] = Image.alpha_composite(base, layer)
for label, index in [('open', 0), ('closed', cal['count']-1)]:
    frames[index].save(args.output / f'car-hood-{label}.webp', lossless=True, method=6)

# The running-light state follows the closed, unlit recorded pose. Preserve
# dark projector bowls; only their narrow surrounding LED strips emit light.
scale = 4
mask = Image.new('L', (size[0]*scale, size[1]*scale))
draw = ImageDraw.Draw(mask)
for name, points in cal['led_paths'].items():
    points = [(round(x*scale), round(y*scale)) for x, y in points]
    width = round((2.25 if name == 'near' else 1.45)*scale)
    draw.line(points, fill=255, width=width, joint='curve')
    for x, y in [points[0], points[-1]]:
        draw.ellipse((x-width/2, y-width/2, x+width/2, y+width/2), fill=255)
mask = mask.resize(size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.28))
glow = mask.filter(ImageFilter.GaussianBlur(3))
unlit = frames[-2]
rgb = unlit.convert('RGB')
emission = Image.merge('RGB', (glow.point(lambda n: round(n*.63)),
                               glow.point(lambda n: round(n*.8)), glow))
lit = ImageChops.screen(rgb, emission)
lit = Image.composite(Image.new('RGB', size, (223, 242, 255)), lit,
                       mask.point(lambda n: round(n*.8)))
red, green, blue = ImageChops.difference(rgb, lit).split()
changed = ImageChops.lighter(ImageChops.lighter(red, green), blue).point(lambda n: 255 if n else 0)
alpha = ImageChops.multiply(changed, unlit.getchannel('A'))
led = Image.merge('RGBA', (*lit.split(), alpha))
led.save(args.output / 'car-led.webp', lossless=True, method=6)
if args.review:
    args.review.mkdir(parents=True, exist_ok=True)
    contact = Image.new('RGB', (2160, 1200), '#302118')
    for index, frame in enumerate(frames):
        frame.save(args.review / f'frame-{index:02}.png')
    for cell, index in enumerate([0, 6, 12, 18, 24, 30, 36, 42, 47]):
        bg = Image.new('RGBA', size, '#302118')
        bg.alpha_composite(frames[index])
        contact.paste(bg.convert('RGB').resize((720, 400)), ((cell % 3)*720, (cell // 3)*400))
    contact.save(args.review / 'contact.jpg', quality=96)
    unlit.save(args.review / 'lights-off.png')
    Image.alpha_composite(unlit, led).save(args.review / 'lights-led.png')
    frames[-1].save(args.review / 'lights-headlights.png')
print(json.dumps({'frames': len(frames), 'size': size, 'base': cal['body'],
                  'reference': reference_path.name, 'geometry': 'recorded front unchanged'}))
