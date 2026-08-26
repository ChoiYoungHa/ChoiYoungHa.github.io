# M5 룩 개선 A안 — 자산 파일명 계약 (R75-C, worker-claude)

코드가 **빌드 시** `public/` 을 스캔(`npm run build` 의 `prebuild` = `node Automation/look-assets.mjs`)해 `src/data/look-assets.json` 을 만들고, 런타임은 그 JSON 만 읽는다(404 시도 0). 파일이 없으면 각 경로는 현행 절차 생성으로 자동 폴백한다. `?lookAssets=0` 은 자산이 있어도 전부 폴백(A/B 캡처용). 계약의 단일 원본은 `src/systems/lookAssets.ts` `LOOK_ASSET_CONTRACT`.

| 경로 | 파일(배포 루트 기준 = `public/…`) | 포맷·채널 | 런타임 처리 | 재질 수 변화(자산 있을 때) |
|---|---|---|---|---|
| ① HeroTree LOD0 | `public/models/hero_tree.glb` | glTF 2.0 binary · Y-up · 미터 · 원점 = 밑동 중심(y=0). 메시/재질 이름에 `leaf|leaves|foliage|canopy` → 잎, 나머지 → 줄기·가지. 잎 baseColor RGBA(알파 = 컷아웃), 줄기 baseColor RGB. 재질 ≤2 권장 | 높이 48m 로 자동 정규화(`fitHeroTransform`), 잎 = alphaTest 0.5·DoubleSide·blend 없음, 줄기 = 불투명. LOD1·충돌 proxy·위치/회전/스케일(placement.json) 불변. 로딩 중·LOD1 은 절차 수목 | +N(GLB 의 (분류×텍스처) 조합 수, 보통 2: bark·leaf). 원본 GLB 재질은 버리고 룩디브 재질로 교체 |
| ② Village | `public/models/house_a.glb`, `house_b.glb`, `house_c.glb` | Y-up · 미터 · 원점 = 바닥 중심(y=0) · placement 스케일(0.85~1)이 곱해지므로 실제 크기로 제작. 메시 이름에 `cap|roof` → 인스턴스 색(지붕 3변형 `ROOF_COLORS`) 곱, 나머지 → 본체(백색 곱). baseColor 텍스처 1장 RGB(갓/지붕 영역은 밝은 무채색 권장). 종별 부분 존재 허용 | 종별 body/cap InstancedMesh(있는 것만), **3종 8채가 재질 1개 공유**(텍스처는 첫 GLB 것). 좌표·회전·스케일 placement.json 그대로. 로딩 중 그 종은 절차 폴백 | +1(공유 1개). 지붕 3변형은 instanceColor 라 재질 0 추가 |
| ③ Foliage grassLite | `public/textures/grass_card.png` | PNG RGBA(알파 = 컷아웃) · sRGB · 512² 권장 · 잎이 아래(v=0)에 뿌리, 위(v=1)로 자란다 | grassLite 크로스 쿼드(12 tris, UV 추가)에 alphaTest 0.5 · 정점색(#3B3E26) × 텍스처. 지오메트리가 양면이라 side 불변 | +0 재질 객체 수(잔디 종 재질 1개의 옵션만 바뀜) — 단 셰이더 프로그램은 map+alphaTest 변형으로 바뀐다(GPU 실측 필요) |
| ④ Terrain PBR | `public/textures/ground_grass_diffuse.jpg`, `ground_grass_normal.jpg`, `ground_dirt_diffuse.jpg`, `ground_dirt_normal.jpg` | 1K seamless · diffuse = sRGB RGB · normal = 선형 OpenGL(+Y) 탄젠트 공간 · jpg(계약 확장자 고정) | diffuse 쌍 필수, normal 쌍은 선택(하나만 있으면 둘 다 무시). 정점 속성 `pathMask`(중심선 거리 → 길 폭 1.5m 안 1, +2.5m feather 0) 로 풀/흙을 **재질 1개 안에서 TSL mix**. 타일 4m(월드 XZ UV), 곱색 `TERRAIN_COLOR×2`(L1·L5 측정으로 튜닝) | +0(colorNode/normalNode 교체, 재질 1개) — 프로그램은 바뀐다 |

## 로딩 계약
- 스캐너 출력의 `manifestSuggestions`(phase·id·url·bytes)를 `src/data/loading-manifest.json` 에 추가하는 것은 master 몫(measuredFromHead 규약 때문에 워커가 편집하지 않음). 제안 phase: 텍스처 = core, GLB = detail.
- 자산 로딩은 drei `useGLTF`/`useTexture`(Suspense) — fallback 은 절차 경로라 화면이 비지 않는다. `preload` 는 자산이 있을 때만 호출.

## 검증 방법
- `node --test Automation/test-look-assets.mjs` — 계약·4경로 분기·placeholder(코드 생성 64×64 PNG·GLB 스텁) 스캔·커밋 JSON 동기화.
- 자산을 `public/` 에 넣은 뒤 `npm run build`(prebuild 가 JSON 재생성) → 커밋 JSON 이 바뀐다. 테스트가 JSON 과 public/ 불일치를 잡는다.
- GPU 실측(programs·1%low·L1~L5)은 main 별도 라운드(master).
