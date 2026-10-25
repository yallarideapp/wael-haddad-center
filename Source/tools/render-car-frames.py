#!/usr/bin/env python3
"""Prepare recorded hood motion over the original stationary photographic car.

Requires Pillow. The supplied body is registered to the video camera already.
Only the real hood, engine and hinge pixels move; the body retains its photo.
"""
import argparse
import json
import bisect
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

def source_frame(index):
    x = (index % reference['columns'])*size[0]
    y = (index // reference['columns'])*size[1]
    return sheet.crop((x, y, x+size[0], y+size[1]))

def polygon_mask(points, feather):
    mask = Image.new('L', size)
    ImageDraw.Draw(mask).polygon([tuple(point) for point in points], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather))

# Clear the actual closed bonnet footprint, never the windshield or the whole
# front of the car. The recorded engine and hood fill/occlude this opening.
opening = polygon_mask(cal['opening_polygon'], cal['opening_feather_px'])
engine = ImageChops.multiply(opening, polygon_mask(cal['engine_polygon'], cal['engine_feather_px']))
hinge = polygon_mask(cal['hinge_polygon'], cal['hinge_feather_px'])
base = body.copy()
base.putalpha(ImageChops.multiply(body.getchannel('A'), ImageChops.invert(opening)))
keys = cal['hood_outline_keys']
key_indices = [key['index'] for key in keys]

def hood_mask(index):
    position = max(0, min(len(keys)-2, bisect.bisect_right(key_indices, index)-1))
    left, right = keys[position:position+2]
    ratio = (index-left['index'])/(right['index']-left['index'])
    outline = [[x+(xx-x)*ratio, y+(yy-y)*ratio]
               for (x,y), (xx,yy) in zip(left['outline'], right['outline'])]
    return ImageChops.lighter(polygon_mask(outline, cal['hood_feather_px']), hinge)

frames, motion = [], []
for index in range(cal['count']):
    pose = min(index, cal['count']-2)
    native = source_frame(pose)
    engine_layer = native.copy()
    engine_layer.putalpha(ImageChops.multiply(native.getchannel('A'), engine))
    hood = native.copy()
    hood.putalpha(ImageChops.multiply(native.getchannel('A'), hood_mask(pose)))
    overlay = Image.alpha_composite(engine_layer, hood)
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
frames[0].save(args.output / 'car-hood-open.webp', lossless=True, method=6)

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
def light_layer(before, after):
    red, green, blue = ImageChops.difference(before, after).split()
    changed = ImageChops.lighter(ImageChops.lighter(red, green), blue).point(lambda n: 255 if n else 0)
    # An overlay must not add opacity to the antialiased body silhouette.
    opaque = unlit.getchannel('A').point(lambda n: 255 if n == 255 else 0)
    alpha = ImageChops.multiply(changed, opaque)
    return Image.merge('RGBA', (*after.split(), alpha))

led = light_layer(rgb, lit)
led.save(args.output / 'car-led.webp', lossless=True, method=6)
led_frame = Image.alpha_composite(unlit, led)

# Keep the exact same closed pose for both light stages. The later recorded
# frame contributes positive radiance inside the lamps, never its geometry.
lighting = cal['headlights']
recorded_light = ImageChops.subtract(source_frame(47).convert('RGB'), source_frame(46).convert('RGB'))
positive = Image.new('RGB', size)
for mapping in lighting['radiance_mappings']:
    left, top, right, bottom = mapping['target']
    radiance = recorded_light.crop(tuple(mapping['source'])).resize(
        (right-left, bottom-top), Image.Resampling.LANCZOS)
    positive.paste(radiance, (left, top))
optic = Image.new('L', size)
for polygon in lighting['optic_polygons']:
    ImageDraw.Draw(optic).polygon([tuple(point) for point in polygon], fill=255)
optic = optic.filter(ImageFilter.GaussianBlur(lighting['optic_feather_px']))
spill = Image.new('L', size)
ImageDraw.Draw(spill).ellipse(tuple(lighting['spill_ellipse']), fill=lighting['spill_strength'])
spill = spill.filter(ImageFilter.GaussianBlur(lighting['spill_feather_px']))
def masked_rgb(image, mask):
    return Image.merge('RGB', tuple(ImageChops.multiply(channel, mask) for channel in image.split()))
direct = masked_rgb(positive.filter(ImageFilter.GaussianBlur(lighting['direct_blur_px'])), optic)
bloom = masked_rgb(positive.filter(ImageFilter.GaussianBlur(lighting['bloom_blur_px'])), spill)
main_rgb = ImageChops.add(led_frame.convert('RGB'), ImageChops.lighter(direct, bloom))
headlights = light_layer(led_frame.convert('RGB'), main_rgb)
headlights.save(args.output / 'car-headlights.webp', lossless=True, method=6)
final = Image.alpha_composite(led_frame, headlights)
final.save(args.output / 'car-hood-closed.webp', lossless=True, method=6)
# Review the actual held pose with its light layers, not the unused later pose.
frames[-1] = final
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
    led_frame.save(args.review / 'lights-led.png')
    final.save(args.review / 'lights-headlights.png')
print(json.dumps({'frames': len(frames), 'size': size, 'base': cal['body'],
                  'reference': reference_path.name, 'geometry': 'fixed photographic body, recorded hood and engine only'}))
