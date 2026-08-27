# R118 `char_player.glb` 최적화 결정

- 일자: 2026-08-27
- 브랜치 / 병합 HEAD: `wt/bench` / `11b4dd7`
- 실행 환경: CPU 전용, Blender·GPU·브라우저 미사용
- 도구: `@gltf-transform/cli 4.4.2`, Node 기반 GLB 구조 검사

## 결론

`public/models/char_player.glb`를 14,998,652B에서 **1,766,484B**로 줄였다. 최종 파일은 **17,730 tris, 1 mesh, 7 primitives, 1 material, 1 texture(1024²), 1 skin, 고유 본 이름 67개**이며 `idle`·`walk`·`run` 세 클립의 이름, 채널 수, 길이를 보존한다. 원본은 감사·롤백용 `public/models/char_player.orig.glb`로 보존하고 자산 대장에 retired 행으로 등록했다.

최종 압축은 `KHR_draco_mesh_compression`을 선택했다. 프로젝트의 `@react-three/drei/core/Gltf.js` 기본 `useGLTF` 설정이 `DRACOLoader`를 등록하고, `Automation/optimize-assets.mjs`도 Draco를 정식 최적화 경로로 사용한다. 같은 입력의 Meshopt는 1,664,732B로 더 작았지만 스킨 양자화 뒤 정적 inspect bbox가 `[-1, 1]`로 표시되어 GPU 없이 원본 스케일 보존을 직접 입증하기 어려웠다. Draco 최종본은 디코드 inspect bbox가 원본과 일치하면서도 3MB 목표를 넉넉히 만족한다.

## 원본 실측

`gltf-transform inspect`와 `Automation/check-glb.mjs`로 확인했다.

| 항목 | 원본 |
|---|---:|
| bytes | 14,998,652 |
| meshes / primitives | 7 / 7 |
| tris | 35,194 |
| materials | 6 |
| textures | 5 |
| texture 해상도 | body 2048², shoes/top/bottom/hair 1024² |
| skins | 7 |
| skin joint node 합집합 / 고유 본 이름 | 114 / 67 |
| clips | `idle` 9.9s, `walk` 4.6s, `run` 0.7s |
| 클립별 channels | 53 |
| SHA-256 | `A0BAC8FF89811949FE46BE886BFF4FE66AF58457769FC1D0BBE70EC7819573AF` |

7개 부위는 서로 다른 부분 스킨을 참조하므로 최초 `join`은 7 meshes를 합치지 못했다. 가장 큰 body skin이 67개 고유 본 이름을 모두 포함하는 것을 확인한 뒤, 각 부위의 `JOINTS_0`을 이름 기준으로 그 skin에 재매핑하고 애니메이션 채널 대상도 같은 이름의 통합 본으로 옮겼다.

## 단계별 결과

| 단계 | bytes | tris | mesh / primitive | material / texture | skin | 판단 |
|---|---:|---:|---:|---:|---:|---|
| 원본 | 14,998,652 | 35,194 | 7 / 7 | 6 / 5 | 7 | 기준선 |
| `dedup` | 14,882,188 | 35,194 | 7 / 7 | 6 / 5 | 7 | 중복 accessor 정리 |
| `prune` | 14,882,188 | 35,194 | 7 / 7 | 6 / 5 | 7 | 제거 대상 없음 |
| 최초 `join` | 14,882,188 | 35,194 | 7 / 7 | 6 / 5 | 7 | 부분 스킨이 달라 병합 불가 |
| `weld` | 10,382,980 | 35,194 | 7 / 7 | 6 / 5 | 7 | 등가 정점 병합 |
| `simplify --ratio 0.50 --error 1 --lock-border true` | 9,751,388 | **17,730** | 7 / 7 | 6 / 5 | 7 | 채택: 18K 이하 중 가장 보수적 |
| 1024² atlas + skin 통합 + `prune` | 2,412,000 | 17,730 | **1 / 7** | **1 / 1** | **1** | 목표 구조 충족 |
| 재 `join` | 2,408,760 | 17,730 | 1 / 7 | 1 / 1 | 1 | 미참조 본 노드 37개 정리 |
| Meshopt 비교 | 1,664,732 | 17,730 | 1 / 7 | 1 / 1 | 1 | 더 작지만 정적 bbox 증거가 불명확해 미채택 |
| **Draco 최종** | **1,766,484** | **17,730** | **1 / 7** | **1 / 1** | **1** | 채택 |

