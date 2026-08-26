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

M2의 calls는 63/200, programs는 40/40, texture GPU는 36.88/300MB, JS heap 중앙값은 WebGPU 193.07MB·WebGL2 213.92MB로 기록됐다. M2 전체 판정은 프로세스 RAM 정밀 증거가 없어 조건부이며, 수동 측정 절차는 [`process-ram-howto.md`](../perf/process-ram-howto.md)에 있다.

## 4. 룩 판정

목표 기준은 [`reference-metrics.json`](../lookdev/reference-metrics.json), 현재 값은 R24-A가 측정한 `m2-vista1~3-metrics.json` 순서다. M3 최종 채택 결과는 진행 중인 튜닝과 분리해 모두 **TBD(R30-A)** 로 남긴다.

| 명제 | 목표 기준 | R24-A 현재값(vista1 / 2 / 3) | 현재 판정 | M3 최종 |
|---|---|---|---|---|
| L1 깊이별 채도 | near 30~36%, far 8~12% | near 11.8 / 12.2 / 12.2%; far 13.8 / 8.8 / 2.9% | 0/3 PASS | **TBD(R30-A)** |
| L2 온난→한랭 hue | near 45~55°, far 205~215° | near 52.1 / 52.6 / 52.9°; far 234.1 / 214.8 / 218.7° | 1/3 PASS | **TBD(R30-A)** |
| L3 원경이 밝음 | near 60~75, far 130~145 | near 141.3 / 139.7 / 138.2; far 147.0 / 176.6 / 201.7 | 0/3 PASS | **TBD(R30-A)** |
| L4 랜드마크 실루엣 | 흑백에서 수목·지붕군 구분 | 자동 수치 없음; `m2-herotree-S1-bw.png` 존재 | **TBD(M3-19C)** | **TBD(R30-A)** |
| L5 전역 채도 | 중앙값 ≤22% | 9.5 / 8.4 / 8.7% | 3/3 PASS | **TBD(R30-A)** |

현재 자동 판정은 vista별 1/4, 2/4, 1/4 PASS다. M3 합격선은 수동 L4를 포함한 L1~L5 중 4개 이상 PASS다.

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
- M3의 L1~L5 최종 판정은 **TBD(R30-A)** 이다.
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
| M3 after 1~3 | **TBD(R30-A)** | 최종 채택본 대기 |

제출 증거의 파일별 존재 여부는 [`evidence-index.md`](evidence-index.md)에 고정했다.
