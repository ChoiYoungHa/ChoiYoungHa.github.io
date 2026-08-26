# M5 자산 적용 GPU 실측 (R77-A, worker-claude) — 부분 완료 + 차단 결함

HEAD `30665a7` + 미커밋(loading-manifest·report.ts·SkyDome 2K 토글·cdp-shot). 수치 원본: `Docs/qa/m5-budget.json`, 캡처 JSON: `Docs/lookdev/m5-variants/`.

## 0. 차단 결함 — WebGPU 검은 프레임 (최우선)
- 현재 main 빌드는 헤드리스 WebGPU에서 **캡처 24/24 검정(20.6KB)**, 콘솔에 매 프레임 `GPUValidationError: depth stencil attachment [depthBuffer] size (300×150) does not match color attachment (1280×720)` + `Invalid CommandBuffer`. `?lookAssets=0`(전부 절차 폴백)도 동일. `?gl=webgl` 은 정상.
- 이분: `42557e2`(R75-C 이전) 빌드 5/5 정상(에러 0·PNG 249KB). 파일 단위: old+Atmosphere.tsx(new) 정상 / +grassLite(new) 검정 / old+grassLite(new)만 정상 2/2 / old+Foliage(new) 검정 → **코드 의미와 무관하게 빌드(번들·초기화 타이밍)에 따라 결정론적으로 갈림**. 캔버스 속성은 1280×720 실측(R3F 사이징 정상) → three r185 WebGPU `canvasTarget` depth 텍스처가 init 시점 300×150 에 고정되고 재생성되지 않는 문제로 추정.
- 시도(무효, 되돌림): `onCreated` 에서 `gl.setSize(size)` 재적용 / `setSize(1,1)→원복` 강제. `report.ts` 캡처를 `addAfterEffect` 로 바꿈(유지 — rAF 경쟁 제거, 원인은 아님).
- 영향: **영하님 실기(WebGPU)에서도 검정일 수 있음** — 배포 전 실기 확인 1순위. 회피 후보: (a) three 버전 조정, (b) `WebGPURenderer` 생성 전 canvas 속성 크기를 1280×720 으로 두고 init, (c) init 전 `renderer.setSize` — 전부 master 결정.

## 1. manifest·페이로드 (M5-07) — 완료
- `loading-manifest.json` 20항목(core 텍스처 5·detail GLB 4 추가, 절차 폴백 항목 유지·note), measuredFromHead 30665a7. boot 3,314,538 / core 누적 8,115,675(≤12MB) / 총 11,293,295(≤60MB). `check-payload --actual-build` PASS(errors 0·warnings 0), `build.ps1` BUILD_GATE PASS, `test-loading` 6/6.

## 2. 4경로 적용 실증 — 완료(씬 그래프 실측, WebGPU)
| | hero-tree | terrain | village a/b/c | grass map | textured mesh | alphaTest mesh | 재질 | map |
|---|---|---|---|---|---|---|---|---|
| after(기본) | gltf | pbr | gltf×3 | true | 6 | 2 | 11 | 4 |
| before(?lookAssets=0) | procedural | flat | procedural×3 | false | 0 | 0 | 10 | 0 |

로딩 3단 `[loading] boot→core→detail→ready` 로그 확인. 콘솔 error 는 §0 결함(WebGPU) 외 0(WebGL 0).

## 3. before/after 캡처 (WebGL2 백엔드, WebGPU 는 §0 로 불가)
- `m5-tree-before.png` / `m5-tree-after.png`(S1 vista-mid), `m5-village-before.png`(S2 vista-start), `m5-sky2k-S1.png`. **village-after·ground-before/after 미확보** — WebGL S2/S3 캡처가 안개색 단색(6KB)으로 찍힘(재시도 1회 실패, vista 카메라 셋업 전 캡처 추정).
- L1~L5(after S1): far 휘도 110.4·채도 11.6%·hue 212° / near 휘도 51.3·채도 19%·**hue 355°(자홍)** · L5 10%. before S1: far 108.8·11.5% / near 70.6·25%·hue 51° · L5 10.8. → 지형 텍스처 적용 후 근경이 어둡고 자홍색으로 틀어짐(결함 D2).

## 4. 예산 (M5 관문 전 1회)
- scene-tris(--grass-lite): low worst **312,434**(≤600K PASS) / base 704,834(≤1.1M PASS). 단 절차 추정기라 GLB(hero 7,660·집 ≈14.3K) 미포함.
- bench 1회(WebGPU low, `m5-bench-1run.csv`): avg 125.6 / 1%low 30.4 / calls 35 / **programs 36** / texGPU **71.87MB**(R67 34.55 → +37.3MB) / heap 138MB / crash 0. **§0 상태(프레임 무효)라 fps·calls·programs 신뢰 불가**, 텍스처 MB 만 실측. R67 before: 140.8/38.5/57/40/34.55.

## 5. HDRI 2K (M5-12) — 토글 추가, 채택 보류 제안
- `public/env/sky_2k.hdr`(5,451,493B, 1K 의 3.8배) + `SkyDome.readSkyHdrUrl`(`?sky=2k`, 기본 1K). manifest 미등록.
- S1 WebGL: 상단 밴드 휘도 118.4 → **101.3**, 원경 휘도 110.4 → 92.7, 원경 채도 11.6 → 19.9%, hue 212 → 216°. → 하늘이 어두워지고 채도가 올라 L2·L3 목표(원경 휘도 130~145·채도 8~12)에서 더 멀어짐. **제안: 미채택**(bgi 재튜닝 없이는 손해, 페이로드 +5.45MB). 파일은 master 판단 후 삭제.

## 6. 결함 목록 (수정 안 함)
- D1 hero_tree.glb = 자작나무(Cube.002, bark+leaves, 7,660 tris). 48m 정규화로 줄기가 실처럼 가늘고 수관이 작음(`m5-tree-after.png`) — "거대 수목" 목표에 부적합. 자산 교체 또는 높이 대신 폭 기준 정규화 필요.
- D2 지형 PBR 근경이 자홍색·어두움(hue 355°, 휘도 51). 원본 텍스처는 갈녹색이라 텍스처 자체가 아니라 normal/diffuse 결합 또는 곱색(TERRAIN_COLOR×2) 경로 문제 의심 — WebGL 캡처 기준, WebGPU 미확인.
- D3 잔디 카드가 검게 보임(`m5-tree-after.png` 좌측) — 정점색(#3B3E26) × 텍스처 곱이 과다하게 어둡거나 알파 경계. 곱색 완화 필요.
- D4 house_{a,b,c}.glb 는 단일 메시(KayKit hexagons_medieval 텍스처 1장) — cap/roof 분리 없음 → 지붕 3변형(instanceColor) 미적용(전부 백색 곱). 캡처 미확보라 형태 미검증.
- D5 WebGL S2/S3 캡처 단색 프레임(도구 결함, `Automation/cdp-shot.mjs`).
- 조정한 상수: 없음(전/후 비교 불가 상태라 보류).

## 7. 잔존
포트 4173/5173/5183 0 · web3d-* Chrome 0 · probe-server 0 · bisect worktree 제거. add/commit 안 함.
