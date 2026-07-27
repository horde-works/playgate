"""Сетка средних цветов картинки: sips ужимает до N×N, дальше читаем BMP."""
import struct, subprocess, sys, os, tempfile

def grid(path, n=8):
    tmp = tempfile.mktemp(suffix=".bmp")
    subprocess.run(["sips", "-Z", str(n), "-s", "format", "bmp", path, "--out", tmp],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    d = open(tmp, "rb").read()
    os.unlink(tmp)
    off = struct.unpack_from("<I", d, 10)[0]
    w, h = struct.unpack_from("<ii", d, 18)
    bpp = struct.unpack_from("<H", d, 28)[0] // 8
    topdown = h < 0
    h = abs(h)
    row = (w * bpp + 3) // 4 * 4
    out = []
    for y in range(h):
        yy = y if topdown else h - 1 - y
        line = []
        for x in range(w):
            i = off + yy * row + x * bpp
            b, g, r = d[i], d[i + 1], d[i + 2]
            line.append("#%02x%02x%02x" % (r, g, b))
        out.append(line)
    return out

for path in sys.argv[1:]:
    print(f"--- {os.path.basename(path)}")
    for line in grid(path):
        print("  " + " ".join(line))