`resize --width 1024 --height 1024`는 이미 1024²인 생성 atlas에 대해 libvips `colourspace: parameter space not set` 오류를 냈다. 크기 변경이 필요하지 않아 재인코딩 결과는 사용하지 않았고, 최종 GLB의 embedded PNG IHDR을 구조 검사해 1024×1024임을 확인했다.

## 단순화 비율 비교와 손실

| ratio | bytes (압축 전) | tris | 원본 대비 tris 감소 | 선택 |
|---:|---:|---:|---:|---|
| 0.50 | 9,751,388 | 17,730 | 49.62% | **채택** |
| 0.35 | 9,582,708 | 13,166 | 62.59% | 미채택: 얼굴·손 여유 감소 |
| 0.25 | 9,468,132 | 10,124 | 71.23% | 미채택: 실루엣 손실 위험 최대 |

정면·측면 GPU 렌더는 생략했으므로 얼굴·손의 시각 품질을 직접 PASS로 주장하지 않는다. 수치상 18K 한도를 만족하는 최고 밀도인 0.50을 골랐고, 경계 잠금으로 열린 경계를 보존했다.

텍스처는 단일 1024² atlas로 합쳤다. body와 hair에는 각각 512², shoes/top/bottom에는 각각 256² 셀을 배정했으며, 원본 `KHR_texture_transform`의 V 반전을 UV에 bake했다. 재질은 원본 6개를 `RemyAtlas` 하나로 통합하고 hair/eyelash의 반투명은 전체 재질 `MASK`, cutoff 0.5로 바꿨으므로 부드러운 알파 가장자리와 원본 텍셀 세부는 손실된다.

전체 파일은 원본 대비 88.22% 감소했다. geometry·texture 손실은 되돌릴 수 없지만 원본 GLB가 별도 보존되어 있다.

## 검증과 잔존 위험

- `node Automation/test-char-player-glb.mjs`: PASS. bytes·tris·mesh·material·texture 예산, 고유 본 이름 67개, 클립 이름·길이·53 channels 보존을 검사한다.
- `gltf-transform validate`: 오류 0, 경고 0. Draco extension 미지원 및 그 extension 전용 bufferView를 unused로 보는 정보 8건만 있다.
- `node Automation/check-assets.mjs`: PASS (`assets=36`, `publicFiles=16`, `registeredPublicPaths=16`).
- `npx tsc -b`: exit 0. 전체 `node --test Automation/test-*.mjs`: **447 pass, 0 fail**.
- `check-payload` snapshot-strict는 이전 빌드 hash 파일 17개가 현재 `dist/`에 없어 FAIL했다. `loading-manifest.json`에는 아직 `char_player.glb`가 없으므로 이번 자산의 payload 편입 여부를 판정하는 증거로 사용하지 않았다.
- 구조 결과: `idle` 9.9s, `walk` 4.6s, `run` 0.7s; 1 skin; 본 이름 67/67 보존.
- 수동 리타겟은 구조상 필요하지 않다. 다만 7개 부분 스킨을 이름 기반 단일 skin으로 통합했으므로 런타임에서 세 클립의 부위 분리·관절 변형을 육안 확인해야 한다.
- 원본이 `public/models/char_player.orig.glb`에 있어 실제 빌드가 `public/` 전체를 복사하면 배포 payload가 다시 커질 수 있다. 감사본을 제출 번들에서 제외하거나 public 밖으로 이동할지는 master 판단이 필요하다.
- 기존 `Automation/check-glb.mjs`의 geometry audit은 Draco accessor를 디코드하지 못한다. R118 전용 테스트는 JSON accessor 메타데이터로 예산과 본·클립 계약을 검증하고, `gltf-transform inspect`의 Draco 디코드 결과로 원본과 같은 bbox를 확인했다. 실제 스키닝·atlas 표시는 추후 브라우저 관문에 남긴다.
