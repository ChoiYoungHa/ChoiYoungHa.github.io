from __future__ import annotations

import argparse
import binascii
import hashlib
import io
import json
import math
import shutil
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ATLAS_SIZE = 1024
CELL_SIZE = 256


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import the approved 2D conti portraits, key art, FX masks and UI frames."
    )
    parser.add_argument(
        "--conti-assets-dir",
        type=Path,
        default=ROOT.parent / "게임콘티" / "assets",
    )
    parser.add_argument("--output-root", type=Path, default=ROOT)
    return parser.parse_args()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(path: Path) -> Path:
    if not path.is_file():
        raise FileNotFoundError(f"required conti asset is missing: {path}")
    return path


def copy_portraits(items_dir: Path, output_root: Path) -> list[Path]:
    output_dir = output_root / "public" / "ui" / "portraits"
    output_dir.mkdir(parents=True, exist_ok=True)
    mapping = {
        "por-warrior.png": "player-warrior.png",
        "por-stan.png": "stan.png",
        "por-maya.png": "maya.png",
    }
    outputs = []
    for source_name, output_name in mapping.items():
        output = output_dir / output_name
        shutil.copyfile(require(items_dir / source_name), output)
        outputs.append(output)
    return outputs


def build_title(items_dir: Path, output_root: Path) -> Path:
    source = Image.open(require(items_dir / "keyart-henesys.png")).convert("RGB")
    title = source.resize((1280, 720), Image.Resampling.LANCZOS)
    encoded = None
    selected_quality = None
    for quality in range(82, 49, -2):
        candidate = io.BytesIO()
        title.save(candidate, format="WEBP", quality=quality, method=6)
        if candidate.tell() <= 300_000:
            encoded = candidate.getvalue()
            selected_quality = quality
            break
    if encoded is None or selected_quality is None:
        raise RuntimeError("title key art could not meet the 300 KB limit")
    output = output_root / "public" / "ui" / "title-keyart.webp"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encoded)
    return output


def polar_square_frame(
    source: Image.Image,
    output_size: int,
    border_size: int,
    inner_radius: float,
    outer_radius: float,
    brightness: float,
) -> Image.Image:
    source = source.convert("RGBA")
    source_pixels = source.load()
    result = Image.new("RGBA", (output_size, output_size), (0, 0, 0, 0))
    result_pixels = result.load()
    source_cx = (source.width - 1) / 2
    source_cy = (source.height - 1) / 2
    output_center = (output_size - 1) / 2

    for y in range(output_size):
        for x in range(output_size):
            edge_distance = min(x, y, output_size - 1 - x, output_size - 1 - y)
            if edge_distance >= border_size:
                continue
            t = edge_distance / max(1, border_size - 1)
            radius = outer_radius + (inner_radius - outer_radius) * t
            angle = math.atan2(y - output_center, x - output_center)
            source_x = round(source_cx + math.cos(angle) * radius)
            source_y = round(source_cy + math.sin(angle) * radius)
            red, green, blue, alpha = source_pixels[source_x, source_y]
            if edge_distance >= border_size - 2:
                alpha = round(alpha * (border_size - edge_distance) / 2)
            result_pixels[x, y] = (
                min(255, round(red * brightness)),
                min(255, round(green * brightness)),
                min(255, round(blue * brightness)),
                alpha,
            )
    return result


def build_frames(items_dir: Path, output_root: Path) -> list[Path]:
    output_dir = output_root / "public" / "ui" / "frame"
    output_dir.mkdir(parents=True, exist_ok=True)
    definitions = [
        ("panel-frame.png", "skl-flameslash.png", 88.0, 110.0, 0.78),
        ("button-frame.png", "ui-coin.png", 76.0, 96.0, 1.04),
    ]
    outputs = []
    for output_name, source_name, inner_radius, outer_radius, brightness in definitions:
        frame = polar_square_frame(
            Image.open(require(items_dir / source_name)),
            output_size=96,
            border_size=24,
            inner_radius=inner_radius,
            outer_radius=outer_radius,
            brightness=brightness,
        )
        output = output_dir / output_name
        frame.save(output, format="PNG", optimize=True, compress_level=9)
        outputs.append(output)
    return outputs


