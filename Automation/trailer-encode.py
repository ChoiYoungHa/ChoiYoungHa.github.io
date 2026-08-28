# 2026-08-28 트레일러 인코딩(Blender 5.2 헤드리스): 캡처 프레임(가변 간격)을 30fps 로 리샘플해 VSE 이미지 스트립으로 얹고 H.264 MP4 로 렌더한다.
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python Automation/trailer-encode.py -- <captureDir> <out.mp4> [fps]
import bpy, json, os, sys, shutil

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
CAP = argv[0] if argv else 'Docs/trailer/capture'
OUT = argv[1] if len(argv) > 1 else 'Docs/trailer/trailer.mp4'
FPS = int(argv[2]) if len(argv) > 2 else 30
CAP = os.path.abspath(CAP); OUT = os.path.abspath(OUT)

meta = json.load(open(os.path.join(CAP, 'frames.json'), encoding='utf-8'))
frames = meta['frames']
if not frames:
    raise SystemExit('no frames')
W, H = meta['width'], meta['height']

# 마커별 하이라이트 창(초). take='first' 는 마커 직후, 'last' 는 다음 마커 직전(대기·이동을 잘라낸다).
WINDOWS = {
    'title': ('first', 7.0), 'create': ('first', 4.5), 'forest': ('first', 6.5), 'multiplayer': ('first', 9.0),
    'village': ('first', 6.0), 'stan': ('first', 9.0), 'shop': ('first', 9.5), 'park': ('first', 20.0), 'boss': ('first', 26.0), 'end': ('first', 5.5),
}
# 스크린캐스트는 화면이 바뀔 때만 프레임을 보낸다(정적 화면 = 프레임 없음) → 구간 길이는 프레임이 아니라 **마커 벽시계**로 잡고,
# 새 프레임이 없는 틱은 마지막 프레임을 유지(hold)한다. frames[].t 는 CDP 메타 타임스탬프(epoch 초) = markers[].at/1000 과 같은 시계.
all_markers = meta.get('markers', [])
markers = [m for m in all_markers if not m['name'].startswith('cut-') and m['name'] != 'done']
def next_boundary(idx):
    # 다음 마커(컷 마커 포함 — 컷 직전까지가 이 구간)
    cur_at = markers[idx]['at']
    later = [m for m in all_markers if m['at'] > cur_at]
    return min(m['at'] for m in later) / 1000.0 if later else frames[-1]['t'] + 0.5
segments = []  # 각 항목: (t_start, t_end)
for idx, m in enumerate(markers):
    take, secs = WINDOWS.get(m['name'], ('first', 6.0))
    seg_start = m['at'] / 1000.0
    seg_end = next_boundary(idx)
    if take == 'first':
        t_end = min(seg_end, seg_start + secs); t_start = seg_start
    else:
        t_start = max(seg_start, seg_end - secs); t_end = seg_end
    print('segment', m['name'], take, 'dur %.1fs' % (t_end - t_start))
    segments.append((t_start, t_end))

seq_dir = os.path.join(CAP, 'seq')
shutil.rmtree(seq_dir, ignore_errors=True); os.makedirs(seq_dir)
out_index = 0
for (t_start, t_end) in segments:
    n = max(1, int((t_end - t_start) * FPS))
    # 구간 시작 이전의 마지막 프레임부터 홀드
    j = 0
    while j + 1 < len(frames) and frames[j + 1]['t'] <= t_start:
        j += 1
    for i in range(n):
        target = t_start + i / FPS
        while j + 1 < len(frames) and frames[j + 1]['t'] <= target:
            j += 1
        out_index += 1
        dst = os.path.join(seq_dir, 'seq%06d.jpg' % out_index)
        shutil.copyfile(os.path.join(CAP, 'frames', frames[j]['name']), dst)
total = out_index
print('segments', len(segments), 'resampled frames', total, 'duration s', total / FPS)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS; scene.render.fps_base = 1
scene.render.resolution_x = W; scene.render.resolution_y = H; scene.render.resolution_percentage = 100
scene.frame_start = 1; scene.frame_end = total
if not scene.sequence_editor:
    scene.sequence_editor_create()
# 백그라운드 모드에선 sequencer 오퍼레이터 컨텍스트가 없다 → 데이터 API 로 이미지 스트립을 만들고 프레임을 이어 붙인다.
strip = scene.sequence_editor.strips.new_image(name='trailer', filepath=os.path.join(seq_dir, 'seq000001.jpg'), channel=1, frame_start=1)
for i in range(2, total + 1):
    strip.elements.append('seq%06d.jpg' % i)
strip.frame_final_duration = total

# 페이드 인/아웃(첫 0.8s·마지막 1.2s)
try:
    strip = scene.sequence_editor.strips_all[0]
    scene.frame_current = 1
    strip.blend_alpha = 0.0; strip.keyframe_insert('blend_alpha', frame=1)
    strip.blend_alpha = 1.0; strip.keyframe_insert('blend_alpha', frame=int(FPS * 0.8))
    strip.keyframe_insert('blend_alpha', frame=max(1, total - int(FPS * 1.2)))
    strip.blend_alpha = 0.0; strip.keyframe_insert('blend_alpha', frame=total)
except Exception as e:  # noqa: BLE001
    print('fade skipped', e)

scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.constant_rate_factor = 'HIGH'
scene.render.ffmpeg.ffmpeg_preset = 'GOOD'
scene.render.ffmpeg.gopsize = FPS
scene.render.ffmpeg.audio_codec = 'NONE'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.render.filepath = OUT
bpy.ops.render.render(animation=True)
print('wrote', OUT, os.path.getsize(OUT) if os.path.exists(OUT) else -1)
