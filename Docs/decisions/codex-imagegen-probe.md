# Codex 이미지 생성기 실측과 게임 자산 후보

- 실측일: 2026-08-27 KST
- 작업 기준: `wt/bench@95bbf83`, Codex TUI Context 65% left
- 범위: 후보만 `public/gen-candidates/`에 저장; 게임 코드·`src/data/assets.csv`·`src/game/data/fx.json` 연결 없음
- IP 원칙: 외부 이미지 다운로드 없음, 생성 프롬프트에 own-IP·고유 캐릭터/로고 비모사·무문자 제약 명시

## 1. 도구 실측

| 항목 | 실측 결과 |
|---|---|
| 도구명 | Codex built-in `image_gen.imagegen` |
| 호출 방식 | `prompt`와 선택적 `referenced_image_paths`를 전달하는 built-in call; 이번 작업은 서로 다른 자산마다 별도 호출 |
| 반환·저장 | raster `ImageContent`와 `output_hint`; 원본은 `$CODEX_HOME/generated_images/<run>/exec-*.png`에 PNG로 저장 |
| 입력 참조 | 로컬 PNG 경로를 스타일 참조 또는 편집 대상으로 전달 가능; 타이틀은 최초 생성물을 다시 참조해 1회 정밀 편집 |
| 출력 형식 | 이번 실측은 PNG만 반환. RGB와 RGBA가 입력 프롬프트에 따라 혼재 |
| 해상도 | 호출 스키마에 크기 지정 또는 상한 조회 필드가 없어 **상한 확인 불가**. 이번 원본 실측은 정사각 `1254×1254`, 16:9 `1672×941` |
| 투명 배경 | 명시적 native transparency 옵션은 없음. FX·EXP는 프롬프트만으로 RGBA가 반환됐지만 나머지는 RGB chroma였으므로 보장할 수 없음; 안정 경로는 단색 키 생성→로컬 키 제거→알파 검증 |
| 재현성 | seed·model id가 노출되지 않아 비트 단위 재현 불가. 각 폴더 `prompt.txt`로 의미적 재생성만 가능 |
| 3D 출력 | **불가**. 도구가 raster image만 반환하고 glTF/GLB·mesh·texture bundle·scale·triangle count 출력 계약이 없음 |
| 로컬 후처리 | 스킬 제공 `remove_chroma_key.py`(border auto-key, soft matte, 12/220, despill)와 Pillow Lanczos 리사이즈; FX는 현행 `alphaTest=0.5`에 맞춰 알파를 0/255로 절단 |

도구가 3D 파일을 반환하지 않으므로 e는 지시대로 동일 디자인의 정면·측면 모델링 참조 이미지 2장으로 대체했다. 따라서 텍스처 포함 여부·삼각형 수·월드 규모(m)는 측정 대상 자체가 없어 `N/A`다.

## 2. 후보 결과

모든 바이트는 최종 workspace 파일 기준이며 SHA는 표기 경로의 SHA-256 앞 12자리다.

| 구분 | 경로 | 크기·형식 | bytes · SHA | 투명 실측 | 품질 자평·권장 |
|---|---|---:|---:|---|---|
| a 촌장 초상 | `public/gen-candidates/npc-portraits/stan.png` | 512² PNG/RGBA | 225,862 · `8da2b5c48ace` | 네 모서리 α=0 | 정면·수염·저폴리 실루엣이 선명해 대화 초상 후보로 바로 비교 가능 |
| a 상인 초상 | `public/gen-candidates/npc-portraits/maya.png` | 512² PNG/RGBA | 185,270 · `0555f830ebe3` | 네 모서리 α=0 | 앞치마·주머니로 역할이 읽히고 같은 재질 톤을 유지 |
| a 궁수 초상 | `public/gen-candidates/npc-portraits/player-archer.png` | 512² PNG/RGBA | 258,772 · `79627e8d0253` | 네 모서리 α=0 | 활·숄더가 512px에서 명료하나 다른 둘보다 현대적 영웅 비율이라 함께 놓고 톤 확인 필요 |
| b FX 4×4 | `public/gen-candidates/skill-fx-sheet/fx-sheet.png` | 1024² PNG/RGBA | 817,343 · `5c37160c5fb9` | α 이진, 네 모서리 0 | 행별 화살 비·검기·치유 링·레벨업 4프레임이 모두 존재; 셀 내부 잔점은 직접 연결 전 정리 권장 |
| c 타이틀 | `public/gen-candidates/title-background/title-background.png` | 1280×720 PNG/RGB | 870,980 · `2a5dc9c519ad` | 불투명 배경 | 1회 편집 뒤 상단 1/3 전체가 열린 하늘이고 수목·길·빨간 지붕 마을이 하단에서 명료 |
| d 코인 | `public/gen-candidates/ui-icons/coin.png` | 64² PNG/RGBA | 6,286 · `730096d17712` | 네 모서리 α=0 | 64px에서도 금화 외곽과 태양 문양 식별 양호 |
| d 경험치 | `public/gen-candidates/ui-icons/exp.png` | 64² PNG/RGBA | 6,105 · `787b959e4a5d` | 네 모서리 α=0 | 보라 결정꽃이 코인·HP와 잘 구분되며 native RGBA 반환 사례 |
| d HP | `public/gen-candidates/ui-icons/hp.png` | 64² PNG/RGBA | 4,701 · `7828a2689c93` | 네 모서리 α=0 | 고전적 심장 실루엣이라 즉시 이해 가능 |
| d MP | `public/gen-candidates/ui-icons/mp.png` | 64² PNG/RGBA | 3,106 · `f19e41d9c5cd` | 네 모서리 α=0 | 파란 결정 물방울이 가장 단순하고 축소 가독성 우수 |
| d 퀘스트 | `public/gen-candidates/ui-icons/quest.png` | 64² PNG/RGBA | 4,809 · `29d2334db7c2` | 네 모서리 α=0 | 무문자 두루마리·리본이라 own-IP 안전, 작은 상태점은 별도 UI가 필요 |
| d 화살 | `public/gen-candidates/ui-icons/arrow.png` | 64² PNG/RGBA | 5,222 · `e756c5677847` | 네 모서리 α=0 | 3발 묶음이 탄약 의미를 분명히 전달 |
| d 물약 | `public/gen-candidates/ui-icons/potion.png` | 64² PNG/RGBA | 4,402 · `628dc51dfee0` | 네 모서리 α=0 | 불투명 도기 병으로 투명 유리 키잉 문제를 피하고 형태가 단순 |
| d 상점 | `public/gen-candidates/ui-icons/shop.png` | 64² PNG/RGBA | 4,629 · `5d95bb1e8ae6` | 네 모서리 α=0 | 빨강·크림 차양으로 마을 타이틀과 색 일치, 소형에서도 상점 인지 가능 |
| e 버섯 정면 | `public/gen-candidates/mushroom-prop/mushroom-front.png` | 768² PNG/RGBA | 226,535 · `c93f2b3b7e13` | 네 모서리 α=0 | 지붕형 캡과 5개 큰 면이 모델링 브리프에 적합 |
| e 버섯 측면 | `public/gen-candidates/mushroom-prop/mushroom-side.png` | 768² PNG/RGBA | 209,704 · `ec758a374634` | 네 모서리 α=0 | 색·재질·점 2개는 유지했으나 엄밀한 90° 정투영보다는 약한 3/4 시점이라 치수 원화로는 부적합 |

