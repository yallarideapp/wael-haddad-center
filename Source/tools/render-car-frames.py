#!/usr/bin/env python3
"""Fit the recorded hood onto a sharp stationary car; runs only locally.

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
parser.add_argument('--reference-frames', type=Path,
                    help='Import the previous 1080 x 600 RGBA frame PNGs (001..047)')
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
reference = cal['reference']
reference_path = SOURCE / 'assets' / reference['asset']
if args.reference_frames:
    sheet = Image.new('RGBA', (reference['width']*reference['columns'],
                               reference['height']*reference['rows']))
    for index in range(47):
        photo = Image.open(args.reference_frames / f'{index+1:03}.png').convert('RGBA')
        if photo.size != (1080, 600):
            raise ValueError('Imported reference frames must be 1080 x 600')
        x, y = reference['x'], reference['y']
        cropped = photo.crop((x, y, x+reference['width'], y+reference['height']))
        sheet.paste(cropped, ((index % reference['columns'])*reference['width'],
                              (index // reference['columns'])*reference['height']))
    sheet.save(reference_path, lossless=True, method=6)
reference_sheet = Image.open(reference_path).convert('RGBA')
if reference_sheet.size != (reference['width']*reference['columns'],
                              reference['height']*reference['rows']):
    raise ValueError('Reference sheet dimensions do not match calibration')
# One fixed registration preserves the recorded curved hood and its motion.
# There is no reconstructed rotating plane or synthetic face change.
registration = cv2.getPerspectiveTransform(np.float32(cal['source_quad']),
                                            np.float32(cal['closed_quad']))
crop_to_video = np.array([[1/reference['scale'], 0, reference['x']/reference['scale']],
                           [0, 1/reference['scale'], reference['y']/reference['scale']],
                           [0, 0, 1]])
reference_to_body = registration @ crop_to_video


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


def recorded_hood(index):
    keyframes = cal['hood_outlines']
    right = next((key for key in keyframes if key['index'] >= index), keyframes[-1])
    left = next(key for key in reversed(keyframes) if key['index'] <= index)
    amount = (index-left['index'])/max(1, right['index']-left['index'])
    points = (1-amount)*np.array(left['points']) + amount*np.array(right['points'])
    points = points*reference['scale'] - [reference['x'], reference['y']]
    mask = Image.new('L', (reference['width']*4, reference['height']*4))
    ImageDraw.Draw(mask).polygon([(round(x*4), round(y*4)) for x, y in points], fill=255)
    mask = mask.resize((reference['width'], reference['height']), Image.Resampling.LANCZOS)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.5))
    # Retain the real dampers only while they remain exposed in the footage.
    if index <= 18:
        near = [(389+13*index/18, 123+24*index/18), (402+9*index/18, 164)]
        far = [(203, 148+12*index/18), (198, 164)]
        draw = ImageDraw.Draw(mask)
        for rod in [near, far]:
            draw.line([(round(x*reference['scale']-reference['x']),
                        round(y*reference['scale']-reference['y'])) for x, y in rod],
                       fill=255, width=4)
    x = (index % reference['columns'])*reference['width']
    y = (index // reference['columns'])*reference['height']
    cell = reference_sheet.crop((x, y, x+reference['width'], y+reference['height']))
    data = np.array(cell)
    data[:, :, 3] = np.minimum(data[:, :, 3], np.array(mask))
    return warp(data, reference_to_body)


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
for index in range(48):
    if index >= 46:
        layer = Image.fromarray(closing_panel)
    else:
        layer = recorded_hood(index)
        # At the latch only, return the sharp original finish over the same seam.
        start, end = cal['closed_handoff']
        if index >= start:
            amount = (index-start+1)/(end-start+1)
            panel = closing_panel.copy()
            panel[:, :, 3] = np.uint8(panel[:, :, 3]*amount)
            layer = Image.alpha_composite(layer, Image.fromarray(panel))
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
                  'body': body_path.name, 'hood': reference_path.name}))
