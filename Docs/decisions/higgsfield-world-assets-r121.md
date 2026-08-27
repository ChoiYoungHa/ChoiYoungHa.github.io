# R121-C — Higgsfield 월드 자산 생성·정규화·배치

- 작업일: 2026-08-27
- 워커: codex-2 `4e4ecd5b`
- 워크트리: `web3d-wt-claude` (`wt/claude`)
- Blender: 5.2.1 LTS, headless
- 생성 모델: `meshy_v7_image_to_3d`, 정적·텍스처 on·PBR/리깅/애니메이션 off·triangle remesh·symmetry auto

## 입력과 비용

| 자산 | 시트/셀 | 업로드 ID | 생성 잡 ID | 목표 tris | 크레딧 |
|---|---|---|---|---:|---:|
| 빨간 버섯 지붕 집 | `sheet-h-structures.png` 1행 1열 `bld-house-red` | `be65a441-fc09-436f-84a2-3473cb793632` | `c4dc8bb7-a7d8-4830-8970-5928ba6bbcae` | 6,000 | 38 |
| 마을 활엽수 | `sheet-e-foliage.png` 1행 1열 `tree-oak-large` | `8172e841-655f-403c-8da6-df70438c0d44` | `637fd3d6-e699-44ee-bb83-869175a751eb` | 4,000 | 38 |

입력은 알파 연결요소 실측으로 각각 단일 객체임을 확인하고, 셀 객체 bbox를 정사각 crop한 뒤 1024×1024 흰 배경 PNG로 평탄화했다. 계정 크레딧은 116.5 → 40.5로 정확히 76 소모했으며 세 번째 잡은 제출하지 않았다.

## 산출 수치

| 자산 | Meshy 원본 | 정규화 GLB | tris | 정규화 bounds (m) | 텍스처 |
|---|---:|---:|---:|---|---|
| 버섯집 | 4,121,396 B | 586,352 B | 6,168 | 5.700 × 6.000 × 5.548 (X×Y×Z) | JPEG 1024², 201,172 B |
| 활엽수 | 4,402,420 B | 526,192 B | 4,104 | 10.953 × 12.000 × 5.888 (X×Y×Z) | JPEG 1024², 216,577 B |

두 GLB 모두 단일 mesh·primitive·material·JPEG texture, skin/clip 0이며 `Automation/check-glb.mjs` 구조 검사에서 GLB v2 유효 판정을 받았다. 정규화는 `게임콘티/assets/3d/normalize_world_asset.py`로 바닥 최저점 Y=0, XZ bbox 중심 원점, 프로젝트 정면 뷰를 유지하고 미터 단위로 내보냈다.

버섯집은 기존 house-a 충돌 proxy를 그대로 덮도록 높이 6.0m와 최대 발자국 5.7m를 동시에 맞췄다. 이 때문에 수평 배율 2.9952, 수직 배율 3.5123을 사용해 원본 대비 수평 비율이 약 14.7% 압축되었다. 공통 손실은 2048²→1024² JPEG 축소에 따른 미세 텍스처 손실이며, 활엽수 잎은 알파 카드가 아닌 불투명 저폴리 솔리드 수관이다.

## 폴더와 프리뷰

- 집 입력/원본/정규화: `게임콘티/assets/3d/mushroom-house-red/`
- 집 프리뷰: `게임콘티/assets/3d/mushroom-house-red/preview/preview-{front,threeq,face}.png`
- 나무 입력/원본/정규화: `게임콘티/assets/3d/tree-village-oak/`
- 나무 프리뷰: `게임콘티/assets/3d/tree-village-oak/preview/preview-{front,threeq,face}.png`

각 프리뷰는 Blender 5.2 EEVEE 정면·3/4·텍스처 확대 3장이다.

## 게임 적용

- `public/models/house_a.glb`를 버섯집 정규화본으로 교체하고 b/c는 유지했다.
- 기존 집 원장 행 `asset.village.house.a`는 `planned:retired`로 전환하고 새 Higgsfield 집 행을 등록했다.
- Meshy 집의 독립 UV/텍스처가 KayKit b/c 공용 아틀라스를 오염시키지 않도록 `Village.tsx`에서 집 GLB별 재질/맵을 분리했다.
- `public/models/tree_village.glb`를 신설하고 `placement.json.villageTrees`에 3그루 `[-29,18]`, `[28,7]`, `[-28,-18]`를 배치했다. 런타임은 각 XZ에서 `sampleHeight`로 접지하고 하나의 `InstancedMesh`로 렌더하며 `castShadow`/`receiveShadow`를 켠다.
- 나무는 장식물이라 충돌을 추가하지 않았고 기존 집 충돌 proxy도 변경하지 않았다.
- `loading-manifest.json` detail 단계에 마을 나무를 추가해 준비 완료 전에 GLB가 로드되도록 했다.

## 검증과 인계

- `npx tsc -b`: PASS (0 오류)
- `npm run build`: PASS
- `check-payload --actual-build`: PASS, 실제 총 14,015,962 B / 60,000,000 B
- `check-assets --json`: 새 집·나무 등록 및 runtime 누락 0. 다만 담당 범위 밖 기존 `public/models/wpn_sword_steel.glb`가 원장 미등록이라 전체 게이트는 FAIL이며 master 정리가 필요하다.
- S2 예비 캡처: `Docs/lookdev/r121-world-assets/m5-r121-before-S2.png`, `m5-r121-after-S2.png`. after 화면에서 버섯집·활엽수, WebGPU, 앱 console error/exception 0을 확인했다.
- 영하님 지시에 따라 추가 웹 접속 및 pipeline 재측정은 중단했다. 기존 R114 기준 pipelines 45/48이며 현재 최종 실측은 master가 수행한다.

잔여 40.5크레딧으로 정적 메시 1개(38)는 이론상 가능하지만 이번 라운드의 세 번째 생성은 승인 대상이라 집행하지 않았다. 다음 3D 후보는 `sheet-g-props`의 우물, 타일 후보는 3D Meshy보다 `sheet-f`의 seamless 지형 텍스처를 우선하는 편이 손실·비용 면에서 적합하다.
