# 자산과 라이선스 감사표 — M5-15 초안

기준 HEAD는 `a55e4f2`이며, SSOT는 [`src/data/assets.csv`](../../src/data/assets.csv)다. 2026-08-27 현재 대장 **33행**을 빠짐없이 전개했고, 런타임 파일 크기는 worktree 파일의 byte stat으로 실측했다. `planned:` 2행은 아직 런타임에 배치되지 않아 크기를 `미배치`로 표시한다.

## 1. 자산 대장 전수표

| # | 자산 ID | 자산 | 출처 | 라이선스 | 출처 URL | 런타임 파일 | 크기(bytes) |
|---:|---|---|---|---|---|---|---:|
| 1 | `asset.env.vegetation.grass.a` | 케니 풀 A | kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/vegetation_kit.glb` | 16,900 |
| 2 | `asset.env.vegetation.flower.a` | 케니 노란 꽃 A | kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/vegetation_kit.glb` | 16,900 |
| 3 | `asset.env.vegetation.shrub.a` | 케니 관목 A | kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/vegetation_kit.glb` | 16,900 |
| 4 | `asset.env.rock.a` | 케니 작은 바위 A | kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/props_rocks.glb` | 12,844 |
| 5 | `asset.env.rock.b` | 케니 납작 바위 A | kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/props_rocks.glb` | 12,844 |
| 6 | `asset.env.rock.c` | 케니 키 큰 바위 A | kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/props_rocks.glb` | 12,844 |
| 7 | `asset.env.hero-tree.a` | 절차적 거대 수목 A | procedural | Project-owned | src/scene/hero/heroTreeGeometry.ts | `src/scene/hero/heroTreeGeometry.ts` | 15,688 |
| 8 | `asset.village.house.a` | 절차적 집 A | procedural | Project-owned | src/scene/village/houseGeometry.ts | `public/models/house_a.glb` | 72,524 |
| 9 | `asset.village.house.b` | 절차적 집 B | procedural | Project-owned | src/scene/village/houseGeometry.ts | `public/models/house_b.glb` | 99,296 |
| 10 | `asset.village.house.c` | 절차적 집 C | procedural | Project-owned | src/scene/village/houseGeometry.ts | `public/models/house_c.glb` | 188,028 |
| 11 | `asset.village.roof.a` | 절차적 지붕 A | procedural | Project-owned | src/scene/village/roofGeometry.ts | `src/scene/village/roofGeometry.ts` | 2,403 |
| 12 | `asset.village.roof.b` | 절차적 지붕 B | procedural | Project-owned | src/scene/village/roofGeometry.ts | `src/scene/village/roofGeometry.ts` | 2,403 |
| 13 | `asset.village.roof.c` | 절차적 지붕 C | procedural | Project-owned | src/scene/village/roofGeometry.ts | `src/scene/village/roofGeometry.ts` | 2,403 |
| 14 | `asset.env.sky.hdri.a` | Kloppenheim 03 Pure Sky | polyhaven | CC0 | https://polyhaven.com/a/kloppenheim_03_puresky | `public/env/sky_1k.hdr` | 1,428,760 |
| 15 | `asset.env.vegetation.grass-lite.a` | 절차적 저폴리 풀 A | procedural | Project-owned | src/scene/foliage/grassLiteGeometry.ts | `src/scene/foliage/grassLiteGeometry.ts` | 4,720 |
| 16 | `asset.env.rock-lite.a` | 절차적 저폴리 바위 A | procedural | Project-owned | src/scene/foliage/rockLiteGeometry.ts | `src/scene/foliage/rockLiteGeometry.ts` | 4,895 |
| 17 | `asset.hero.tree.a` | Quaternius Birch Tree 2 | quaternius | CC0 | https://quaternius.com/packs/ultimatestylizednature.html | `public/models/hero_tree.glb` | 1,389,012 |
| 18 | `asset.env.card.grass.a` | Grass Alpha Cards | opengameart+polyhaven | CC0 | https://opengameart.org/content/grass-blades-alpha-card-texture-side-view | `public/textures/grass_card.png` | 840,009 |
| 19 | `asset.env.card.flower.a` | Quaternius Flower Alpha Card | quaternius | CC0 | https://quaternius.com/packs/ultimatestylizednature.html | `planned:public/textures/flower_card.png` | 미배치 |
| 20 | `asset.tex.ground.grass.a` | Sparse Grass 1K PBR | polyhaven | CC0 | https://polyhaven.com/a/sparse_grass | `public/textures/ground_grass_diffuse.jpg` | 955,945 |
| 21 | `asset.tex.ground.dirt.a` | Grass Path 2 1K PBR | polyhaven | CC0 | https://polyhaven.com/a/grass_path_2 | `public/textures/ground_dirt_diffuse.jpg` | 716,010 |
| 22 | `asset.sky.hdri.b` | Kloofendal Partly Cloudy Pure Sky 2K | polyhaven | CC0 | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | `planned:public/env/sky_2k.hdr` | 미배치 |
| 23 | `asset.village.house.a` | KayKit red cottage A | kaykit | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/house_a.glb` | 72,524 |
| 24 | `asset.village.house.b` | KayKit red cottage B | kaykit | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/house_b.glb` | 99,296 |
| 25 | `asset.village.house.c` | KayKit red tavern cottage | kaykit | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/house_c.glb` | 188,028 |
| 26 | `asset.prop.fence.a` | KayKit wooden fence | kaykit | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_fence.glb` | 32,180 |
| 27 | `asset.prop.stonewall.a` | KayKit stone fence wall | kaykit | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_stonewall.glb` | 30,968 |
| 28 | `asset.prop.arch.a` | KayKit stone gate arch | kaykit | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_arch.glb` | 66,164 |
| 29 | `asset.prop.banner.a` | KayKit red flag banner | kaykit | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_banner.glb` | 19,584 |
| 30 | `asset.char.player.a` | Mixamo Remy + Idle/Walk/Run | mixamo | Mixamo Terms (embed OK; raw redistribution prohibited) | https://www.mixamo.com | `public/models/char_player.glb` | 14,998,652 |
| 31 | `asset.char.npc.stan` | Mixamo Peasant Man + Breathing Idle | mixamo | Mixamo Terms (embed OK; raw redistribution prohibited) | https://www.mixamo.com | `public/models/npc_stan.glb` | 4,128,292 |
| 32 | `asset.char.npc.maya` | Mixamo Peasant Girl + Breathing Idle | mixamo | Mixamo Terms (embed OK; raw redistribution prohibited) | https://www.mixamo.com | `public/models/npc_maya.glb` | 5,489,400 |
| 33 | `asset.ui.icons.set.a` | Item icon set (47) | codex image_gen | self | local:게임콘티/assets/items | `public/ui/items/wpn-sword-wooden.png` | 23,071 |

동일 런타임 파일을 공유하는 행의 크기는 파일 크기를 반복 기재한 것이며 합계로 더하지 않는다. `asset.ui.icons.set.a`는 대표 파일 한 장을 가리키지만 실제 세트는 자체 생성 PNG 47장, 총 **3,085,045 bytes**다.

## 2. 라이선스 요약

| 구분 | 대장 행 | 배포 조건 |
|---|---:|---|
| CC0 | 20 | attribution 불필요, 재배포 허용 |
| Project-owned 절차 자산 | 9 | 프로젝트 생성 코드와 함께 사용 |
| Mixamo | 3 | 런타임 임베드 GLB 사용, 원본 FBX 재배포 금지 |
| 자체 생성 아이콘 | 1 | `codex image_gen`, 프로젝트 소유 `self` |

### Mixamo 고지

- 대장 기준 캐릭터 3종은 Mixamo Terms의 **임베드 사용 허용·원본 재배포 금지** 조건으로 관리한다. 약관 링크는 https://www.adobe.com/legal/terms.html 이다.
- 배포 대상은 변환된 `public/models/char_player.glb`, `npc_stan.glb`, `npc_maya.glb`뿐이다.
- 현재 worktree의 `public/`과 `dist/`에는 FBX가 0개이고, `DCC/incoming/asset.char.*/*.fbx`는 `.gitignore`로 원본 재배포 대상에서 제외한다.

### 자체 생성 아이콘 고지

- `asset.ui.icons.set.a`는 `codex image_gen`으로 생성한 프로젝트 소유 이미지이며 외부 게임 IP에서 추출한 파일이 아니다.
- `public/ui/items/`의 47장 모두 256×256 PNG이고 대장에는 대표 파일 `wpn-sword-wooden.png`로 등록한다.

## 3. CC0 출처 감사 목록

| 출처 | 대장 행 | 자산 범위 | 출처·라이선스 근거 |
|---|---:|---|---|
| Kenney | 6 | 식생 3종·바위 3종 | [Nature Kit](https://kenney.nl/assets/nature-kit) · [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Poly Haven | 4 직접 + 1 공동 | HDRI·지면 PBR·잔디 카드 보조 | [Poly Haven](https://polyhaven.com/) · [License](https://polyhaven.com/license) |
| Quaternius | 2 | 거대 수목·꽃 카드 계획 | [Ultimate Stylized Nature](https://quaternius.com/packs/ultimatestylizednature.html) · [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| KayKit | 7 | 집 3종·마을 소품 4종 | [Medieval Hexagon](https://kaylousberg.itch.io/kaykit-medieval-hexagon) · [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| OpenGameArt | 1 공동 | 잔디 알파 카드 | [Grass blades alpha card](https://opengameart.org/content/grass-blades-alpha-card-texture-side-view) · [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

## 4. 공개 전 확인 사항

- `planned:` 2행은 실제 런타임 배치 뒤 크기와 최종 경로를 재실측한다.
- IP 검사 증거는 [`m6-ip-check.json`](../qa/m6-ip-check.json)에 있다. 현재 기존 dist는 금지 고유명과 참조 PNG 해시는 통과하지만 미등록 `favicon.svg`·`icons.svg` 때문에 전체 FAIL이다.
- M5-GATE 전에 M5-14 성능 결과와 최종 태그 `v0.4.0-look`을 별도로 반영한다.
