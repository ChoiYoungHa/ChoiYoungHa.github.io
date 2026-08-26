# 문서·수치 정합성 검수 — R34-C

- 검수일: 2026-08-26
- 신원: codex-A `54c832e9-da36-4a04-9f25-6e80e3205b7c`, `term_39333443-ae5d-4c43-827b-1bec59a6f730`
- HEAD: 시작 `772e852` → 병행 커밋 `6566b2d` → 검수 종료 스냅샷 `0cadad6`
- 범위: 읽기 전용 검수. 결함 수정, build/GPU/server/Chrome, 설치는 수행하지 않음.

## 1. 요약

| 항목 | 결과 |
|---|---|
| 로드맵 체크 행 | 116행 |
| 선언된 파일/패턴 참조 | 121개 |
| `fs.existsSync` 존재 | 102개 |
| 부재 참조 | 19개, 17행 영향 |
| 파일 경로가 아닌 산출물 셀 | 10행(폴더/로그/태그/“같은 blend” 등, 별도 수동 대조) |
| 완료일 | 체크 116행 모두 `2026-08-26`; 관련 커밋 날짜도 모두 `2026-08-26` |
| M0b·M1·M2 fps/1% low | 원본 CSV 중앙값과 의사결정·릴리스·제출 문서 모두 일치 |
| §4-1/M4-14/검사기 예산 | 핵심 5값 일치; M0b-20 행 1곳만 구 programs 한도 잔존 |
| 태그 | `v0.0.0-bootstrap`, `v0.1.0-m1`, `v0.2.0-m2` 모두 존재 |

검사기는 `로드맵.md`의 `[x]` 행을 전수 파싱하고 산출물 셀의 구체 경로를 프로젝트 루트 기준 `fs.existsSync`로 검사했다. `.csv` 축약은 직전 basename으로 복원했고, `m3-before-[1-3].png`는 3개 구체 경로로 펼쳤으며, `public/textures/T_*_1K.*`는 디렉터리와 패턴 일치 파일 수를 함께 확인했다.

## 2. 불일치 — 체크 행의 선언 산출물 부재

아래는 **현재값이 `fs.existsSync=false`인 선언 경로 전부**다. 기대값은 `[x]`인 이상 선언 파일이 존재하는 것이며, 절차적 대체가 승인된 행은 체크를 되돌리는 대신 산출물 열을 실제 코드/JSON 증거로 바꾸는 방법도 있다.

| 파일:행 / ID | 현재값 | 기대값 | 근거 |
|---|---|---|---|
| `로드맵.md:86` / M0b-19 | `Docs/perf/m0b-process-ram.png`, `.csv` 모두 부재 | 정밀 PNG·CSV 존재 또는 `[ ]` | 같은 행 완료 조건 “숫자, 확인 불가는 PASS 금지”; `Docs/decisions/m0b-gate.md:39`도 정밀 캡처 미확보 명시 |
| `로드맵.md:100` / M1-02 | `DCC/terrain_250m.blend` 부재 | 선언 파일 존재 또는 절차적 산출물로 열 정정 | 완료일의 “절차적 대체”; 커밋 `3dcd42b` |
| `로드맵.md:101` / M1-03 | `DCC/exports/terrain_250m.glb`, `public/models/terrain_250m.glb` 부재 | 두 선언 파일 존재 또는 절차적 산출물로 열 정정 | 완료일의 “절차적 대체”; `src/scene/Terrain.tsx` 존재 |
| `로드맵.md:113` / M1-15 | `public/textures/T_*_1K.*` 일치 파일 0개(`public/textures/`도 없음) | 1K 텍스처 파일 ≥1 또는 vertex-color/none 대체 명시 | `src/data/assets.csv`: 13/14행 `texture_res=none` |
| `로드맵.md:139` / M2-02 | `DCC/Environment/SM_HeroTree_Trunk.blend` 부재 | 선언 파일 존재 또는 절차적 코드 경로로 열 정정 | 완료일 “절차적 대체”; 커밋 `e373c58` |
| `로드맵.md:140` / M2-03A | `DCC/Environment/SM_HeroTree_Branches.blend` 부재 | 위와 같음 | 커밋 `e373c58` |
| `로드맵.md:143` / M2-04A | `DCC/Environment/SM_HeroTree_Canopy.blend` 부재 | 위와 같음 | 커밋 `e373c58` |
| `로드맵.md:146` / M2-05 | `DCC/Environment/SM_HeroTree_A.blend` 부재 | 위와 같음 | 커밋 `e373c58` |
| `로드맵.md:147` / M2-06 | `DCC/exports/herotree_modules.glb` 부재 | 위와 같음 | 커밋 `e373c58` |
| `로드맵.md:152` / M2-11A | `DCC/Architecture/SM_House_A.blend` 부재 | 선언 파일 존재 또는 절차적 코드 경로로 열 정정 | 완료일 “절차적 대체”; 커밋 `34e93a5` |
| `로드맵.md:155` / M2-12 | `DCC/Architecture/SM_House_B.blend` 부재 | 위와 같음 | 커밋 `34e93a5` |
| `로드맵.md:156` / M2-13 | `DCC/Architecture/SM_House_C.blend` 부재 | 위와 같음 | 커밋 `34e93a5` |
| `로드맵.md:157` / M2-14 | `DCC/Architecture/SM_Roof_A.blend` 부재 | 위와 같음 | 커밋 `34e93a5` |
| `로드맵.md:158` / M2-15 | `DCC/Architecture/SM_Roof_B.blend` 부재 | 위와 같음 | 커밋 `34e93a5` |
| `로드맵.md:159` / M2-16 | `DCC/Architecture/SM_Roof_C.blend` 부재 | 위와 같음 | 커밋 `34e93a5` |
| `로드맵.md:160` / M2-17 | `public/textures/village_atlas_1k.ktx2` 부재 | 선언 파일 존재 또는 vertex-color 산출물로 열 정정 | 완료일 “vertex color로 대체”; `assets.csv` 지붕 3행 `texture_res=none` |
| `로드맵.md:161` / M2-18 | `public/models/village_kit.glb` 부재 | 선언 파일 존재 또는 절차적 코드 경로로 열 정정 | 완료일 “절차적 N/A”; 커밋 `34e93a5` |

