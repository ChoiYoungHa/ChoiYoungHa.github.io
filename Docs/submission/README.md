# Web 3D 수직 슬라이스 제출 안내

## 1. 프로젝트 요약

이 프로젝트는 250m 안팎의 지형에서 거대 수목 한 그루와 붉은 지붕 마을을 향해 60~90초 걷는 3인칭 Web 3D 수직 슬라이스다. 설치 없이 URL 하나로 열리고 WebGPU 미지원 환경에서는 WebGL2로 폴백할 수 있다는 점을 웹 3D의 핵심 가치로 삼았으며, 범위 안에는 지형·길·거대 수목·집 3종·식생·고정 시각·대기원근·low/base 품질 프리셋이, 범위 밖에는 오픈월드 스트리밍·실내·점프·상호작용·전투·동적 GI·날씨·멀티플레이가 있다.

## 2. 실행 방법

- production URL: **TBD(M4-20)**
- 로컬 production 확인:

```sh
npm ci && npm run build && npm run preview
```

| 쿼리 | 의미 |
|---|---|
| `?q=low` | 1280×720 기준 low 품질 프리셋 |
| `?q=base` | base 품질 프리셋 |
| `?gl=webgl` | WebGL2 강제 폴백 |
| `?route=bench` | 워밍업 뒤 재현 가능한 60초 자동 동선 |
| `?shot=<vista>` | 고정 캡처 시점; `vista-start`, `vista-mid`, `vista-village` |

쿼리는 `?route=bench&q=low&gl=webgl`처럼 함께 사용할 수 있다.

## 3. 마일스톤 GATE 증거

모든 fps 값은 actual build, 1280×720 `low`, 30초 워밍업 뒤 `?route=bench` 60초를 3회 실행한 중앙값이다. 헤드리스 Chrome 수치는 일반 Chrome의 체감 성능으로 일반화하지 않는다.

| 단계 | master 판정 | WebGPU 평균 / 1% low fps | WebGL2 평균 / 1% low fps | 15분 soak | 프로세스 RAM | 근거 |
|---|---|---:|---:|---|---|---|
| M0b | 조건부 PASS | 143.28 / 72.04 | 143.69 / 93.75 | 905.75s, crash 0, TDR 0 | 영하님 육안 약 2GB; 정밀 CSV·캡처 보류 | [`m0b-gate.md`](../decisions/m0b-gate.md), [`m0b-runs.csv`](../perf/m0b-runs.csv) |
| M1 | 조건부 PASS | 141.51 / 44.83 | 141.55 / 45.08 | 911.59s, crash 0, TDR 0 | 확인 불가; 수동 측정 보류 | [`m1-gate.md`](../decisions/m1-gate.md), [`m1-runs.csv`](../perf/m1-runs.csv) |
| M2 | 조건부 PASS | 125.22 / 33.31 | 140.37 / 35.91 | 915.4s, crash 0, TDR 0 | 확인 불가; 수동 측정 보류 | [`m2-gate.md`](../decisions/m2-gate.md), [`m2-runs.csv`](../perf/m2-runs.csv) |
| M3 | **TBD(R45-C)** | **TBD(R45-C)** | **TBD(R45-C)** | **TBD(R45-C)** | 수동 측정 보류 | 룩 5/5는 [`l1-l5-decision.json`](../lookdev/l1-l5-decision.json), 성능 GATE는 R45-C 대기 |

M2의 calls는 63/200, programs는 40/40, texture GPU는 36.88/300MB, JS heap 중앙값은 WebGPU 193.07MB·WebGL2 213.92MB로 기록됐다. M2 전체 판정은 프로세스 RAM 정밀 증거가 없어 조건부이며, 수동 측정 절차는 [`process-ram-howto.md`](../perf/process-ram-howto.md)에 있다.

## 4. 룩 판정

목표 기준은 [`reference-metrics.json`](../lookdev/reference-metrics.json), 최종 판정은 [`l1-l5-decision.json`](../lookdev/l1-l5-decision.json)이다. M3는 S1=`vista-mid`(`m3-after-2`), S2=`vista-start`(`m3-after-1`), S3=`vista-village`(`m3-after-3`)로 고정했으며 **L1~L5 5/5 PASS**다.

| 명제 | 목표 기준 | M3 채택값 | 판정·근거 |
|---|---|---|---|
| L1 깊이별 채도 | near 30~36%, far 8~12% | S1 near **32.4%**, far **11.4%** | PASS · [`m3-after-2-metrics.json`](../lookdev/m3-after-2-metrics.json) |
| L2 온난→한랭 hue | near 45~55°, far 205~215° | S1 near **49.7°**, far **212.2°** | PASS · [`m3-after-2-metrics.json`](../lookdev/m3-after-2-metrics.json) |
| L3 원경이 밝음 | near 60~75, far 130~145 | S1 near **67.3**, far **134.1** | PASS · [`m3-after-2-metrics.json`](../lookdev/m3-after-2-metrics.json) |
| L4 랜드마크 실루엣 | 흑백에서 수목·지붕군 구분 | 수동 판정; 줄기/하늘 Δ37.2, 수관/하늘 Δ42.4, 줄기/수관은 형태로 구분 | PASS · [`m3-l4-s3.json`](../qa/m3-l4-s3.json), [`m3-after-1-bw.png`](../lookdev/m3-after-1-bw.png) |
| L5 전역 채도 | 중앙값 ≤22% | S2 **20.5%** | PASS · [`m3-after-1-metrics.json`](../lookdev/m3-after-1-metrics.json) |

