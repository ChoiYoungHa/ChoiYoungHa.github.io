# 로드맵 선언 증거 → 실제 증거 매핑 — R36-C

- 작성일: 2026-08-26
- 기준 HEAD: `3552126`
- 입력: `Docs/qa/consistency-review.md`, `로드맵.md`, git 이력
- 검사: 선언 경로와 실제 증거 경로를 프로젝트 루트 기준 `fs.existsSync`로 재검사
- 결과: 선언 부재 19건 중 대체 증거 존재 17건, 실제 증거 없음 2건

## 전수 매핑표

`존재`는 이 문서 작성 시 파일 존재를 실측했다는 뜻이다. 같은 대체 증거가 여러 선언 파일의 완료 조건을 함께 입증하면 행마다 반복했다.

| # | 행 ID | 선언 산출물 경로(현재 부재) | 실제 증거 경로(존재 실측) | 대체 사유/상태 | 근거 커밋 |
|---:|---|---|---|---|---|
| 1 | M0b-19 | `Docs/perf/m0b-process-ram.png` | **없음 — 대기: 영하님** (`Docs/perf/process-ram-howto.md`는 절차만 존재) | 작업관리자 Chrome 프로세스 트리 PNG 수동 캡처 미확보; 육안 ≈2GB만 조건부 판정에 사용 | `1964b6f`(조건부 판정), `0f5c2c1`(절차) |
| 2 | M0b-19 | `Docs/perf/m0b-process-ram.csv` | **없음 — 대기: 영하님** (`Docs/perf/m4-process-ram.csv`는 빈 후속 템플릿) | M0b 정밀 숫자 CSV 미확보; 템플릿은 실측 증거가 아님 | `1964b6f`, `0f5c2c1` |
| 3 | M1-02 | `DCC/terrain_250m.blend` | `src/scene/terrain/heightmap.ts`, `Docs/m1/terrain-smoke.json` — **존재** | Blender 미설치로 결정적 절차적 heightmap으로 대체 | `3dcd42b` |
| 4 | M1-03 | `DCC/exports/terrain_250m.glb` | `src/scene/Terrain.tsx`, `Docs/m1/terrain-smoke.json` — **존재** | DCC export 없이 절차적 지형을 런타임에서 생성 | `3dcd42b` |
| 5 | M1-03 | `public/models/terrain_250m.glb` | `src/scene/Terrain.tsx`, `src/scene/terrain/heightmap.ts`, `Docs/m1/terrain-smoke.json` — **존재** | runtime GLB 대신 16청크 절차적 메시 사용 | `3dcd42b` |
| 6 | M1-15 | `public/textures/T_*_1K.*` | `Docs/m1/texture-check.md`, `src/data/assets.csv` — **존재** | Kenney GLB 6종은 텍스처 0, 단색 `KHR_materials_unlit`; 1K/4K 제한은 N/A, 4K 0 | `9c1d0f7` |
| 7 | M2-02 | `DCC/Environment/SM_HeroTree_Trunk.blend` | `src/scene/hero/heroTreeGeometry.ts`, `Docs/qa/m2-herotree.json` — **존재** | 줄기를 코드로 절차적 생성; tris·피벗 실측 보존 | `e373c58` |
| 8 | M2-03A | `DCC/Environment/SM_HeroTree_Branches.blend` | `src/scene/hero/heroTreeGeometry.ts`, `Docs/qa/m2-herotree.json` — **존재** | 가지 A/B/C를 seed 고정 코드 모듈로 대체 | `e373c58` |
| 9 | M2-04A | `DCC/Environment/SM_HeroTree_Canopy.blend` | `src/scene/hero/heroTreeGeometry.ts`, `Docs/qa/m2-canopy-budget.json` — **존재** | alpha card 대신 저폴리 canopy A/B 코드 모듈 | `e373c58` |
| 10 | M2-05 | `DCC/Environment/SM_HeroTree_A.blend` | `src/scene/hero/heroTreeGeometry.ts`, `Docs/qa/m2-herotree.json` — **존재** | 6개 논리 모듈·LOD0 2,416 tris를 절차적 조립 | `e373c58` |
| 11 | M2-06 | `DCC/exports/herotree_modules.glb` | `src/scene/hero/heroTreeGeometry.ts`, `Docs/qa/m2-herotree.json` — **존재** | export GLB 없이 LOD0/LOD1(2,416/718 tris)을 코드 생성 | `e373c58` |
| 12 | M2-11A | `DCC/Architecture/SM_House_A.blend` | `src/scene/village/houseGeometry.ts`, `Docs/qa/m2-house-a.json` — **존재** | 집 A를 고정 절차적 geometry+vertex color로 대체 | `34e93a5` |
| 13 | M2-12 | `DCC/Architecture/SM_House_B.blend` | `src/scene/village/houseGeometry.ts`, `Docs/qa/m2-house-a.json` — **존재** | 집 B 변형과 실루엣 수치를 코드/JSON으로 보존 | `34e93a5` |
| 14 | M2-13 | `DCC/Architecture/SM_House_C.blend` | `src/scene/village/houseGeometry.ts`, `Docs/qa/m2-house-a.json` — **존재** | 집 C 변형과 실루엣 수치를 코드/JSON으로 보존 | `34e93a5` |
| 15 | M2-14 | `DCC/Architecture/SM_Roof_A.blend` | `src/scene/village/roofGeometry.ts`, `Docs/qa/m2-house-a.json` — **존재** | 지붕 A를 고정 절차적 geometry+vertex color로 대체 | `34e93a5` |
| 16 | M2-15 | `DCC/Architecture/SM_Roof_B.blend` | `src/scene/village/roofGeometry.ts`, `Docs/qa/m2-house-a.json` — **존재** | 지붕 B 변형·경사·tris를 코드/JSON으로 보존 | `34e93a5` |
| 17 | M2-16 | `DCC/Architecture/SM_Roof_C.blend` | `src/scene/village/roofGeometry.ts`, `Docs/qa/m2-house-a.json` — **존재** | 지붕 C 변형·경사·tris를 코드/JSON으로 보존 | `34e93a5` |
| 18 | M2-17 | `public/textures/village_atlas_1k.ktx2` | `src/scene/village/houseGeometry.ts`, `src/scene/village/roofGeometry.ts`, `Docs/qa/m2-house-a.json` — **존재** | atlas 없이 집·지붕 정점색 3종; `assets.csv`의 texture는 `none` | `34e93a5` |
| 19 | M2-18 | `public/models/village_kit.glb` | `src/scene/Village.tsx`, `src/scene/village/houseGeometry.ts`, `src/scene/village/roofGeometry.ts`, `Docs/m2/village-smoke.json` — **존재** | runtime GLB 대신 절차적 geometry를 InstancedMesh로 조립 | `34e93a5` |

