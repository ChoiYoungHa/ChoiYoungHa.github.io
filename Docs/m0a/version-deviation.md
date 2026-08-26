# M0-a 버전 편차 기록

> 작성 worker-claude `eef5c8cf` · 2026-08-26 KST
> 기준 SSOT: `계획서.md §2-1` 버전 고정표 / `§2-5` M0 최소 의존성 · 로드맵 `M0a-02`

---

## 편차 1 — `r3f-perf@7.2.3` **제외** (master 승인 A안)

### 무엇이 문제였나

`계획서.md §2-1`은 11종을 캐럿 없이 고정하라고 정했고 `r3f-perf@7.2.3`이 그중 하나다.
설치 후 `npm ls`가 **`invalid` 3건**을 냈다 — `react`, `react-dom`, `@react-three/fiber`.
로드맵 `M0a-03`의 완료 조건은 **`extraneous/invalid=0`** 이므로 그대로는 PASS할 수 없었다.

### 원인 (레지스트리·설치 트리 실측, 2026-08-26)

| 항목 | 실측값 |
|---|---|
| `r3f-perf` 최신 버전 | **7.2.3** — 상위 버전이 존재하지 않는다(레지스트리 `dist-tags.latest`) |
| `r3f-perf@7.2.3`의 **자체** peerDependencies | `react >=18.0`, `react-dom >=18.0`, `@react-three/fiber >=8.0`, `three >=0.133` → **우리 조합과 충돌하지 않는다** |
| 실제 충돌 지점 | `r3f-perf`가 **일반 의존성**으로 `@react-three/drei@^9.103.0`을 끌고 온다 |
| 중첩 설치된 것 | `node_modules/r3f-perf/node_modules/@react-three/drei@9.122.0` |
| 그 중첩 drei의 peer | **`react@^18`**, **`@react-three/fiber@^8`** |
| 결과 | 루트에 호이스팅된 `react@19.2.8` · `@react-three/fiber@9.7.0`이 그 peer 범위를 벗어나 **invalid** 판정 |

즉 **버전을 올려서 해결할 수 있는 문제가 아니다.** 7.2.3이 최신이고, 그 안의 drei@9 의존이 R3F 9 / React 19 세대와 맞지 않는다.

### 검증

```
# 제외 전
npm ls ... -> npm error code ELSPROBLEMS
             invalid: @react-three/fiber@9.7.0
             invalid: react-dom@19.2.8
             invalid: react@19.2.8

# 제외 후
npm remove r3f-perf
npm ls ... -> invalid/extraneous 매칭 줄 0
```

### 결정 (master 승인)

**`r3f-perf`를 M0-a 의존성에서 제외한다.** 고정 대상은 **11종 → 10종**.

근거 3가지:
1. `r3f-perf`는 **개발 전용 오버레이**이고 `M0a-04`~`M0a-09` 어느 행의 산출물·완료 조건에도 등장하지 않는다.
2. `계획서.md §4-3` 측정 도구표가 이미 **`renderer.info`를 1순위**로 두고, `r3f-perf`에는 *"측정 중에는 끈다 — 오버레이 자체가 콜을 더한다"* 라고 적어 두었다. 관문 측정의 근거가 아니다.
3. 마감 D-1이며 대안(`overrides` 강제)은 동작 미검증이고 부작용 위험이 있다.

### M0-b 복구안

| 순위 | 방법 | 비고 |
|---|---|---|
| 1 | **`renderer.info` 직접 출력** — `render.calls` / `render.triangles` / `memory.geometries` / `memory.textures` / `programs.length`를 1초 1회 샘플해 HUD·CSV로 | `계획서.md §4-3`의 1순위 도구. 의존성 0 |
| 2 | 대체 패키지 재조사 | R3F 9 / React 19 세대를 지원하는 프로파일러가 나오면 재평가 |
| 3 | `r3f-perf` 재도입 | 상위 버전이 나와 중첩 drei 의존이 해소된 경우에만 |

> **master가 `계획서.md §2-1`·`§2-5`를 사후 정정한다.** 이 문서를 쓴 시점의 두 절은 아직 11종·`r3f-perf@7.2.3` 포함 상태다.

---

## 편차 없음 — 나머지 10종

`npm create vite@latest --template react-ts`(create-vite@9.2.0) 템플릿이 가져온 값과 SSOT 고정값을 대조했다.

| 패키지 | SSOT(§2-1) | 템플릿 초기값 | 조치 | 최종 |
|---|---|---|---|---|
| `react` | 19.2.8 | `^19.2.8` | `--save-exact` 재설치 | **19.2.8** |
| `react-dom` | 19.2.8 | `^19.2.8` | 동 | **19.2.8** |
| `three` | 0.185.1 | 없음 | 신규 | **0.185.1** |
| `@react-three/fiber` | 9.7.0 | 없음 | 신규 | **9.7.0** |
| `@react-three/drei` | 10.7.8 | 없음 | 신규 | **10.7.8** |
| `zustand` | 5.0.15 | 없음 | 신규 | **5.0.15** |
| `leva` | 0.10.1 | 없음 | 신규 | **0.10.1** |
| `vite` | 8.2.2 | `^8.2.2` | `--save-exact` 재설치 | **8.2.2** |
| `@vitejs/plugin-react` | 6.1.0 | `^6.1.0` | 동 | **6.1.0** |
| `typescript` | 7.0.2 | **`~6.0.2`** ★ | `--save-exact`로 7.0.2 설치 | **7.0.2** |

★ **템플릿은 TypeScript 6 계열을 기본으로 준다.** SSOT가 7.0.2이므로 명시 설치했고, `M0a-03`의 `npx tsc --noEmit` 결과는 같은 행에 기록했다. TS 7에서 실패했다면 완료 조건대로 이전 메이저로 내리고 여기에 적었을 것이다 — **내리지 않았다.**

### 템플릿이 추가로 가져온 것 (SSOT 밖, 유지)

`@types/node` · `@types/react` · `@types/react-dom` · `oxlint` — create-vite 기본 구성이다. 캐럿 유지. `계획서.md §2-1`에 없지만 타입 정의와 린터라 고정 대상이 아니라고 판단했다.
