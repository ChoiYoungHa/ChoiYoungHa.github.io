# 제출 자산·라이선스 감사표

기준은 `wt/bench@16b713b`이며 SSOT는 [`src/data/assets.csv`](../../src/data/assets.csv)다. 2026-08-27에 대장 **35행**을 전수 확인했고, 아래 크기는 각 `runtime_file`을 실제 파일 시스템에서 `stat`한 값이다. 동일 런타임 파일을 공유하는 행은 크기를 반복 표기하며, `planned:`는 아직 배포하지 않은 후보, `planned:retired`는 명시적으로 폐기한 후보다.

## 1. 현재 대장 전수표

| # | 자산 ID | 자산 | 출처 / 저작자 | 라이선스 | 출처 URL | 런타임 파일 | 실측 bytes |
|---:|---|---|---|---|---|---|---:|
| 1 | `asset.env.vegetation.grass.a` | 케니 풀 A | kenney / Kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/vegetation_kit.glb` | 16,900 |
| 2 | `asset.env.vegetation.flower.a` | 케니 노란 꽃 A | kenney / Kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/vegetation_kit.glb` | 16,900 |
| 3 | `asset.env.vegetation.shrub.a` | 케니 관목 A | kenney / Kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/vegetation_kit.glb` | 16,900 |
| 4 | `asset.env.rock.a` | 케니 작은 바위 A | kenney / Kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/props_rocks.glb` | 12,844 |
| 5 | `asset.env.rock.b` | 케니 납작 바위 A | kenney / Kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/props_rocks.glb` | 12,844 |
| 6 | `asset.env.rock.c` | 케니 키 큰 바위 A | kenney / Kenney | CC0 | https://kenney.nl/assets/nature-kit | `public/models/props_rocks.glb` | 12,844 |
| 7 | `asset.env.hero-tree.a` | 절차적 거대 수목 A | procedural / 729f5ac5 | Project-owned | `src/scene/hero/heroTreeGeometry.ts` | `src/scene/hero/heroTreeGeometry.ts` | 15,688 |
| 8 | `asset.village.house.a` | 절차적 집 A | procedural / 729f5ac5 | Project-owned | `src/scene/village/houseGeometry.ts` | `public/models/house_a.glb` | 79,272 |
| 9 | `asset.village.house.b` | 절차적 집 B | procedural / 729f5ac5 | Project-owned | `src/scene/village/houseGeometry.ts` | `public/models/house_b.glb` | 108,340 |
| 10 | `asset.village.house.c` | 절차적 집 C | procedural / 729f5ac5 | Project-owned | `src/scene/village/houseGeometry.ts` | `public/models/house_c.glb` | 206,664 |
| 11 | `asset.village.roof.a` | 절차적 지붕 A | procedural / 729f5ac5 | Project-owned | `src/scene/village/roofGeometry.ts` | `src/scene/village/roofGeometry.ts` | 2,403 |
| 12 | `asset.village.roof.b` | 절차적 지붕 B | procedural / 729f5ac5 | Project-owned | `src/scene/village/roofGeometry.ts` | `src/scene/village/roofGeometry.ts` | 2,403 |
| 13 | `asset.village.roof.c` | 절차적 지붕 C | procedural / 729f5ac5 | Project-owned | `src/scene/village/roofGeometry.ts` | `src/scene/village/roofGeometry.ts` | 2,403 |
| 14 | `asset.env.sky.hdri.a` | Kloppenheim 03 Pure Sky | polyhaven / Poly Haven | CC0 | https://polyhaven.com/a/kloppenheim_03_puresky | `public/env/sky_1k.hdr` | 1,428,760 |
| 15 | `asset.env.vegetation.grass-lite.a` | 절차적 저폴리 풀 A | procedural / 729f5ac5 | Project-owned | `src/scene/foliage/grassLiteGeometry.ts` | `src/scene/foliage/grassLiteGeometry.ts` | 4,720 |
| 16 | `asset.env.rock-lite.a` | 절차적 저폴리 바위 A | procedural / 729f5ac5 | Project-owned | `src/scene/foliage/rockLiteGeometry.ts` | `src/scene/foliage/rockLiteGeometry.ts` | 4,895 |
| 17 | `asset.hero.tree.a` | Quaternius Birch Tree 2 | quaternius / Quaternius | CC0 | https://quaternius.com/packs/ultimatestylizednature.html | `planned:retired` | retired |
| 18 | `asset.env.card.grass.a` | Grass Alpha Cards | opengameart+polyhaven / para; Rob Tuytel; Rico Cilliers | CC0 | https://opengameart.org/content/grass-blades-alpha-card-texture-side-view | `public/textures/grass_card.png` | 840,009 |
| 19 | `asset.env.card.flower.a` | Quaternius Flower Alpha Card | quaternius / Quaternius | CC0 | https://quaternius.com/packs/ultimatestylizednature.html | `planned:public/textures/flower_card.png` | 미배치 |
| 20 | `asset.tex.ground.grass.a` | Sparse Grass 1K PBR | polyhaven / Amal Kumar | CC0 | https://polyhaven.com/a/sparse_grass | `public/textures/ground_grass_diffuse.jpg` | 955,945 |
| 21 | `asset.tex.ground.dirt.a` | Grass Path 2 1K PBR | polyhaven / Rob Tuytel | CC0 | https://polyhaven.com/a/grass_path_2 | `public/textures/ground_dirt_diffuse.jpg` | 716,010 |
| 22 | `asset.sky.hdri.b` | Kloofendal Partly Cloudy Pure Sky 2K | polyhaven / Greg Zaal; Jarod Guest | CC0 | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | `planned:public/env/sky_2k.hdr` | 미배치 |
| 23 | `asset.prop.fence.a` | KayKit wooden fence | kaykit / Kay Lousberg | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_fence.glb` | 32,180 |
| 24 | `asset.prop.stonewall.a` | KayKit stone fence wall | kaykit / Kay Lousberg | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_stonewall.glb` | 30,968 |
| 25 | `asset.prop.arch.a` | KayKit stone gate arch | kaykit / Kay Lousberg | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_arch.glb` | 66,164 |
| 26 | `asset.prop.banner.a` | KayKit red flag banner | kaykit / Kay Lousberg | CC0 | https://kaylousberg.itch.io/kaykit-medieval-hexagon | `public/models/prop_banner.glb` | 19,584 |
| 27 | `asset.char.player.a` | Mixamo Remy + Idle/Walk/Run | mixamo / Adobe Mixamo | Mixamo Terms | https://www.mixamo.com | `public/models/char_player.glb` | 14,998,652 |
| 28 | `asset.char.npc.stan` | Mixamo Peasant Man + Breathing Idle | mixamo / Adobe Mixamo | Mixamo Terms | https://www.mixamo.com | `public/models/npc_stan.glb` | 4,128,292 |
| 29 | `asset.char.npc.maya` | Mixamo Peasant Girl + Breathing Idle | mixamo / Adobe Mixamo | Mixamo Terms | https://www.mixamo.com | `public/models/npc_maya.glb` | 5,489,400 |
| 30 | `asset.ui.icons.set.a` | Item icon set (47) | codex image_gen / OpenAI Codex image_gen | self | `local:게임콘티/assets/items` | `public/ui/items/wpn-sword-wooden.png` | 23,071 (대표) |
| 31 | `asset.mob.pig.a` | Poly by Google Pig (회색 파생) | Poly Pizza / Poly by Google | CC-BY-3.0 | https://poly.pizza/m/6yc3isbjZST | `public/models/mob_pig.glb` | 82,224 |
| 32 | `asset.ui.favicon.a` | Project favicon | self / YoungHaChoi | self | `public/favicon.svg` | `public/favicon.svg` | 9,522 |
| 33 | `asset.ui.icons.a` | Project symbol sprite | self / YoungHaChoi | self | `public/icons.svg` | `public/icons.svg` | 5,055 |
| 34 | `asset.hero.tree.b` | 3Donimus Big Tree | Poly Pizza / 3Donimus | CC-BY-3.0 | https://poly.pizza/m/dNWh762PN-6 | `public/models/hero_tree.glb` | 3,407,832 |
| 35 | `asset.fx.atlas.a` | Procedural skill VFX atlas | procedural / codex-54c832e9 | self | `Automation/gen-fx-atlas.mjs` | `public/textures/fx_atlas.png` | 117,844 |

