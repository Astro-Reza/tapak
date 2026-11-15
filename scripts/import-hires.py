"""Exports the 1 m HiRISE slope and hillshade from a marswalk-dataset checkout into public/data/layers.

    python scripts/import-hires.py <path to marswalk-dataset>

Reads data/processed/hires.npz (elev uint16 * 0.01 m + elev0, slope uint8 * 0.25 deg; 65535 / 255 = no data) and writes
  hires-slope.png  8-bit grey, slope in quarter degrees (255 = no data), the same encoding as the dataset
  hires-shade.jpg  8-bit grey Lambertian hillshade, sun from the north-west at 45 deg (the GUI's default)
plus their grid in hires.json. Same footprint as the app's 4 m planning grid. Needs numpy and Pillow.
Source: https://github.com/Astro-Reza/marswalk-dataset
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

if len(sys.argv) < 2:
    sys.exit("usage: python scripts/import-hires.py <path to marswalk-dataset>")
src = Path(sys.argv[1]) / "data/processed/hires.npz"
dest = Path(__file__).resolve().parent.parent / "public/data/layers"
dest.mkdir(parents=True, exist_ok=True)

z = np.load(src)
meta = json.loads(str(z["meta"]))
elev_u, slope_u = z["elev"], z["slope"]
dx, dy = meta["cell_m"]

ok = elev_u != meta["nodata_u2"]
elev = elev_u.astype(np.float32) * np.float32(meta["elev_step"]) + np.float32(meta["elev0"])
elev[~ok] = np.median(elev[ok]) if ok.any() else 0

# Lambertian hillshade (gui/geo.py hillshade): rows run south, so dz/d(north) = -gradient along rows
gy, gx = np.gradient(elev)
gx /= dx
gy /= -dy
az, alt = math.radians(315.0), math.radians(45.0)
lx, ly, lz = math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)
shade = np.clip((lz - gx * lx - gy * ly) / np.sqrt(1 + gx * gx + gy * gy) * 255, 0, 255).astype(np.uint8)
shade[~ok] = 255

Image.fromarray(slope_u, "L").save(dest / "hires-slope.png", optimize=True)
Image.fromarray(shade, "L").save(dest / "hires-shade.jpg", quality=85)
(dest / "hires.json").write_text(json.dumps({
    "source": meta["source"],
    "grid": {"rows": meta["rows"], "cols": meta["cols"], "cell": meta["cell_m"], "x0": meta["x0"], "z0": meta["z0"]},
    "slope": {"file": "hires-slope.png", "step": meta["slope_step"], "nodata": meta["nodata_u1"]},
    "shade": {"file": "hires-shade.jpg", "azimuth": 315, "altitude": 45},
}, indent=1) + "\n")
print(f"wrote hires slope + shade ({meta['cols']} x {meta['rows']}) to {dest}")