## 3. 형식·용량 검증

- 최종 파일: PNG **15개** + prompt **5개**, 총 **2,848,977B**(PNG 2,833,726B + prompt 15,251B), 8MB 한도의 34.0%다.
- 요구 해상도: 초상 3개 `512×512`, FX `1024×1024`, 타이틀 `1280×720`, 아이콘 8개 `64×64` 전부 일치한다. 버섯 참조는 요구 해상도 미지정이라 `768×768`로 통일했다.
- PNG 시그니처·Pillow decode: 15/15 PASS. 투명 요청 14개는 모두 RGBA이고 네 모서리 α=0; 타이틀만 의도대로 RGB 불투명이다.
- FX 16셀 `alphaTest=0.5` 커버리지: **5.96~32.95%**, 빈 셀 0, 부분 알파 픽셀 0이다. 셀 rect는 `fx.json`과 같은 `[col×0.25,row×0.25,0.25,0.25]` 격자다.
- 이미지 생성기는 확률적이라 생성 원본 자체를 재실행해 같은 SHA를 얻는 결정론 테스트는 할 수 없다. 최종 후처리 과정은 같은 입력 PNG에 대해 결정론적이다.

## 4. 기존 검사기 적용성

정적 경로 검사를 먼저 했다.

- `Automation/check-assets.mjs:13`의 검사 루트는 `public/models`, `public/env`뿐이어서 `public/gen-candidates/`를 보지 않는다.
- `Automation/check-ip.mjs:244`는 기본 `dist` 또는 `--src`의 `src`만 순회해 현재 후보 디렉터리를 보지 않는다.

따라서 두 검사기는 이번 산출물에 대해 **not-run(대상 외)**이며 실행 캡처를 허위로 만들지 않았다. 후보를 Vite build에 포함하거나 정식 경로로 채택할 때 master가 대장 등록과 함께 두 검사기를 다시 실행해야 한다.

## 5. 한계와 채택 권장

1. **바로 비교 가능한 후보**: NPC 초상 3장, 64px UI 8종, 타이틀 배경은 크기·알파·구도가 정리돼 시안 비교에 적합하다.
2. **정리 후 연결**: FX는 4×4 계약과 alphaTest 형태는 맞지만 셀 주변 잔점과 프레임별 체적 변화가 커서 미술 정리 뒤 기존 `fx.json`과 연결하는 편이 안전하다.
3. **모델링 참조 전용**: 버섯 2장은 GLB가 아니며 scale·tris·texture를 말할 수 없다. 정면을 형태 정본, 측면을 색·재질 보조로 사용하고 실제 DCC에서 치수를 새로 고정해야 한다.
4. **투명도 비보장**: native RGBA가 일부 호출에서 나왔어도 도구 스키마에 옵션이 없으므로 자동화 계약으로 삼지 않는다. chroma-key 후처리와 모서리·알파 검증을 유지한다.
5. **연결 보류**: 이 라운드는 후보 생산만 했으므로 게임 코드·대장·`fx.json`은 변경하지 않았다.
