#!/usr/bin/env python3
"""Derive the app and store images from the Figma exports (no network).

Usage: python3 -I derive-assets.py <exports-dir> <apps/mobile dir>

<exports-dir> holds PNG exports of the Figma nodes (file KMQtYs5sFeyMG5lgWqMJOg):
  icon.png       8:33   brand/app-icon        scale 4 (1024x1024)
  mark.png       8:7    brand/mark            scale 4 (384x512)
  medallion.png  8:26   brand/medallion       scale 4 (1280x1280)
  lockup.png     8:8    brand/lockup-on-brand scale 4 (636x304)
  s1.png s2.png s3.png  33:154 / 33:184 / 33:305  scale 1 (1320x2868)
All exports are opaque (brand green #12392c baked in); transparency is derived here.
"""
import os
import sys

import numpy as np
from PIL import Image

BG = (18, 57, 44)      # #12392c = bg/brand
GOLD = (196, 154, 60)  # mark colour


def main(dl, root):
    A = os.path.join(root, 'assets/images/')
    S = os.path.join(root, 'store/')
    P = S + 'play/ar/images/'
    for d in (A, S + 'screenshots/ar-SA/', P + 'phoneScreenshots/'):
        os.makedirs(d, exist_ok=True)

    def op(n):
        return Image.open(os.path.join(dl, n + '.png'))

    def flat(im):
        im = im.convert('RGBA')
        b = Image.new('RGB', im.size, BG)
        b.paste(im, mask=im.split()[3])
        return b

    def save(im, path):
        im.save(path, optimize=True)

    # iOS / Expo icon: opaque, no alpha
    icon = flat(op('icon'))
    save(icon, A + 'icon.png')
    save(icon.resize((48, 48), Image.LANCZOS), A + 'favicon.png')
    save(icon.resize((512, 512), Image.LANCZOS), P + 'icon.png')

    # Mark alpha: project each pixel on the bg->gold colour axis (0 = bg, 1 = gold)
    m = np.asarray(op('mark').convert('RGB')).astype(float)
    bg = np.array(BG, float)
    v = np.array(GOLD, float) - bg
    alpha = np.clip(((m - bg) @ v) / (v @ v), 0, 1)
    alpha = np.where(alpha < 0.04, 0, alpha)
    mh, mw = alpha.shape

    def mark_canvas(height_ratio):
        th = int(1024 * height_ratio)
        tw = round(mw * th / mh)
        a = Image.fromarray((alpha * 255).astype('uint8')).resize((tw, th), Image.LANCZOS)
        c = Image.new('L', (1024, 1024), 0)
        c.paste(a, ((1024 - tw) // 2, (1024 - th) // 2))
        return c

    a = mark_canvas(0.55)  # inside the adaptive-icon safe zone (inner 66%)
    fg = Image.new('RGBA', (1024, 1024), GOLD + (0,))
    fg.putalpha(a)
    save(fg, A + 'android-icon-foreground.png')
    mono = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0))
    mono.putalpha(a)
    save(mono, A + 'android-icon-monochrome.png')
    save(Image.new('RGB', (1024, 1024), BG), A + 'android-icon-background.png')

    # Splash. iOS (and default): lockup only, opaque on the exact splash green, 64 px margin
    lk = flat(op('lockup'))
    mg = 64
    sp = Image.new('RGB', (lk.width + 2 * mg, lk.height + 2 * mg), BG)
    sp.paste(lk, (mg, mg))
    save(sp, A + 'splash-icon.png')
    # Android 12+: mark only, transparent, small enough for the circular mask
    sa = Image.new('RGBA', (1024, 1024), GOLD + (0,))
    sa.putalpha(mark_canvas(0.5))
    save(sa, A + 'splash-icon-android.png')

    # Store screenshots: flatten alpha; Play copies side-padded to 9:16 on brand green
    for i, (n, nm) in enumerate(zip(('s1', 's2', 's3'), ('1_today', '2_summary', '3_weekly')), 1):
        s = flat(op(n))
        assert s.size == (1320, 2868), s.size
        save(s, S + 'screenshots/ar-SA/%s.png' % nm)
        pad = Image.new('RGB', (1613, 2868), BG)
        pad.paste(s, ((1613 - 1320) // 2, 0))
        save(pad, P + 'phoneScreenshots/%d.png' % i)

    # Play feature graphic 1024x500: medallion left, lockup right, on brand green
    fgi = Image.new('RGB', (1024, 500), BG)
    med = flat(op('medallion')).resize((500, 500), Image.LANCZOS)
    lh = 210
    lk2 = lk.resize((round(lk.width * lh / lk.height), lh), Image.LANCZOS)
    fgi.paste(med, (10, 0))
    fgi.paste(lk2, (1024 - lk2.width - 50, (500 - lh) // 2))
    save(fgi, P + 'featureGraphic.png')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
