"""Generates the ANZIKA app icon: a Guy Fawkes / anonymous hacker mask."""

from PIL import Image, ImageDraw, ImageFilter

SIZE = 2048
SCALE = SIZE / 512


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def diagonal_gradient(size, c1, c2):
    small = 256
    img = Image.new("RGB", (small, small))
    px = img.load()
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * (small - 1))
            px[x, y] = lerp(c1, c2, t)
    return img.resize((size, size), Image.LANCZOS)


def matrix_rain(draw, size, seed=7):
    """Faint vertical glyph streaks for hacker flavour."""
    import random

    s = size / 512
    rng = random.Random(seed)
    cols = 26
    step = size // cols
    for c in range(cols):
        x = c * step + step // 4
        y = 0
        while y < size:
            block = rng.randint(int(14 * s), int(46 * s))
            gap = rng.randint(int(26 * s), int(120 * s))
            alpha = rng.randint(14, 34)
            w = max(2, int(7 * s))
            draw.rectangle(
                [x, y, x + w, y + block], fill=(34, 197, 94, alpha)
            )
            y += block + gap


def build(size=SIZE):
    s = size / 512
    u = size / 2048
    ink = (8, 12, 22)
    deep = (6, 26, 18)
    hood = (16, 24, 38)
    hood_dark = (10, 15, 25)
    face = (242, 239, 230)
    black = (12, 14, 18)
    red = (214, 82, 82)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # background: dark diagonal gradient + matrix rain
    grad = diagonal_gradient(size, ink, deep).convert("RGBA")
    rain = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    matrix_rain(ImageDraw.Draw(rain), size)
    grad = Image.alpha_composite(grad, rain)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [16 * s, 16 * s, 496 * s, 496 * s], radius=112 * s, fill=255
    )
    canvas.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(canvas)

    # hood: shoulders + arch around the mask
    draw.ellipse(
        [1024 * u - 470 * u, 1120 * u - 620 * u, 1024 * u + 470 * u, 1120 * u + 640 * u],
        fill=hood + (255,),
    )
    draw.ellipse(
        [1024 * u - 700 * u, 700 * u, 1024 * u + 700 * u, 2600 * u],
        fill=hood_dark + (255,),
    )
    # neon rim light on hood
    draw.arc(
        [1024 * u - 690 * u, 710 * u, 1024 * u + 690 * u, 2500 * u],
        205, 335, fill=(34, 197, 94, 130), width=int(14 * u),
    )

    # mask layer (face + chin), drawn on its own layer for clean edges
    face_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fd = ImageDraw.Draw(face_layer)
    fd.ellipse(
        [1024 * u - 472 * u, 1140 * u - 560 * u, 1024 * u + 472 * u, 1140 * u + 560 * u],
        fill=face + (255,),
    )
    fd.polygon(
        [
            (1024 * u - 390 * u, 1400 * u),
            (1024 * u + 390 * u, 1400 * u),
            (1024 * u + 130 * u, 1730 * u),
            (1024 * u, 1858 * u),
            (1024 * u - 130 * u, 1730 * u),
        ],
        fill=face + (255,),
    )
    canvas = Image.alpha_composite(canvas, face_layer)
    draw = ImageDraw.Draw(canvas)

    # eyebrows — thin arches
    for bx in (780, 1068):
        draw.arc(
            [bx * u, 975 * u, (bx + 200) * u, 1090 * u],
            200, 340, fill=black + (255,), width=int(24 * u),
        )

    # eyes — narrow black almonds
    draw.ellipse([795 * u, 1100 * u, 965 * u, 1188 * u], fill=black + (255,))
    draw.ellipse([1083 * u, 1100 * u, 1253 * u, 1188 * u], fill=black + (255,))
    # slight angry tilt: cut outer corners back with face colour
    draw.polygon(
        [(795 * u, 1100 * u), (860 * u, 1100 * u), (795 * u, 1150 * u)],
        fill=face + (255,),
    )
    draw.polygon(
        [(1253 * u, 1100 * u), (1188 * u, 1100 * u), (1253 * u, 1150 * u)],
        fill=face + (255,),
    )

    # cheeks — soft red circles
    cheek = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cheek)
    cd.ellipse([690 * u, 1300 * u, 840 * u, 1450 * u], fill=red + (205,))
    cd.ellipse([1208 * u, 1300 * u, 1358 * u, 1450 * u], fill=red + (205,))
    cheek = cheek.filter(ImageFilter.GaussianBlur(int(10 * u)))
    canvas = Image.alpha_composite(canvas, cheek)
    draw = ImageDraw.Draw(canvas)

    # nose
    draw.line(
        [(1024 * u, 1196 * u), (1024 * u, 1308 * u)],
        fill=(150, 146, 138, 235), width=int(15 * u),
    )
    draw.ellipse(
        [1010 * u, 1288 * u, 1038 * u, 1316 * u],
        fill=(150, 146, 138, 235),
    )

    # signature mustache — drooping middle, tips curling up
    must = [
        (812, 1288), (856, 1338), (928, 1372), (1024, 1384),
        (1120, 1372), (1192, 1338), (1236, 1288),
    ]
    mpts = [(x * u, y * u) for x, y in must]
    draw.line(mpts, fill=black + (255,), width=int(56 * u), joint="curve")
    for p, r in ((mpts[0], 30), (mpts[-1], 30)):
        rr = r * u
        # upturned tip
        draw.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=black + (255,))
    # curl the very tips upward
    draw.line(
        [(812 * u, 1288 * u), (796 * u, 1252 * u)],
        fill=black + (255,), width=int(34 * u), joint="curve",
    )
    draw.line(
        [(1236 * u, 1288 * u), (1252 * u, 1252 * u)],
        fill=black + (255,), width=int(34 * u), joint="curve",
    )

    # under-lip line + pointed goatee
    draw.line(
        [(1024 * u, 1446 * u), (1024 * u, 1534 * u)],
        fill=black + (255,), width=int(16 * s),
    )
    draw.polygon(
        [(968 * u, 1568 * u), (1080 * u, 1568 * u), (1024 * u, 1716 * u)],
        fill=black + (255,),
    )

    return canvas.resize((512, 512), Image.LANCZOS)


if __name__ == "__main__":
    build().save("build/icon.png")
    build(256).save("build/icon-256.png")
    build(160).save("src/renderer/src/assets/mask.png")
    print("icons written")
