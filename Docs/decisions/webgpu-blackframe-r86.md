# WebGPU 검은 프레임(depth 300×150 ≠ color 1280×720) — 원인·수정·검증 (R86-A, worker-claude)

## 증상 (R77-A 보고)
- main WebGPU 헤드리스 캡처(`report.ts` `/shot` = `canvas.toDataURL`) 전부 검정 PNG 20,831B. 콘솔 매 프레임 `GPUValidationError: The depth stencil attachment [depthBuffer] size (300×150) does not match the color attachment size (1280×720)` + `Invalid CommandBuffer`. `?lookAssets=0` 도 동일, `?gl=webgl` 정상, `42557e2` 빌드 정상.
- 기준선(R86-A, `Automation/cdp-shot.mjs` S1 5회): **5/5 검정**, 콘솔 error 990~1276/회.

## 실측으로 잡은 원인 (파일·줄)
1. 검정 실행 중 렌더러 내부를 CDP 로 읽음(`globalThis.__GL__` 임시 노출): `canvasTarget._width/_height = 300×150`, `depthTexture.image 300×150`, **캔버스 속성은 1280×720**. → store 의 gl 은 `setSize` 를 받은 적이 없고, 캔버스 속성은 *다른 렌더러 인스턴스*가 설정.
2. `createRenderer` 호출 횟수를 로그로 실측: **페이지당 14~16회**. 원인 연쇄:
   - `src/App.tsx` `App()` 이 `useLoadingState()` 를 구독해 로딩 progress 마다 재렌더 → `<Canvas>` 재렌더.
   - R3F 9.7 `Canvas` 의 레이아웃 이펙트(`react-three-fiber.esm.js:62`, **deps 없음**)가 매 렌더 `root.configure()` 재호출.
   - `configure()`(`events-*.esm.js:15722`) 의 `if (!state.gl)` "1회 생성" 가드는 **`await glConfig()` 동안 재진입을 못 막는다** → async 팩토리가 여러 번 실행되어 같은 캔버스에 `WebGPURenderer` 가 여러 개 생김. 첫 인스턴스만 `state.setSize → gl.setSize(1280×720)` 를 받고(캔버스 속성이 그 값), `state.set({gl})` 마지막 승자는 300×150 인 채로 렌더 → `WebGPUBackend._getDefaultRenderPassDescriptor` 가 `getDepthBuffer()` 를 `getDrawingBufferSize()`(=300×150) 로 만들고 색 첨부는 `context.getCurrentTexture()`(1280×720) → 검증 에러.
   - 구 빌드(42557e2)는 번들 타이밍상 **로딩 ready 뒤에 Canvas 가 마운트**되어(콘솔 순서: `[loading] detail -> ready` 뒤 `THREE.Clock` 경고) 재렌더가 없었다. R75-C 이후 번들이 커지며 순서가 뒤집혀 결정론적으로 재현. **자산·Suspense·Atmosphere·grassLite 와 무관**(파일 이분이 상충했던 이유).
3. 부수 발견: 같은 재진입으로 `camera` 옵션 객체 리터럴이 매 configure 마다 비교되어 카메라 재생성 가능(`configure` L24). Canvas 1회 마운트로 함께 사라진다.

## 수정 (최소, 2파일 + 1 되돌림)
| 파일 | 변경 | 줄 |
|---|---|---|
| `src/App.tsx` | `<Canvas …>` 서브트리를 `memo` 컴포넌트 `Stage`(props 전부 원시값: width·height·shot·hideHero·dprCap)로 분리. App 의 로딩 재렌더가 Canvas 에 닿지 않아 `configure` 1회. | +45/−31 (이동 포함) |
| `src/gl/createRenderer.ts` | 캔버스별 `WeakMap` 프로미스 캐시 + `readCreateRendererCalls()` 실측 카운터(방어선: 재진입돼도 렌더러 1개). 재사용 시 `console.info('[gl] … cached renderer reused')`. | +29/−1 |
| `src/systems/report.ts` | R77-A 의 `addAfterEffect` 캡처를 **42557e2 rAF 버전으로 되돌림**(원인 아님이 확인됐고 rAF 가 실측 정상). | −7/+14 |

## 검증
| 항목 | 결과 |
|---|---|
| `cdp-shot.mjs` S1 ×5 (WebGPU) | 5/5 PNG 378.6KB, 콘솔 GPUValidationError **0**, `createRenderer` 호출 **1** |
| `lookdev-variants.mjs` S1 toDataURL (WebGPU) | baseline 988,287B · before(`?lookAssets=0`) 499,730B — 1차 시도 성공(검정 0) |
| `?lookAssets=0` | 정상(248.8KB, hero procedural, 에러 0) |
| `?gl=webgl` (variants toDataURL) | 921,465B 정상, 에러 0 |
| `?route=bench` (`run-bench --runs 1`, `Docs/perf/m5-bench-r86.csv`) | measurement PASS·crash 0·errors 0 — avg 121.7 / 1%low 17.3 / calls 57 / **programs 63** / texGPU 98.5MB (자산 적용 후 첫 유효 수치; programs 40 초과·1%low<20 은 M5 관문 라운드 보고 대상) |
| `npx tsc -b` | 0 |
| 테스트 | loading 6·look-assets 16·final-route 15·hero-contrast 14·village 6·terrain 12·presets 3·ui-logic 12 — 회귀 0 |

## 가설별 결과(과제 §2 순서)
| 가설 | 결과 |
|---|---|
| (a) init 직후/onCreated `setSize` 재적용 | R77 에 시도 — 무효. 이유: onCreated 가 여러 configure 중 하나에서 불려도 store 의 최종 gl 이 다른 인스턴스 |
| (b) Suspense 제거 | 불필요 — `?lookAssets=0`(Suspense 경로 없음)도 검정이었고 원인은 Canvas 재렌더 |
| (c) Atmosphere 되돌림 | 이분에서 Atmosphere 단독은 정상, 그러나 원인 아님(타이밍) |
| (d) three 내부 depth dispose | `getDepthBuffer` 는 크기 변경 시 재생성함 — 정상. 문제는 setSize 자체가 안 온 것 |
| 실측 프로브(신규) | `canvasTarget._width 300` + 팩토리 16회 → 근본 원인 확정 |

## 교훈
- CDP `Page.captureScreenshot` 은 헤드리스에서 WebGPU 캔버스를 합성 캡처에 못 담는 경우가 있어(안개색 배경+HUD 20.6KB) "검정" 판정 도구로 부적합 — toDataURL(`/shot`) 러너가 정본. R77-A 문서의 "CDP 스크린샷도 검정" 서술은 이 오해였다.
- R3F 에 async `gl` 팩토리를 줄 때 Canvas 는 **재렌더되지 않는 위치**에 두거나 팩토리를 idempotent 하게 만들어야 한다.