`asset.ui.icons.set.a`는 대표 파일 한 장을 가리키지만 배포 세트는 자체 생성 PNG **47장, 합계 3,085,045 bytes**다. `asset.hero.tree.a`의 BirchTree_2는 R96-A에서 48m 정규화 시 줄기 과세 때문에 **retired** 처리했고 런타임 파일은 Big Tree로 교체했다.

## 2. 라이선스 분포와 필수 고지

| 구분 | 대장 행 | 배포 조건 |
|---|---:|---|
| CC0 | 17 | 출처 표시는 선택이지만 감사 추적을 위해 대장에 보존 |
| Project-owned | 9 | 프로젝트의 절차 생성 코드·팔레트·시드와 함께 사용 |
| Mixamo Terms | 3 | 게임 내 변환 GLB 임베드 허용, 원본 FBX 재배포 금지 |
| self | 4 | 아이콘 47장·VFX 아틀라스·SVG 2종 자체 생성 |
| CC-BY-3.0 | 2 | 아래 저작자·자산명·출처·라이선스 표기 필수 |

### CC-BY-3.0 크레딧 블록

제출물 README 또는 크레딧 화면에 다음 문구를 그대로 싣는다.

> "Big Tree" by 3Donimus, licensed under CC BY 3.0. Source: https://poly.pizza/m/dNWh762PN-6. License: https://creativecommons.org/licenses/by/3.0/
>
> "Pig" by Poly by Google, licensed under CC BY 3.0. Source: https://poly.pizza/m/6yc3isbjZST. License: https://creativecommons.org/licenses/by/3.0/

