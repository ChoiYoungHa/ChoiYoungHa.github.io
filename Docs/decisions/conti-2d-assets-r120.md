# R120-A 콘티 2D 자산 적용

- 작성일: 2026-08-27 KST
- 작업 주체: worker-codex A2 `6c8f715c`
- 원본: `게임콘티/assets/sheets/sheet-i-portraits.png`, `sheet-j-fx.png`, `sheet-d-skill-ui.png`, `게임콘티/assets/items/keyart-henesys.png`
- 권리: 영하님 워크스페이스에서 Codex `image_gen`으로 만든 프로젝트 자체 산출물(`self`)

## 1. 추출 규약과 좌표

초상·UI는 `게임콘티/게임콘티.md` §10-3의 `alpha > 16`, 8-이웃, 면적 400px 미만 제거, y행→x열 순서 규약을 `assets/tools/extract-sprites.ps1`로 재실행했다. FX는 발광 잔점을 포함하므로 `assets/tools/extract-sheet-j-fx.py`의 셀당 메인 코어+Euclidean nearest-core 소유권 규약을 재사용했다.

### 초상 I (1254×1254, 공통 배율 0.5044843)

| 매핑 | 원본 bbox `(x,y,w,h)` | 결과 |
|---|---:|---|
| 전사 플레이어 | `(23,108,309,446)` | `public/ui/portraits/player-warrior.png` |
| 장로 스탄 | `(18,648,327,436)` | `public/ui/portraits/stan.png` |
| 마야 | `(346,645,323,444)` | `public/ui/portraits/maya.png` |

전체 7 blob을 정확히 검출하고 3개만 런타임으로 내보냈다. 세 파일은 256×256 RGBA, 테두리 alpha 0px, alpha>16 주 컴포넌트 1개다.

### FX J (1254×1254)

| 소스 | 원본 crop `(x,y,w,h)` | 아틀라스 용도 |
|---|---:|---|
| `fx-slash-arc` | `(11,468,309,330)` | 불꽃베기 3프레임·도약베기 2프레임 |
| `fx-flame` | `(6,10,298,399)` | 불꽃베기 타격 |
| `fx-rainbow-trail` | `(616,43,317,369)` | 무지개 화살/껈적 4셀 |
| `fx-icicle` | `(341,0,258,416)` | 고드름·얼음 조각 3셀 |
| `fx-frost-ring` | `(0,850,330,366)` | 동결 마스크 |
| `fx-hit-spark` | `(634,475,301,318)` | 도약베기 결정 타격 |
| `fx-shockwave` | `(942,132,310,244)` | 도약베기 착지 링 |

`fx.json`의 4×4 rect 16개는 바꾸지 않았다. 행 0은 참격 0.82/0.94/1.02배+화염, 행 1은 무지개 기본 크기 4단계, 행 2는 고드름/동결/조각, 행 3은 양방향 참격/타격/충격파로 매핑했다. 모든 visible RGB는 `255,255,255`이고 시트의 alpha 실루엣만 보존해 `sampled.rgb × instanceColor`계약을 지킨다.

### UI D (1024×1024)

실물 시트 D에는 패널/버튼 사각 프레임이 없고 스킬 원형 4개+UI 심볼 8개만 있다. master 승인으로 추출한 `skl-flameslash` 금테 `(22,95,223,230)`와 `ui-coin` 금테 `(39,416,193,201)`를 극좌표→사각 외곽으로 재표본화해 96×96, slice 24의 own 파생본으로 만들었다.

## 2. 출력 파일

| 파일 | 형식·크기 | bytes | SHA-256 |
|---|---|---:|---|
| `public/ui/portraits/player-warrior.png` | 256² RGBA | 75,819 | `42cb9a7b…e5ed8e` |
| `public/ui/portraits/stan.png` | 256² RGBA | 83,333 | `30fdb958…a6931` |
| `public/ui/portraits/maya.png` | 256² RGBA | 86,037 | `c90cf794…fa23f73` |
| `public/ui/title-keyart.webp` | 1280×720 RGB WebP | 227,470 | `b1b2542d…4f7b00` |
| `public/textures/fx_atlas.png` | 1024² RGBA | 89,559 | `e2f8bc4d…e132704` |
| `public/ui/frame/panel-frame.png` | 96² RGBA | 16,706 | `7ee39171…c15495bd` |
| `public/ui/frame/button-frame.png` | 96² RGBA | 17,147 | `93adfae2…d63bfb58b` |

