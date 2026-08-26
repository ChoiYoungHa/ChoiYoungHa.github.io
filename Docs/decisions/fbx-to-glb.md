# M5-05 FBX → GLB 변환 결정 (R76-A)

- 날짜: 2026-08-27
- 작업 브랜치/기준: `wt/bench` / `978b5dd1cbcaa0b9bc2b31d44931300c1c9356d9`
- 런타임: Node.js + 프로젝트 고정 `three@0.185.1`
- 변환기: `Automation/fbx-to-glb.mjs`
- 검사기: `Automation/check-glb.mjs`
- 원본: main worktree의 `DCC/incoming/asset.char.*`를 읽기만 했으며 수정·삭제하지 않았다.

## 선택한 경로

별도 설치가 필요한 Blender, Assimp, `fbx2gltf` 대신 프로젝트에 이미 있는 `FBXLoader`와 `GLTFExporter`를 사용했다. 스킨 FBX를 장면 루트로 삼고 animation-only FBX의 첫 유효 `AnimationClip`을 복제·최적화해 `idle`, `walk`, `run`으로 명명한 뒤 exporter의 `animations` 옵션에 전달했다. NPC FBX는 내부 첫 유효 클립을 `idle`로 명명했다.

Node에는 브라우저 DOM이 없으므로 다음 최소 폴리필을 변환기 내부에 구현했다.

1. `window`, `URL.createObjectURL`, `HTMLImageElement`, `document.createElementNS('img')`: FBXLoader가 임베디드 PNG/JPEG를 로드하도록 하되 디코딩 대신 원본 바이트·MIME·헤더 해상도를 보존한다.
2. `FileReader.readAsArrayBuffer/readAsDataURL`: GLTFExporter의 GLB 조립 경로를 Node `Blob.arrayBuffer()`로 연결한다.
3. exporter 전에 material texture 슬롯을 잠시 분리해 canvas 생성을 피하고, 기하·스킨·애니 GLB가 나온 뒤 압축 이미지 원본을 `images[].bufferView`로 직접 붙인다.
4. `map`, `normalMap`, `aoMap`, `emissiveMap`은 표준 glTF 슬롯에, `specularMap`은 `KHR_materials_specular`에 연결한다. FBX/three의 Y 반전은 `KHR_texture_transform`의 음수 Y scale로 표현한다.

## 20 MiB 정책

같은 base GLB에 텍스처 정책을 순서대로 적용하고 처음 20 MiB 이하인 결과를 채택한다: `all-standard` → `no-specular` → `diffuse-only`. 원본 압축 이미지를 재인코딩하지 않아 화질 열화나 추가 패키지는 없다.

Player 후보 크기는 `all-standard` 27,419,668B, `no-specular` 24,229,628B, `diffuse-only` 14,998,652B였으므로 diffuse-only가 채택됐다. NPC 두 개는 all-standard가 바로 통과했다.

## 실측 결과

| GLB | bytes | tris | 본(스킨 joint) | 클립 | 길이(s) | 텍스처/해상도 | 20 MiB |
|---|---:|---:|---:|---:|---|---|---|
| `public/models/char_player.glb` | 14,998,652 | 35,194 | 114 | 3 | idle 9.90 / walk 4.60 / run 0.70 | diffuse 5장; 1024² 4장 + 2048² 1장 | PASS |
| `public/models/npc_stan.glb` | 4,128,292 | 4,624 | 43 | 1 | idle 9.93 | diffuse/normal/specular 3장; 모두 1024² | PASS |
| `public/models/npc_maya.glb` | 5,489,400 | 5,035 | 69 | 1 | idle 9.83 | diffuse/normal/specular 3장; 모두 1024² | PASS |

원본·출력 구조 수치는 `Docs/qa/m5-char-glb.json`에 고정했다. Player의 18K tris와 45본 조건은 각각 35,194와 114로 **FAIL**이며 지시대로 감축하지 않았다. 클립 3개와 단일 20 MiB 조건은 PASS다.

## 한계와 후속 검증

- Player는 용량 제한 때문에 normal/specular 12개 슬롯을 제외했다. Hair/Eyelash의 별도 `alphaMap` 2개는 canvas 없이 diffuse alpha로 병합할 표준 경로가 없어 모든 정책에서 제외했으므로, M5-07 실제 배치에서 머리카락·속눈썹 컷아웃 외관을 확인해야 한다.
- FBXLoader가 Player 일부 정점의 4개 초과 skin weight를 삭제했다고 경고했다. 이는 three의 4-weight glTF 내보내기 한계이며 원본 FBX는 보존했다.
- Player FBX의 `ShininessExponent` 맵 6개는 FBXLoader 자체가 미지원으로 건너뛰었다.
- GLTFExporter는 FBXLoader의 `MeshPhongMaterial`을 내보내며 `MeshStandardMaterial` 권고 경고를 냈다. 변환은 성공했지만 최종 PBR 룩은 M5-07에서 확인한다.
- 이 라운드에서는 CPU 변환·정적 GLB 검사만 수행했으며 GPU, dev/preview 서버, 브라우저는 실행하지 않았다.