## 집계

- 선언 경로 부재: 19/19
- 실제 대체 증거 존재: 17/19
- 실제 증거 없음: 2/19(M0b-19 PNG·CSV)
- 대체 유형: 절차적 지형 3, texture-none 1, 절차적 hero 5, 절차적/vertex-color village 8, RAM 수동 대기 2

## 로드맵 부록 문안 초안(10줄 이내)

1. M1·M2는 Blender 미설치와 D-1 마감 때문에 master 승인으로 절차적 geometry를 사용했다.
2. 따라서 완료일에 “절차적 대체/N/A”가 적힌 행의 구 `.blend`·`.glb` 선언 경로는 필수 파일이 아니라 대체 전 계약이다.
3. M1 지형 증거는 `src/scene/terrain/heightmap.ts`, `src/scene/Terrain.tsx`, `Docs/m1/terrain-smoke.json`이다.
4. M1-15는 Kenney GLB 6종의 텍스처가 0이므로 `Docs/m1/texture-check.md`의 4K 0/N/A 판정을 쓴다.
5. M2 수목 증거는 `src/scene/hero/heroTreeGeometry.ts`와 `Docs/qa/m2-herotree.json`이다.
6. M2 집·지붕 증거는 `src/scene/village/*Geometry.ts`, `src/scene/Village.tsx`, `Docs/qa/m2-house-a.json`이다.
7. M2 atlas는 정점색으로, village GLB는 절차적 InstancedMesh로 대체됐다.
8. 전체 선언→실제 경로 매핑은 `Docs/qa/roadmap-evidence-map.md`를 정본으로 삼는다.
9. M0b-19 RAM PNG·CSV는 대체 증거가 없으며 영하님 수동 측정 전까지 조건부/보류이고 PASS가 아니다.
