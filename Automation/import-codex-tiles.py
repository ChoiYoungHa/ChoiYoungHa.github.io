# 2026-08-28 (룩 심사안 #7) — 코덱스 시트 F 타일 4종을 2048² 2×2 아틀라스(diffuse·normal)로 조립한다. Blender 5.2 헤드리스:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python Automation/import-codex-tiles.py
# 셀 배치(파일 좌표, v=0 이 위·flipY=false 로 읽음): 0 stone-road (좌상) · 1 wood-floor (우상) · 2 farm-soil (좌하) · 3 moss-rock (우하)
import bpy, os
SRC = r"C:/Users/USER/Desktop/claude/해커톤/게임콘티/assets/3d-codex/tiles"
DST = r"C:/Users/USER/Desktop/claude/해커톤/web3d/public/textures"
CELLS = [("tile-stone-road", 0, 0), ("tile-wood-floor", 1, 0), ("tile-farm-soil", 0, 1), ("tile-moss-rock", 1, 1)]
SIZE = 1024

def build(kind, out_name, srgb):
    atlas = bpy.data.images.new(out_name, SIZE * 2, SIZE * 2, alpha=False, float_buffer=False)
    atlas.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    buf = [0.0] * (SIZE * 2 * SIZE * 2 * 4)
    for tile, cx, cy in CELLS:
        img = bpy.data.images.load(f"{SRC}/{tile}/{tile}-{kind}.png")
        img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
        assert img.size[0] == SIZE and img.size[1] == SIZE, (tile, img.size[:])
        px = list(img.pixels)  # Blender: 행 0 = 이미지 하단
        # 파일 좌표 v=0 이 위이므로, 셀 row cy=0(위)은 Blender 상단 절반(행 SIZE..2*SIZE-1)에 놓는다.
        base_row = SIZE if cy == 0 else 0
        for y in range(SIZE):
            src = y * SIZE * 4
            dst = ((base_row + y) * SIZE * 2 + cx * SIZE) * 4
            buf[dst:dst + SIZE * 4] = px[src:src + SIZE * 4]
        bpy.data.images.remove(img)
    atlas.pixels = buf
    atlas.filepath_raw = f"{DST}/{out_name}.jpg"
    atlas.file_format = 'JPEG'
    atlas.save(quality=88)
    print("wrote", atlas.filepath_raw, os.path.getsize(atlas.filepath_raw))

build("basecolor", "tiles_atlas_diffuse", True)
build("normal", "tiles_atlas_normal", False)
