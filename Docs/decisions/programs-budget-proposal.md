# WebGPU programs 예산 재정의 제안

- 제안일: 2026-08-27
- 대상: `계획서.md` §4-1의 low 기준 `renderer.info.memory.programs ≤40`
- 근거: [`m5-programs.json`](../qa/m5-programs.json), [`m5-bench-r91-seconds.json`](../perf/m5-bench-r91-seconds.json), [`m5-bench-r96-before.csv`](../perf/m5-bench-r96-before.csv), [`m5-bench-r96-noshadow.csv`](../perf/m5-bench-r96-noshadow.csv)
- 상태: **영하님 결정 항목 — 미승인**

## 1. 결론

**추천안은 A, WebGPU render pipelines ≤48로 기준을 바꾸는 것**이다. `programs.length`는 three r185 WebGPU에서 사용자가 생각하는 “재질 종류 수”가 아니라 vertex/fragment 셰이더 스테이지 모듈의 합에 가까워 같은 fragment를 공유해도 지오메트리 레이아웃과 패스가 달라질 때 vertex 모듈이 늘어난다. 반면 pipeline 수는 실제로 함께 바인딩되는 `재질 노드 그래프 × 지오메트리 레이아웃 × 렌더 패스` 조합을 세므로 비용 원인과 게이트의 이름이 일치한다.

승인 시 계획서 §4-1의 주 게이트를 `WebGPU render pipelines ≤48`로 바꾸고, `programs ≤72`, `material objects ≤16`, `shadow-casting mesh groups ≤8`은 회귀 진단값으로 함께 기록하는 방식을 제안한다. 이 문서는 제안서일 뿐 계획서 기준을 변경하지 않는다.

## 2. 왜 현재 `programs ≤40`이 문제인가

R91-A의 S1 WebGPU 실측은 재질 객체 **12개**인데 `infoPrograms=55`였다. 55는 vertex **36** + fragment **19**의 합이고, 같은 시점의 실제 render pipeline은 **36개**였다. 즉 “programs ≤40 = 머티리얼 종류 상한”이라는 계획서 설명은 측정 의미와 맞지 않으며, 정상 자산을 도입한 현재 장면은 재질 수가 충분히 낮아도 예산을 구조적으로 넘는다.

three r185 WebGPU에서는 대략 다음 조합마다 별도 pipeline 또는 vertex variant가 생긴다.

```text
pipeline key ≈ material node graph
             × geometry layout (plain / UV / vertex color / instanced / instanceColor)
             × pass (main / shadow depth / alpha-cutout depth)
```

따라서 같은 재질 객체를 공유하는 것만으로 `programs`가 줄지 않을 수 있다. R91에서도 flower·bush와 rock 3종의 재질 객체를 합쳐 12→9로 줄인 실험에서 programs는 55→55로 유지됐다. 비용을 줄이려면 재질 객체 개수보다 지오메트리 레이아웃·그림자 패스·alphaTest 변형을 줄이거나 pipeline을 직접 관리해야 한다.

## 3. 실측과 FPS 해석

| 실측 | programs 또는 모듈 | pipelines | 재질 | calls | 평균 FPS | 1% low | 해석 |
|---|---:|---:|---:|---:|---:|---:|---|
| R91 S1 12초 | 55 = vertex 36 + fragment 19 | 36 | 12 | — | 정상 구간 122~132 | — | 재질 12개만으로 programs 40 초과, pipeline은 36 |
| R91 bench 동선 | 64 | 미기록 | 12+동선 변형 | — | 정상 구간 122~132 | 전체 13.13 | 첫 1~2초 워밍업이 전체 low를 낮춤 |
| R96 before | 67 | 미기록 | 미기록 | 57 | 123.54 | **22.26** | 현행 programs 예산 초과지만 FPS·hitch 기준 PASS |
| R96 castShadow off | 64 (**−3**) | 미기록 | 미기록 | 54 | 122.76 | 19.21 | programs −3에도 평균 −0.78, low −3.05; 단일 실행상 개선 인과 없음 |

R96의 `castShadow off`는 programs와 calls를 각각 3 줄였지만 평균 FPS는 0.63% 낮고 1% low도 낮았다. 표본 1회라 성능 악화의 인과로 볼 수도 없지만, 반대로 programs 3개 절감이 곧 FPS 개선이라는 근거도 아니다. 현재 핵심 사실은 **1% low 22.3, 정상 구간 122~132 FPS**가 성능 게이트를 통과하는 동안 programs 숫자만 40을 넘는다는 점이다.

## 4. 대안 비교

| 안 | 제안 기준 | 현재 여유 | 장점 | 위험·보완 |
|---|---|---:|---|---|
| **A** | **render pipelines ≤48** | R91 36 기준 +12 | WebGPU의 실제 조합 비용과 이름이 일치; M6 wobble·drop·VFX +3과 추가 레이아웃 여유를 함께 수용 | three 내부 계측 경로를 고정해야 함; programs 72와 재질 16을 보조 기록 |
| B | `programs.length ≤72` | R96 67 기준 +5 | 기존 `renderer.info` 수집기를 거의 그대로 사용; 역사 데이터 비교 쉬움 | vertex+fragment 모듈 합이라 재질·pipeline 비용을 혼동; +5는 M6 변형에 빠듯함 |
| C | 재질 객체 ≤16 + 그림자 캐스터 그룹 ≤8 | R91 재질 12 기준 +4 | 제작자가 즉시 이해하고 원인별로 줄일 수 있음; 그림자 pass 폭증 억제 | 같은 재질도 layout/pass에 따라 pipeline이 늘므로 단독 하드 게이트로는 누락 가능 |

## 5. 추천안의 운영 규칙

1. 저사양 WebGPU 720p에서 경로 워밍업 후 장면 전체를 순회해 peak pipelines를 기록한다.
2. 하드 게이트는 `pipelines ≤48`; 보조 경보는 `programs ≤72`, `material objects ≤16`, `shadow-casting mesh groups ≤8`로 둔다.
3. 초과 시 재질 객체 병합부터 하지 말고 `layout`, `main/shadow`, `alphaTest depth` 단위로 pipeline 키를 분류한다.
4. 숫자 절감 채택 여부는 3회 중앙값의 평균 FPS·1% low·hitch와 함께 판정한다. programs 감소만으로 성능 개선을 주장하지 않는다.

## 6. 영하님 결정 항목

- [ ] **A 승인**: 계획서 §4-1 주 기준을 `WebGPU render pipelines ≤48`로 정정하고 위 보조 경보를 추가한다.
- [ ] B 승인: 기존 지표 이름을 유지하며 `programs ≤72`로 상향한다.
- [ ] C 승인: 제작 예산을 `재질 ≤16 + 그림자 캐스터 그룹 ≤8`로 바꾼다.
- [ ] 보류: 현행 `programs ≤40`을 유지하고 M5/M6 게이트 초과를 결함으로 남긴다.

추천: **A 승인**. R91의 36 pipelines가 현재 장면을 통과시키면서도 48까지 25% 여유만 허용하고, `programs`가 재질 상한이라는 잘못된 해석을 제거한다.
