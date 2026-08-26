# 에셋 계약

`계획서.md §5-1`의 Blender 5.2 LTS 규약 가운데 M0-b에서 고정할 웹 반출 계약이다.

1. **단위**: `1 unit = 1 m`. Blender의 Scene Units는 Metric, Unit Scale은 1.0으로 둔다.
2. **축**: Blender의 Z-up 자산은 glTF 반출 결과에서 `+Y up`을 따른다. 런타임 코드에서 축 변환을 다시 적용하지 않는다.
3. **원점/피벗**: 지면 접촉면 중앙에 둔다. 집은 바닥 중앙, 나무는 밑동 중앙, 지붕 모듈은 벽 상단 접합면을 쓴다.
4. **영구 ID**: 파일명과 분리해 `assets.csv`에 기록한다. 형식은 `asset.<영역>.<이름>.<변형>`이다.
5. **glTF 반출**: glTF 2.0 바이너리(`.glb`)로 `+Y up`, Apply Modifiers, Selected Objects를 적용한다. Draco는 Blender 익스포터에서 켜지 않고 후속 CLI 파이프라인에서 일괄 처리한다.

예시: 영구 ID `asset.village.house.a` ↔ 파일/오브젝트 이름 `SM_Village_House_A`.