타이틀은 시트 K 원본 1792×1008을 Lanczos 1280×720, WebP quality 82/method 6으로 변환했다. `public/gen-candidates/title-background/title-background.png`는 빈 하늘과 저밀도 마을이 중심이라 버섯집·거대 수목·마을 진입로 이어지는 시트 K의 게임 정체성이 더 분명해 불채택했다.

## 3. 런타임 적용

| 지점 | 적용 |
|---|---|
| `GameOverlay.tsx`→`TitleScreen bgUrl` | `/ui/title-keyart.webp` 기본값 |
| `CharacterCreate.tsx` | 전사 PNG, 로드 실패 시 `Portrait.tsx` SVG 조합 폴백 |
| `GameOverlay.tsx`→`DialoguePanel.tsx` | `treeId=stan/maya`를 각 NPC PNG로 매핑 |
| `GameOverlay.tsx` HUD 좌상단 | 기존 상태 패널 오른쪽에 전사 PNG; 금지 파일 `GameHud.tsx` 변경 0 |
| `hudTokens.ts` | panel/button `border-image` source·slice·width·outset 토큰 |
| `DialoguePanel` / `RewardPopup` / `ShopPanel` | outer panel 테두리 3곳에 panel 9-slice |
| `skillFx.ts` 계약 | 파일 미변경; 새 white mask×instanceColor 입력으로 계약 준수 |

## 4. 품질 자평·미적용

- 초상 4.5/5: 시선 높이·광원·머리 크기가 일관되고 alpha 오염이 없다. 다만 정적 PNG이므로 캐릭터 파츠 커스텀의 실시간 반영은 SVG 폴백에만 남는다.
- 키아트 4.7/5: 버섯 마을·진입로·거대 수목이 16:9에서 즉시 읽히고 300KB 제한을 72.5KB 여유로 통과한다. 세부 식생의 WebP 손실은 720p 타이틀 배경에서 감수 가능하다.
- FX 4.0/5: 절차 도형보다 실루엣이 풍부하고 전 셀 alphaTest 커버리지가 12.1~25.9%다. 다만 색 그라데이션은 단일 재질 틴트 계약 때문에 의도적으로 제거했고, 몇 프레임은 단일 시트 스프라이트의 크기·회전 파생이다.
- UI 프레임 3.8/5: 시트 D의 실제 금속 질감을 유지했지만 원형→사각 극좌표 파생으로 모서리 무늬가 약간 당겨진다. CSS 9-slice에서는 조건부로 사용 가능하다.
- 미적용: 궁수·마법사·도적·돼지 초상, J의 회복·레벨업·먼지·반짝임. 현 `fx.json`의 무지개/동결/도약베기 의미와 literal 회복/레벨업 행이 충돌해 master 승인으로 현 런타임 의미를 보존했다. 기본공격 슬래시·레벨업 링은 R119-B 소유이므로 rect를 추가하지 않았다. button-frame은 토큰과 자산만 준비했고 이 라운드의 외곽 패널 3곳에는 panel-frame만 적용했다.

## 5. 검증·캡처

| 검증 | 결과 |
|---|---|
| `py Automation/import-conti-2d-assets.py` | exit 0; 7개 런타임 자산 재생성 |
| `node --test Automation/test-conti-2d-assets.mjs Automation/test-fx.mjs Automation/test-character-create.mjs` | 11/11 PASS |
| `npx tsc -b` | exit 0 |
| `npm run build` | exit 0; Vite 726 modules |
| `node Automation/check-assets.mjs --json` | PASS; 대장 40행, public models/env 17/17 등록 |
| `node Automation/check-ip.mjs --src` | PASS; own 강제·가시 금지어 0 |
| `node --test <Automation/test-*.mjs 전체>` | R120 신규/표적 11/11 포함 492/494 PASS; R120 신규 실패 0 |

전체 회귀의 2 FAIL은 main 선행 결함이다. `test-char-player-glb` 대상 main 리깅본은 8,171,488B·18,652tris로 기존 4MB·18K 테스트 한도를 넘고, `test-run-story` main 실결과 4,685 코인은 저장 기대 3,785와 다르다. master가 R120 범위 밖 main 후속으로 처리하기로 확정했다. dist `check-ip`도 main의 영문 내부 식별자 72건·참조 디렉터리 누락·기존 후보/normal 미등록으로 FAIL이며 R120에서 정책·범위 파일을 바꾸지 않았다.

브라우저 캡처(타이틀·대화 패널)는 미실시했다. 5173은 main worktree를 제공하는 master 소유 PID 16604였고, 영하님의 `CLAUDE.md` §6 신설 지시에 따라 워커가 서버를 추가로 띄우지 않았다. master가 병합 후 5173에서 두 장을 최종 확인한다.
