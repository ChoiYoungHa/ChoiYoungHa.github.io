# lookdev-variants.mjs 결함 수정 기록 (R64-A, 2026-08-26)

> main HEAD `c9abe57`(wt/claude 병합). 증거: `prior-fail/lv-baseline-S1-attempt{1,2}.json`(codex-A 실행 2회, 둘 다 RESULT 는 왔으나 PNG 없음 → `:412` throw → `:467` 루프가 예외를 안 잡아 attempt 2 로 못 감).

## 결함 1 — 재시도 루프가 캡처 예외를 흡수하지 않음

- 현상: `captureOne` 이 throw 하면 for 루프 밖으로 빠져 러너 전체가 종료. attempt 2·다음 캡처 전부 실행 안 됨.
- 수정: 재시도 제어 흐름을 `captureWithRetry(item, {captured, outDir, attempts, measureFn}, capture)` 로 분리(캡처 함수 주입 → Node 테스트 가능). 캡처 예외(RESULT 없음·PNG 없음)와 검증 실패(HDR 미로드·nohero 짝 불일치)를 **같은 경로**로 재시도. attempt 마다 `<name>-attempt<N>.json`(status ok / capture-error / unloaded, error, timing, topBand) 을 남기고, 2회 다 실패하면 `failures[]` 에 기록하고 **다음 캡처로 진행**(결과 json `failures` 필드). 테스트 4건 추가(예외→성공, 2회 실패, 미로드→재캡처, nohero 짝 불일치) → 25/25.

## 결함 2 — 빈 캔버스가 아니라 **/shot POST 유실**

- 규명: `report.ts` 는 `?report=` 타이머에서 `/result` 를 즉시 POST 하고, `/shot`(PNG dataURL) 은 `captureCanvas()` = rAF 대기 → `toDataURL` 뒤 **비동기로** POST 한다. 이전 러너는
  1. `probe-server.mjs` 를 **기대 수 1** 로 띄워 RESULT 수신 300ms 뒤 서버가 자동 종료되고,
  2. RESULT 로그를 보는 순간 `chrome.kill()` 을 호출했다.
  → `/shot` 이 서버 종료·프로세스 kill 에 걸려 유실. R30 의 `m3-capture.sh`(정상 동작)는 기대 수 N + `RESULT` 뒤 **`SHOT <name>` 로그를 최대 15초 추가 대기**했고, 이 차이가 원인이다. codex 의 attempt json 은 `calls 23·mesh 30·errors 0·fps 144` 로 앱 렌더는 정상이었다 — "캔버스 5KB 미만" 가설은 틀렸다(앱 결함 아님).
- 수정 줄(`captureOne`): 기대 수 `'1'` → `'2'`(자동 종료 방지) · `RESULT` 뒤 `SHOT ${name}` 를 `shotWaitMs`(15000) 까지 대기 · 그 뒤 Chrome kill → 프로필 kill → `server.kill()` 명시 종료 · timing(`resultMs`·`shotMs`·`gotShot`) 을 attempt json 에 기록 · PNG 없음 오류 문구를 "SHOT 로그 있음/없음" 으로 구분.
- 단일 재현(`--variants <baseline S1 만> --skip-build`, `Docs/lookdev/variants-repro/`): attempt 1 성공, PNG 519,822 B, `resultMs 12758 / shotMs 12758 / gotShot true` — SHOT 은 RESULT 와 같은 폴링 틱(100ms) 안에 도착. 즉 유실은 "느려서"가 아니라 **RESULT 직후 즉시 kill** 때문. S1 자동 PASS 4/4(= `l1-l5-decision.json` S1 값과 일치).

## 부수 정리
- codex 실행의 attempt json 2개는 `prior-fail/` 로 이동(내 실행이 같은 이름으로 덮어쓰므로).
- 본 실행은 `--skip-build` 로 돌렸다(이 라운드 시작 시 같은 HEAD 에서 `npm run build` 1회 완료, `build64.log` exit 0).

## 결함 3 — 간헐 **검은 프레임**(본 실행에서 발견)

- 본 실행(20 캡처·`--skip-build`) 22 attempt 중 **4건이 20,831 B 전면 검정**(baseline S2-nohero ×2·heroContrast S1·grassLite S2). 앱·변형과 무관하게 간헐 발생(재실행 시 baseline S2-nohero 가 다시 1회 검정 → 2회차 정상). WebGPU 캔버스 리드백이 프레임 제시 전에 읽힌 것으로 본다(R48 교훈 "캡처 트리거는 첫 프레임을 보장하지 않는다"). report.ts 의 5KB 문턱은 검정 PNG(20KB)를 못 거른다.
- 수정: `looksBlack`(전 밴드 휘도 <3) 검출 → 재캡처, attempts 2→**3**, 재시도 소진 시 **실패 처리**(그대로 채택하지 않음, `failures[]`). nohero 짝 상단 밴드 ±15 규칙은 제거(vistaPitch 처럼 수관이 상단 밴드를 덮는 샷에서 오탐: 156 vs 176.8). `--only <names>`·`--reuse-existing` 부분 재실행 추가(기존 정상 PNG 재사용, 흑백 PNG 는 항상 재생성). 테스트 27/27.
- 재촬영: `--only lv-baseline-S2-nohero,lv-grassLite-S2,lv-heroContrast-S1` → 3건 정상(426,692 / 428,479 / 520,205 B), 나머지 17건 재사용.

## 최종 결과 (`variants-result.md`, 2026-08-26 22:4x)

| 변형 | 판정 | 자동 PASS(S1·S2·S3) | 목표 지표 실측 |
|---|---|---|---|
| baseline | 기준 | **8**(4·1·3) = `l1-l5-decision.json` 과 동일 | S3 far 166.4 · L4 줄기 105.9 / 수관 101.3 / 하늘 147.6 → Δ 4.6 |
| hazeDir | REJECT | 7(4·1·**2**) — S3 L1 이 깨짐(far 채도 10.5→**14.7** > 12) | S3 far 166.4→**155.1**(−11.3, 목표 ≤145 미달) |
| heroContrast K1 | REJECT | 8(4·1·3) 유지 | L4 줄기 103.6 / 수관 101.8 → **Δ 1.8**(예측 12.3 — 126m 거리에서 대기 그레이딩이 정점색 차이를 지움) |
| vistaPitch 22.1° | REJECT | 5(**1**·1·3) — S1 L1~L3 전부 깨짐(근경이 하늘·줄기로 바뀜) | 수목 bbox top **0**(수관 여전히 잘림, 계산보다 수관 폭이 큼) |
| **grassLite** | **ADOPT 후보** | **8**(4·1·3) | low worst tris **312,434** ≤600K |
| combo | REJECT | 7 | hazeDir·heroContrast 사유 합산 |
