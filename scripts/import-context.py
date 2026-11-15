"""Exports the marswalk-dataset map catalog (global MOLA down to the 1 m HiRISE DTM) into public/data/context.

    python scripts/import-context.py <path to marswalk-dataset>

Every raster keeps its native grid and its pixel-edge bounds in planetocentric degrees, as in gui/geo.py:
  scalar layers  RGB PNG holding the uint16 archive value (R = high byte, G = low byte; 65535 = no data),
                 decoded with offset + scale from context.json
  grey images    8-bit PNG (0 = no data)
  colour images  JPEG
The 1 m HiRISE elevation is written the same way (site-elev.png); its bounds come from the planning grid, so the
web app places it. Also copies vectors.json (rover tracks, landing sites, features), weather.json (MEDA typical day)
and the glossary behind the GUI's Search tab. Needs numpy and Pillow.
Source: https://github.com/Astro-Reza/marswalk-dataset
"""
import dataclasses
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

if len(sys.argv) < 2:
    sys.exit("usage: python scripts/import-context.py <path to marswalk-dataset>")
root = Path(sys.argv[1]).resolve()
ctx = root / "data/processed/context"
dest = Path(__file__).resolve().parent.parent / "public/data/context"
dest.mkdir(parents=True, exist_ok=True)


def packed(u: np.ndarray) -> Image.Image:
    rgb = np.zeros(u.shape + (3,), np.uint8)
    rgb[..., 0] = u >> 8
    rgb[..., 1] = u & 255
    return Image.fromarray(rgb, "RGB")


rasters = []
for f in sorted(ctx.glob("*.npz")):
    z = np.load(f)
    m = json.loads(str(z["meta"]))
    d = z["data"]
    if m.get("delta_x"):
        d = np.cumsum(d, axis=1, dtype=np.uint16)
    entry = {k: m.get(k) for k in ("id", "name", "group", "kind", "units", "ramp", "bounds", "res_m", "credit", "source", "note")}
    entry["hillshade"] = bool(m.get("hillshade"))
    entry["shape"] = list(d.shape[:2])
    if m["kind"] == "scalar":
        entry.update(file=f"{m['id']}.png", offset=m["offset"], scale=m["scale"], nodata=m["nodata"], p=m["p"])
        packed(d).save(dest / entry["file"], optimize=True)
        if d.shape[1] > 4000:
            # a 4x coarser copy for the planet-wide view; the full grid loads once the map zooms in
            k = 4
            b = d[: d.shape[0] // k * k, : d.shape[1] // k * k].reshape(d.shape[0] // k, k, d.shape[1] // k, k)
            ok = b != m["nodata"]
            n = ok.sum(axis=(1, 3))
            mean = np.where(ok, b, 0).astype(np.float64).sum(axis=(1, 3)) / np.maximum(n, 1)
            ov = np.where(n > 0, np.round(mean), m["nodata"]).astype(np.uint16)
            entry["overview"] = {"file": f"{m['id']}-overview.png", "shape": list(ov.shape)}
            packed(ov).save(dest / entry["overview"]["file"], optimize=True)
    elif m["kind"] == "gray":
        entry["file"] = f"{m['id']}.png"
        Image.fromarray(d, "L").save(dest / entry["file"], optimize=True)
    else:
        entry["file"] = f"{m['id']}.jpg"
        Image.fromarray(d, "RGB").save(dest / entry["file"], quality=88)
    rasters.append(entry)
    print(f"{entry['file']:24s} {d.shape[1]} x {d.shape[0]}  {(dest / entry['file']).stat().st_size / 1e6:.1f} MB")

# 1 m HiRISE elevation of the patch, on the planning grid's footprint
h = np.load(root / "data/processed/hires.npz")
hm = json.loads(str(h["meta"]))
packed(h["elev"]).save(dest / "site-elev.png", optimize=True)
site = {"file": "site-elev.png", "offset": hm["elev0"], "scale": hm["elev_step"], "nodata": hm["nodata_u2"],
        "shape": [hm["rows"], hm["cols"]], "res_m": 1.0, "credit": "USGS Mars 2020 TRN HiRISE DTM (doi:10.5066/P9REJ9JN)"}
print(f"site-elev.png            {hm['cols']} x {hm['rows']}")

for name in ("vectors.json",):
    shutil.copy(ctx / name, dest / name)
shutil.copy(root / "data/processed/weather.json", dest / "weather.json")

sys.path.insert(0, str(root))
from gui import geo, glossary  # noqa: E402

vectors = json.loads((ctx / "vectors.json").read_text(encoding="utf-8"))
entries = [dataclasses.asdict(e) for e in glossary.all_entries(vectors, geo.BOOKMARKS)]
(dest / "glossary.json").write_text(json.dumps({"kinds": glossary.KINDS, "entries": entries}, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"glossary.json            {len(entries)} entries")

bookmarks = [{"name": k, "lon": v[0], "lat": v[1], "height": v[2]} for k, v in geo.BOOKMARKS.items()]
(dest / "context.json").write_text(json.dumps({"rasters": rasters, "site": site, "bookmarks": bookmarks}, indent=1) + "\n")
print(f"wrote {len(rasters)} rasters to {dest}")