Big Tree 원본은 처리 없이 byte-for-byte 보존했다. Pig는 원본 실루엣을 유지하면서 1,742→1,489 tris 단순화와 회색 몸·분홍 코 정점색을 적용한 파생본이며, CC-BY-3.0 조건은 그대로 승계한다.

### Mixamo 고지

- 캐릭터 3종은 [Adobe General Terms](https://www.adobe.com/legal/terms.html) 및 Mixamo 사용 조건에 따라 **게임 런타임에 변환 GLB로 임베드**한다.
- 배포 대상은 `public/models/char_player.glb`, `npc_stan.glb`, `npc_maya.glb`뿐이며, 원본 FBX는 Git·`public/`·`dist/`에서 제외해 별도 원본 파일로 재배포하지 않는다.

### 자체 생성 자산 고지

- `asset.ui.icons.set.a`: Codex image generation으로 만든 아이템 아이콘 47장(256×256 PNG, 합계 3,085,045 bytes).
- `asset.fx.atlas.a`: `Automation/gen-fx-atlas.mjs`가 외부 패키지 없이 결정론적으로 생성한 1024×1024 RGBA PNG(117,844 bytes).
- `asset.ui.favicon.a`, `asset.ui.icons.a`: 프로젝트가 직접 만든 `public/favicon.svg`, `public/icons.svg` 2종.
- 위 네 대장 행은 외부 게임 IP에서 추출한 파일이 아니며 라이선스 값은 `self`다.

## 3. CC0 출처 감사 목록

| 출처 | 자산 범위 | 근거 |
|---|---|---|
| Kenney | 식생 3종·바위 3종 | [Nature Kit](https://kenney.nl/assets/nature-kit) · [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Poly Haven | HDRI·지면 PBR·잔디 카드 보조 | [Poly Haven](https://polyhaven.com/) · [License](https://polyhaven.com/license) |
| Quaternius | retired BirchTree_2·꽃 카드 후보 | [Ultimate Stylized Nature](https://quaternius.com/packs/ultimatestylizednature.html) · [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| KayKit | 마을 소품 4종 | [Medieval Hexagon](https://kaylousberg.itch.io/kaykit-medieval-hexagon) · CC0 |
| OpenGameArt | 잔디 알파 카드 원본 | [Grass blades alpha card](https://opengameart.org/content/grass-blades-alpha-card-texture-side-view) · CC0 |

## 4. 최신 페이로드 실측

최신 actual-build 기록은 [`Docs/perf/m4-payload.json`](../perf/m4-payload.json)의 `buildHash=a1e7272`다. 현재 문서 HEAD를 새로 빌드한 값은 아니며, 마지막으로 보존된 `check-payload` 실측을 제출 기준선으로 전사했다.

| 구간 | bytes | 한도 | 결과 |
|---|---:|---:|---|
| boot | 3,320,589 | 4,000,000 | PASS |
| core 누적 | 8,121,726 | 12,000,000 | PASS |
| detail 누적 / 총 페이로드 | **13,352,594** | 60,000,000 | PASS |
| 단일 최대 (`hero_tree.glb`) | 3,407,832 | 20,000,000 | PASS |

manifest phase 합계, 중복 ID, 오류 검사도 모두 PASS다. 공개 전 남은 자산 항목은 `planned:` 2행의 채택/폐기 확정, own 강제 빌드의 IP 재검사, 현재 HEAD actual-build 페이로드 재측정이다.