파일 순서 1·2·3의 자동 판정은 before **1/4·2/4·1/4**에서 after **1/4·4/4·3/4**로 개선됐다. 최종 조합은 각 명제의 지정 샷을 사용하고 수동 L4를 더해 5/5이며, before/after 원본 수치는 [`m3-before-1-metrics.json`](../lookdev/m3-before-1-metrics.json)~[`m3-before-3-metrics.json`](../lookdev/m3-before-3-metrics.json)과 [`m3-after-1-metrics.json`](../lookdev/m3-after-1-metrics.json)~[`m3-after-3-metrics.json`](../lookdev/m3-after-3-metrics.json)에 있다.

채택 파라미터는 **NeutralToneMapping**, exposure **0.44**, depth grade `hueStrength=0.97`, `lumaGain=0.34`, `satFar=0.25`, sky `hazeMix=0.4`다. 톤매퍼 비교와 채택 근거는 [`m3-tonemap.md`](../lookdev/m3-tonemap.md)에 기록했다.

## 5. 자산과 라이선스

[`assets.csv`](../../src/data/assets.csv)는 14개 자산을 19열로 기록한다.

| 분류 | 수량 | 라이선스 | 사용 내용 |
|---|---:|---|---|
| Kenney | 6 | CC0 | 풀·꽃·관목 3종, 바위 3종 |
| Poly Haven | 1 | CC0 | `Kloppenheim 03 Pure Sky` 1K HDRI |
| 절차적 프로젝트 자산 | 7 | Project-owned | 거대 수목 1종, 집 3종, 지붕 3종 |

CC0 자산은 attribution이 필요 없고 재배포가 허용된다. 절차적 자산은 생성 코드 경로·삼각형 수·팔레트 근거를 자산 대장에 남겼으며, AI 생성 3D 자산은 사용하지 않았다.

## 6. 알려진 한계와 미확정

- production URL과 HTTP 200 판정은 **TBD(M4-20)** 이다.
- production URL의 WebGPU·WebGL2 실제 걷기 smoke는 각각 **TBD(M4-21)**, **TBD(M4-22)** 이다.
- M4 actual build의 low 성능 3회·JS heap·프로세스 RAM 중앙값은 **TBD(M4-23A)**, **TBD(M4-23B)**, **TBD(M4-23C)** 이다.
- 외부 테스터 3명의 실행·첫 입력·자력 도달 판정은 **TBD(M4-25A)** 이다.
- M3 룩은 L1~L5 5/5 PASS지만 성능·soak를 포함한 M3-GATE는 **TBD(R45-C)** 이다.
- Draco·KTX2가 이 PC에서 주는 실제 압축률과 로딩 이득은 **TBD(M4-08/M4-09E)** 이다.
- Intel Arc 드라이버와 브라우저 조합에서 특정 셰이더가 깨질 위험이 있어 WebGL2 강제 폴백을 유지한다.
- 동적 GI·실내·오픈월드 스트리밍은 의도적으로 범위 밖이며, 현재 룩은 IBL·고정 조명·안개·팔레트·실루엣에 의존한다.

## 7. 스크린샷 목록

| 구분 | 파일 | 상태 |
|---|---|---|
| M2 시작 전망 | [`m2-vista1.png`](../lookdev/m2-vista1.png) | 존재 |
| M2 길 중간 | [`m2-vista2.png`](../lookdev/m2-vista2.png) | 존재 |
| M2 마을 전망 | [`m2-vista3.png`](../lookdev/m2-vista3.png) | 존재 |
| M3 before 1~3 | [`m3-before-1.png`](../lookdev/m3-before-1.png), [`m3-before-2.png`](../lookdev/m3-before-2.png), [`m3-before-3.png`](../lookdev/m3-before-3.png) | 존재 |
| M3 after 1~3 | [`m3-after-1.png`](../lookdev/m3-after-1.png), [`m3-after-2.png`](../lookdev/m3-after-2.png), [`m3-after-3.png`](../lookdev/m3-after-3.png) | 존재 |
| M3 흑백 실루엣 | [`m3-after-1-bw.png`](../lookdev/m3-after-1-bw.png) | 존재 · L4 수동 판정 |

제출 증거의 파일별 존재 여부는 [`evidence-index.md`](evidence-index.md)에 고정했다.