def white_alpha_mask(source: Image.Image) -> Image.Image:
    alpha = np.asarray(source.convert("RGBA"), dtype=np.uint8)[..., 3]
    binary = np.where(alpha >= 48, 255, 0).astype(np.uint8)
    softened = Image.fromarray(binary, "L").filter(ImageFilter.GaussianBlur(0.55))
    softened_array = np.asarray(softened, dtype=np.uint8).copy()
    softened_array[softened_array < 12] = 0
    rgba = np.full((source.height, source.width, 4), 255, dtype=np.uint8)
    rgba[..., 3] = softened_array
    return Image.fromarray(rgba, "RGBA")


def write_filter_zero_png(image: Image.Image, output: Path) -> None:
    rgba = image.convert("RGBA")
    stride = rgba.width * 4
    pixels = rgba.tobytes()
    raw = b"".join(
        b"\0" + pixels[y * stride : (y + 1) * stride] for y in range(rgba.height)
    )

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", rgba.width, rgba.height, 8, 6, 0, 0, 0)
    output.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, level=9))
        + chunk(b"IEND", b"")
    )


def transformed_mask(
    items_dir: Path,
    source_name: str,
    scale: float = 1,
    rotation: float = 0,
) -> Image.Image:
    source = white_alpha_mask(Image.open(require(items_dir / f"{source_name}.png")))
    if scale != 1:
        scaled_size = max(1, round(CELL_SIZE * scale))
        source = source.resize((scaled_size, scaled_size), Image.Resampling.LANCZOS)
    if rotation != 0:
        source = source.rotate(rotation, Image.Resampling.BICUBIC, expand=False)
    canvas = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (255, 255, 255, 0))
    canvas.alpha_composite(
        source,
        ((CELL_SIZE - source.width) // 2, (CELL_SIZE - source.height) // 2),
    )
    return canvas


def build_fx_atlas(items_dir: Path, output_root: Path) -> Path:
    definitions = [
        ("fx-slash-arc", 0.82, -8),
        ("fx-slash-arc", 0.94, 0),
        ("fx-slash-arc", 1.02, 8),
        ("fx-flame", 1.0, 0),
        ("fx-rainbow-trail", 0.82, -5),
        ("fx-rainbow-trail", 0.9, -2),
        ("fx-rainbow-trail", 0.98, 2),
        ("fx-rainbow-trail", 1.04, 5),
        ("fx-icicle", 0.98, 0),
        ("fx-frost-ring", 0.9, 0),
        ("fx-icicle", 0.9, -10),
        ("fx-icicle", 0.9, 10),
        ("fx-slash-arc", 0.9, -28),
        ("fx-slash-arc", 0.9, 28),
        ("fx-hit-spark", 1.0, 0),
        ("fx-shockwave", 1.0, 0),
    ]
    atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (255, 255, 255, 0))
    for index, (source_name, scale, rotation) in enumerate(definitions):
        cell = transformed_mask(items_dir, source_name, scale, rotation)
        atlas.alpha_composite(cell, ((index % 4) * CELL_SIZE, (index // 4) * CELL_SIZE))
    output = output_root / "public" / "textures" / "fx_atlas.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    write_filter_zero_png(atlas, output)
    return output


def describe(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        return {
            "path": str(path.resolve()),
            "bytes": path.stat().st_size,
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "sha256": sha256(path),
        }


def main() -> None:
    args = parse_args()
    assets_dir = args.conti_assets_dir.resolve()
    output_root = args.output_root.resolve()
    items_dir = assets_dir / "items"
    outputs = [
        *copy_portraits(items_dir, output_root),
        build_title(items_dir, output_root),
        build_fx_atlas(items_dir, output_root),
        *build_frames(items_dir, output_root),
    ]
    print(json.dumps({"ok": True, "outputs": [describe(path) for path in outputs]}, indent=2))


if __name__ == "__main__":
    main()
