#!/usr/bin/env python3
"""Prepare transparent photographic car frames; never runs in the browser.

Requires Pillow, numpy and OpenCV. A full-size body master is optional; the
checked-in studio WebP is the portable fallback. See MAINTENANCE-AR.md.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--body-photo', type=Path)
parser.add_argument('--output', type=Path, default=SOURCE / 'assets')
parser.add_argument('--review', type=Path)
args = parser.parse_args()
cv2.setNumThreads(3)
cal = json.loads((SOURCE / 'tools/car-hood-calibration.json').read_text())
master = SOURCE / 'assets/coupe-studio-master.png'
body_path = args.body_photo or (master if master.exists() else SOURCE / 'assets/coupe-studio.webp')
body = Image.open(body_path).convert('RGBA')
opened = Image.open(SOURCE / 'assets/car-studio-open.webp').convert('RGBA')
if body.size != (1672, 941) or opened.size != body.size:
    raise ValueError('Both studio photos must be 1672 x 941')
size = body.size
closed = Image.new('RGBA', size)
closed.paste(body, (1, 110))


def outline(curves):
    points = []
    for curve in curves:
        a, b, c, d = np.array(curve, float)
        for t in np.linspace(0, 1, 151):
            points.append((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d)
    mask = Image.new('L', (size[0]*4, size[1]*4))
    ImageDraw.Draw(mask).polygon([(round(x*4), round(y*4)) for x, y in points], fill=255)
    return mask.resize(size, Image.Resampling.LANCZOS)


def extract(photo, mask):
    data = np.array(photo)
    data[:, :, 3] = np.minimum(data[:, :, 3], np.array(mask))
    return data


opening = outline(cal['opening_cubics'])
base = Image.composite(opened, closed, opening)
top = extract(closed, opening)
inner = extract(opened, outline(cal['open_mask_cubics']))
# Detached hardware is drawn between its actual fixed and moving anchors.
rods = np.zeros((size[1], size[0]), np.uint8)
cv2.line(rods, (350, 286), (337, 343), 255, 8)
cv2.line(rods, (978, 286), (1008, 397), 255, 8)
rods[inner[:, :, 3] < 200] = 0
inner[:, :, :3] = cv2.inpaint(inner[:, :, :3], rods, 5, cv2.INPAINT_TELEA)
HC = np.array(cal['H_closed'])
HS = np.array(cal['H_open_source'])
p1, p2, p4 = HC.T
p3 = np.array(cal['p3'])
inverse_closed, inverse_open = np.linalg.inv(HC), np.linalg.inv(HS)


def warp(photo, matrix):
    data = photo.astype(np.float32) / 255
    data[:, :, :3] *= data[:, :, 3, None]
    data = cv2.warpPerspective(data, matrix, size, flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_CONSTANT)
    data = np.clip(data, 0, 1)
    data[:, :, :3] = np.divide(data[:, :, :3], data[:, :, 3, None],
                              out=np.zeros_like(data[:, :, :3]),
                              where=data[:, :, 3, None] > 1e-5)
    return Image.fromarray(np.uint8(np.clip(data, 0, 1)*255 + .5))


def point(matrix, x, y):
    value = matrix @ [x, y, 1]
    return tuple(value[:2] / value[2])


def hardware(image, matrix, angle):
    if angle < 1:
        return image
    layer = Image.new('RGBA', size)
    draw = ImageDraw.Draw(layer)
    for lower, upper in [((412, 440), (351, 284)), ((1009, 461), (978, 285))]:
        upper = point(matrix @ inverse_open, *upper)
        lower = tuple(lower)
        middle = tuple(.46*np.array(lower) + .54*np.array(upper))
        draw.line([lower, upper], fill=(9, 11, 12, 255), width=7)
        draw.line([lower, middle], fill=(63, 68, 69, 255), width=5)
        draw.line([middle, upper], fill=(166, 173, 171, 255), width=2)
    return Image.alpha_composite(image, layer)


def lights(image, power):
    if not power:
        return image
    mask = Image.new('L', size)
    d = ImageDraw.Draw(mask)
    near = [(641, 561), (655, 577), (660, 580), (670, 579), (763, 575)]
    outer = [(787, 598), (814, 593), (828, 590), (835, 574), (847, 549)]
    far = [(126, 541), (114, 573), (114, 580), (124, 583)]
    far_inner = [(149, 569), (175, 573), (192, 558)]
    for points in [near, outer, far, far_inner]:
        d.line(points, fill=255, width=4, joint='curve')
    d.ellipse((812, 557, 830, 578), fill=200)
    d.ellipse((134, 550, 144, 566), fill=160)
    # Emission follows the real lamps; no painted beam or moving car overlay.
    glow = mask.filter(ImageFilter.GaussianBlur(9))
    result = np.array(image).astype(np.float32)
    intensity = np.array(mask).astype(np.float32)/255
    halo = np.array(glow).astype(np.float32)/255
    for channel, color in enumerate([222, 239, 255]):
        strength = np.clip((intensity*.93 + halo*1.8)*power, 0, .99)
        result[:, :, channel] += (color-result[:, :, channel])*strength
    return Image.fromarray(np.uint8(np.clip(result, 0, 255)+.5))


def place(image):
    scale, x, y = (cal['placement'][key] for key in ['scale', 'x', 'y'])
    frame = Image.new('RGBA', (1080, 600))
    resized = image.resize((round(size[0]*scale), round(size[1]*scale)), Image.Resampling.LANCZOS)
    frame.paste(resized, (x, y))
    return frame


frames, motion = [], []
base_stage = place(base)
closing_panel = extract(closed, opening.filter(ImageFilter.MaxFilter(13)))
profile = np.array(cal['profile'])
for index in range(48):
    # Preserve the reference descent profile, then ignite after the latch.
    fraction = np.interp(min(index, 46), profile[:, 0], profile[:, 1])
    angle = cal['initial_angle']*fraction
    if angle < .015:
        layer = Image.fromarray(closing_panel)
    else:
        t = np.deg2rad(angle)
        matrix = np.column_stack((p1, p2*np.cos(t)+p3*np.sin(t), p4))
        underside = np.linalg.det(matrix) < 0
        layer = hardware(Image.new('RGBA', size), matrix, angle)
        layer = Image.alpha_composite(layer, warp(inner if underside else top,
                                  matrix @ (inverse_open if underside else inverse_closed)))
    if index == 47:
        unlit = Image.alpha_composite(base, layer)
        lit = np.array(lights(unlit, 1))
        changed = np.any(lit[:, :, :3] != np.array(unlit)[:, :, :3], axis=2)
        lit[:, :, 3] *= changed
        layer = Image.alpha_composite(layer, Image.fromarray(lit))
    overlay = place(layer)
    motion.append(overlay)
    frames.append(Image.alpha_composite(base_stage, overlay))
args.output.mkdir(parents=True, exist_ok=True)
base_stage.save(args.output / 'car-studio-base.webp', lossless=True, method=6)
for part in range(4):
    sheet = Image.new('RGBA', (3240, 2400))
    for cell in range(12):
        sheet.paste(motion[part*12+cell], ((cell % 3)*1080, (cell // 3)*600))
    sheet.save(args.output / f'car-hood-frames-{part+1}.webp', lossless=True, method=6)
for label, index in [('open', 0), ('closed', 47)]:
    frames[index].save(args.output / f'car-hood-{label}.webp', lossless=True, method=6)
if args.review:
    args.review.mkdir(parents=True, exist_ok=True)
    contact = Image.new('RGB', (2160, 1200), '#302118')
    for cell, index in enumerate([0, 6, 12, 18, 24, 30, 36, 42, 47]):
        frames[index].save(args.review / f'frame-{index:02}.png')
        bg = Image.new('RGBA', (1080, 600), '#302118')
        bg.alpha_composite(frames[index])
        contact.paste(bg.convert('RGB').resize((720, 400)), ((cell % 3)*720, (cell // 3)*400))
    contact.save(args.review / 'contact.jpg', quality=96)
    frames[0].save(args.review / 'preview.gif', save_all=True, append_images=frames[1:]+[frames[-1]]*12,
                   duration=42, loop=0, disposal=2)
print(json.dumps({'frames': len(frames), 'width': 1080, 'height': 600,
                  'body': body_path.name, 'initialAngle': cal['initial_angle']}))
