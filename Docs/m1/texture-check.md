# M1-15 텍스처 검사

검사일: 2026-08-26. `gltf-transform inspect`와 GLB JSON을 함께 확인했다.

| 영구 ID | 원본 tris | 텍스처 수 | 긴 변 | 4K |
|---|---:|---:|---|---:|
| `asset.env.vegetation.grass.a` | 132 | 0 | 해당 없음 | 0 |
| `asset.env.vegetation.flower.a` | 76 | 0 | 해당 없음 | 0 |
| `asset.env.vegetation.shrub.a` | 32 | 0 | 해당 없음 | 0 |
| `asset.env.rock.a` | 16 | 0 | 해당 없음 | 0 |
| `asset.env.rock.b` | 20 | 0 | 해당 없음 | 0 |
| `asset.env.rock.c` | 136 | 0 | 해당 없음 | 0 |

Kenney Nature Kit 2.1 GLB는 텍스처 대신 `KHR_materials_unlit`의 작은 단색 재질을 사용한다. 따라서 긴 변 ≤1024 조건은 해당 없음이며 원본·두 최종 묶음 모두 4K 텍스처 0개다.