부재 19개 중 16개는 master가 승인한 절차적/vertex-color 대체 뒤 **체크와 완료일만 갱신되고 산출물 열은 구 Blender/KTX2 계약으로 남은 경우**다. 구현 결함으로 단정하지 않지만, 로드맵을 증거 인덱스로 사용할 때는 false positive가 된다.

경로가 아닌 산출물 셀 10행도 수동 확인했다. M0b-02의 폴더 8개, M0b-24의 commit/tag, M1-13/14의 DCC+runtime GLB는 확인됐고, M2의 “같은 blend”/“DCC/runtime GLB”는 위 절차적 대체 부재와 같은 원인이다. M0b-05의 “LFS 로그”는 파일 경로가 없어 존재 검사를 적용할 수 없다.

## 3. 불일치 — 수치·문구

| 파일:행 | 현재값 | 기대값 | 근거 |
|---|---|---|---|
| `로드맵.md:87` M0b-20 | 절차에 `programs≤20` | `programs≤40` | `계획서.md:384`, `Automation/check-budgets.mjs:17`, `로드맵.md:245` M4-14, `SESSION_STATE.md:483` 모두 정정값 40 |

R35-B 커밋 `0cadad6`에서 `Docs/releases/v0.1.0.md`의 오래된 “HDRI 행은 아직 없다” 문구는 이미 정정됐다. 종료 스냅샷 기준 추가 릴리스/제출 수치 불일치는 발견하지 못했다.

## 4. 성능 수치 대조

| 단계 | WebGPU avg / 1% low | WebGL2 avg / 1% low | soak | 결과 |
|---|---:|---:|---:|---|
| M0b | 143.28 / 72.04 | 143.69 / 93.75 | 905.75s | CSV·gate·submission 일치 |
| M1 | 141.51 / 44.83 | 141.55 / 45.08 | 911.59s | CSV·gate·submission 일치 |
| M2 | 125.22 / 33.31 | 140.37 / 35.91 | 915.4s | CSV·gate·release·submission·SESSION_STATE §15 일치 |

M2의 calls 63, programs 40, texture GPU 36.88MB, WebGPU/WebGL2 heap 193.07/213.92MB도 원본 CSV와 릴리스·제출 문서가 일치한다. `Docs/submission/evidence-index.md`의 자체 집계도 `fs.existsSync` 재검사 결과 25개 중 22개 존재, 3개 부재로 정확했다.

## 5. 예산 정합성

| 항목 | 계획서 §4-1 | 검사기 | 로드맵 M4-14 | 판정 |
|---|---:|---:|---:|---|
| calls | 200 | 200 | 200 | 일치 |
| tris | 600,000 | 600,000 | 600K | 일치 |
| programs | 40 | 40 | 40 | 일치 |
| texture GPU MB | 300 | 300 | 300 | 일치 |
| JS heap MB | 900 | 900 | 900 | 일치 |

`Automation/check-budgets.mjs:23-30`은 tris만 unknown을 허용하고, 나머지 unknown은 실패로 처리한다. M4-14 완료 조건과 충돌하지 않는다.

## 6. SESSION_STATE·태그·HEAD

- `SESSION_STATE.md:470-471`의 HEAD `e373c58`과 태그 2개는 §14 제목대로 09:1x 시점 스냅샷이며 당시 git 이력과 일치한다. 현재값으로 읽으면 HEAD `0cadad6`, 태그 3개이므로 낡았지만 역사 기록의 모순은 아니다.
- §15는 M2-GATE `5917486`와 `v0.2.0-m2`를 `SESSION_STATE.md:566,582`에 기록하며 실제 tag target `5917486`과 일치한다.
- 종료 시 실제 태그 target은 `v0.0.0-bootstrap=f4f6149`, `v0.1.0-m1=6419834`, `v0.2.0-m2=5917486`이다.
- §15 커밋 체인은 `6566b2d` 뒤 “R35-B 커밋” 자리표시자로 끝나고, 실제 R35-B 커밋은 `0cadad6`이다. 최신 HEAD 포인터로 쓸 경우 `0cadad6`을 병기해야 한다.

## 7. 권고 우선순위(수정은 수행하지 않음)

1. M0b-19는 정밀 RAM 증거 2개가 생길 때까지 체크 의미를 “조건부”로 별도 표현한다.
2. 절차적 대체 16개 부재 참조는 실제 코드/JSON 산출물로 로드맵 열을 일괄 교체해 증거 인덱스의 false positive를 없앤다.
3. M0b-20의 programs 구 한도 20을 SSOT 값 40으로 맞춘다.
4. SESSION_STATE §15 커밋 체인의 R35-B 자리표시자를 실제 hash `0cadad6`으로 갱신한다.
