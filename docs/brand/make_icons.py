"""Build every Tonninyira logo, favicon and app icon from one master image.

Usage (from the repository root):
    python3 -m pip install pillow
    python3 docs/brand/make_icons.py            # reads logo-source.webp

To change the logo later, replace logo-source.webp (square, white background,
artwork above the "Tonninyira / Make It Yours" wordmark) and run it again.
Then bump ?v= on the icon links and SHELL_CACHE in sw.js so browsers refresh.

Outputs (repository root):
    logo.png               full logo (art + wordmark + tagline) on white, 1024 px
    logo-icon.png          artwork only on white, 512 px (header badges, admin)
    favicon-16/32/48.png   artwork on a white rounded tile (browser tabs)
    favicon.ico            16 + 32 + 48 in one file (search results, old browsers)
    apple-touch-icon.png   180 px, opaque white (iPhone home screen)
    icon-192.png / icon-512.png   white rounded tile (Android, install prompt)
    icon-maskable-512.png  full-bleed white, art inside the 80% safe zone
    og-image.png           1200 x 630 link preview (WhatsApp, Facebook, Google)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "logo-source.webp"
WHITE = (255, 255, 255, 255)


def bounds(img, y0, y1):
    """Bounding box of non-white pixels between rows y0 and y1."""
    px = img.load()
    w = img.width
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(0, w, 2):
            if min(px[x, y][:3]) < 235:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def split_art(img):
    """Artwork box (above the wordmark) and the whole-logo box."""
    px = img.load()
    rows = [any(min(px[x, y][:3]) < 235 for x in range(img.width)) for y in range(img.height)]
    # The first blank gap (10+ rows) after the artwork separates it from the wordmark.
    top = rows.index(True)
    y = top
    while any(rows[y:y + 10]):
        y += 1
    art = bounds(img, top, y)
    bottom = len(rows) - rows[::-1].index(True)
    full = bounds(img, top, bottom)
    return art, full


def fit(img, size, scale):
    """img centred on a transparent square of `size`, at `scale` of the side."""
    side = round(size * scale)
    r = min(side / img.width, side / img.height)
    small = img.resize((max(1, round(img.width * r)), max(1, round(img.height * r))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(small, ((size - small.width) // 2, (size - small.height) // 2))
    return out


def tile(art, size, pad, radius=0.0, transparent_corners=True):
    """White (optionally rounded) square with the artwork centred inside."""
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent_corners else WHITE)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=round(size * 4 * radius), fill=255)
    base.paste(Image.new("RGBA", (size, size), WHITE), (0, 0), mask.resize((size, size), Image.LANCZOS))
    base.alpha_composite(fit(art, size, 1 - 2 * pad))
    return base


def main():
    src = Image.open(SRC).convert("RGBA")
    art_box, full_box = split_art(src)
    art = src.crop(art_box)
    full = src.crop(full_box)

    # Full logo: keep the designer's square framing.
    src.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(ROOT / "logo.png", optimize=True)

    # Artwork only, white square (CSS rounds it where needed).
    tile(art, 512, 0.07, transparent_corners=False).convert("RGB").save(ROOT / "logo-icon.png", optimize=True)

    # Browser tabs: tight padding so the stall still reads at 16 px.
    favs = {s: tile(art, s, 0.04, radius=0.22) for s in (16, 32, 48)}
    for s, im in favs.items():
        im.save(ROOT / f"favicon-{s}.png", optimize=True)
    favs[48].save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[favs[16], favs[32]])

    tile(art, 180, 0.10, transparent_corners=False).convert("RGB").save(ROOT / "apple-touch-icon.png", optimize=True)
    for s in (192, 512):
        tile(art, s, 0.08, radius=0.22).save(ROOT / f"icon-{s}.png", optimize=True)
    # Maskable: launchers may crop to a circle of 80% diameter, so keep the art well inside.
    tile(art, 512, 0.20, transparent_corners=False).convert("RGB").save(ROOT / "icon-maskable-512.png", optimize=True)

    # Link preview: full logo centred on white.
    og = Image.new("RGBA", (1200, 630), WHITE)
    h = round(630 * 0.86)
    w = round(full.width * h / full.height)
    og.alpha_composite(full.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, (630 - h) // 2))
    og.convert("RGB").save(ROOT / "og-image.png", optimize=True)
    print("art", art_box, "full", full_box)


if __name__ == "__main__":
    main()
