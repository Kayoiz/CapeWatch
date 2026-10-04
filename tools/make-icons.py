# Builds the app's Windows icons from the owner's icon (app/src-tauri/icons/source/CapeWatch_icon_transparent.png).
# Every size is the owner's picture itself, only scaled down (no redrawing): icon.ico (16, 24, 32, 48, 64, 256)
# and 32x32.png. The small sizes get a light sharpening after scaling so the frame and the eyes stay visible.
# Run: python tools/make-icons.py
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / 'app' / 'src-tauri' / 'icons'
SRC = Image.open(ICONS / 'source' / 'CapeWatch_icon_transparent.png').convert('RGBA')
assert SRC.size[0] == SRC.size[1], 'the icon must be square'


def scaled(size):
    im = SRC.resize((size, size), Image.LANCZOS, reducing_gap=3.0)
    if size <= 32:
        # sharpen the colour only, so the transparent edge does not get a dark halo
        rgb, a = im.convert('RGB'), im.getchannel('A')
        rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.6, percent=70 if size <= 16 else 50, threshold=0))
        im = Image.merge('RGBA', (*rgb.split(), a))
    return im


SIZES = [256, 64, 48, 32, 24, 16]
frames = {s: scaled(s) for s in SIZES}
# Pillow writes the frames it is given in append_images; it must be saved from the largest one.
frames[256].save(ICONS / 'icon.ico', format='ICO', sizes=[(s, s) for s in SIZES],
                 append_images=[frames[s] for s in SIZES[1:]])
frames[32].save(ICONS / '32x32.png')
print('icon.ico', SIZES, '+ 32x32.png from', SRC.size)
