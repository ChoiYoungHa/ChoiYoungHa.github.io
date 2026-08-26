# M3-01 룩디브 baseline

- 측정일: 2026-08-26
- build hash: `5917486`
- build: `npm run build` 정확히 1회, exit `0`, Vite production build `758ms`
- 캡처 방식: actual build를 `Automation/probe-server.mjs`로 제공하고 `?shot=<vista id>&q=low&report=<name>`에서 `renderer.domElement.toDataURL('image/png')` 결과를 저장
- 고정 조건: WebGPU, `low`, 1280×720, FOV 55°, HDR 로드 후 12초 지연, 동일 포스트 체인
- 재캡처: 없음

## 캡처 유효성

| 파일 | vista / 계획서 샷 | PNG 헤더 | bytes | runtime fps / calls / triangles | HDR·하늘 확인 |
|---|---|---|---:|---|---|
| `m3-before-1.png` | `vista-start` / S2 | 1280×720, 8-bit RGBA | 433,055 | 128 / 34 / 0(확인 불가) | 구름·푸른 하늘 육안 확인, 상단 band luma 196.6(흰색 255 아님) |
| `m3-before-2.png` | `vista-mid` / S1 | 1280×720, 8-bit RGBA | 499,749 | 128 / 23 / 0(확인 불가) | 구름·푸른 하늘 육안 확인, 상단 band luma 196.4(흰색 255 아님) |
| `m3-before-3.png` | `vista-village` / S3 | 1280×720, 8-bit RGBA | 520,358 | 129 / 39 / 0(확인 불가) | 구름·푸른 하늘 육안 확인, 상단 band luma 178.1(흰색 255 아님) |

세 런타임 report는 backend `WebGPU`, preset `low`, canvas `1280×720`, errorCount `0`으로 일치했다. WebGPU의 triangles `0`은 이 프로젝트 측정 관례상 실제 0이 아니라 `renderer.info.render.triangles` 확인 불가를 뜻한다.

## L1·L2·L3·L5 자동 측정

근경은 bands 6+7, 원경은 band 2다. 값은 `Automation/measure.mjs`와 `src/data/lookdev-targets.json`으로 계산했다.

| 파일 / vista | L1 채도 near / far | L1 | L2 hue near / far | L2 | L3 luma near / far | L3 | L5 전역 채도 중앙값 | L5 | PASS |
|---|---:|---|---:|---|---:|---|---:|---|---:|
| `m3-before-1` / vista-start | 11.8 / 13.8 | FAIL | 52.1° / 234.1° | FAIL | 141.3 / 147.0 | FAIL | 9.5% | PASS | **1/4** |
| `m3-before-2` / vista-mid | 12.2 / 8.8 | FAIL | 52.6° / 214.8° | PASS | 139.7 / 176.6 | FAIL | 8.4% | PASS | **2/4** |
| `m3-before-3` / vista-village | 12.2 / 2.9 | FAIL | 52.9° / 218.7° | FAIL | 138.2 / 201.7 | FAIL | 8.7% | PASS | **1/4** |

## baseline 결론

L5는 세 vista 모두 통과하고 L2는 vista-mid만 통과한다. 공통 결함은 근경 채도 `11.8~12.2%`가 목표 `30~36%`보다 낮고, 근경 luma `138.2~141.3`이 목표 `60~75`보다 높다는 점이다. 원경 luma도 `147.0~201.7`로 목표 `130~145`를 넘으며, 이 baseline은 후속 노출·환경광·안개·팔레트 튜닝의 before 기준이다.

근거: `Docs/lookdev/m3-before-[1-3].png`, `Docs/lookdev/m3-before-[1-3]-metrics.json`, `src/data/lookdev-targets.json`, `계획서.md §6-4`.
