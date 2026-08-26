# M4 final route 자동 적합 (R71-B)

## 판정

- 결과: **PASS**
- 고정 조건: dt `1/60`, duration `75s`, waypoint `11`개, waypoint 시각·position·input 불변
- 적합 변수: 이동 구간 pose.yaw. 첫 2.5초 중간 yaw는 기존 회귀 단언을 보존하고, 좌표하강 step `0.6 → 0.3 → 0.15 → 0.075 → 0.03 → 0.012 → 0.005 → 0.002 → 0.001 → 0.0004`를 고정했다.
- 최종 routeHash: `a9f1339c4187` (`finalRoute.ts`와 같은 routeHash·routeHashMethod 제외 compact JSON SHA-256 앞 12자)
- 최대 waypoint 편차: `1.467m` (한도 2m)
- 최종 hero-approach 편차: `0.252m`; 밑동 중심거리: `9.248m` (허용 9~10m)

## 전/후 편차

R69-A 브라우저 값은 `Docs/qa/m4-final-route-run.json`, Node 전/후는 아래 재사용 경로를 dt 1/60으로 실행한 값이다.

| waypoint | R69 브라우저 전(m) | Node 전(m) | Node 후(m) | Node 후 actual x,z |
|---|---:|---:|---:|---|
| spawn | 0.03 | 0 | 0 | (0, 24) |
| village-gap | 0.85 | 0.833 | 0.889 | (-4.585, 9.213) |
| village-north | 1.41 | 1.42 | 0.885 | (-9.861, -5.795) |
| meadow-entry | 1.69 | 1.707 | 1.467 | (-7.454, -27.809) |
| gentle-rise | 0.68 | 0.661 | 0.78 | (4.325, -46.709) |
| mid-vista | 1.02 | 1.024 | 0.567 | (18.46, -59.669) |
| tree-approach | 0.98 | 0.954 | 1.048 | (32.305, -77.003) |
| hero-approach | 0.58 | 0.439 | 0.162 | (35.338, -86.753) |
| hero-look | 0.58 | 0.467 | 0.252 | (35.346, -87.141) |
| turn-back | 0.58 | 0.467 | 0.252 | (35.346, -87.141) |
| village-lookback | 0.58 | 0.467 | 0.252 | (35.346, -87.141) |

## 시뮬 재사용 경로

1. `src/player/controllers/raycast.ts`의 `createRaycastController`와 `src/scene/terrain/heightmap.ts`의 `sampleGround`를 직접 실행한다.
2. `Controller.tsx`와 같은 순서로 hero 원 충돌(`heroTree.ts`) 뒤 village 박스 충돌(`village.ts`)을 합성한다.
3. `src/systems/bench/finalRoute.ts`의 `finalInputAt`을 매 1/60초 적용한다. 이는 `Docs/qa/m2-route.csv`의 M2-31 Node 결정론 시뮬 방법과 같다.

## 변경과 남은 확인

- routeHash `6ad0996f1aff` → `a9f1339c4187`; waypoint 시간 `[0, 5, 10, 17, 24, 30, 37, 40.2, 50, 65, 75]`은 유지했다.
- 관통·낙하 회귀는 실제 충돌 resolver·heightmap을 통과하는 Node 시뮬 구조로 방지했다.
- 브라우저 실주행 재확인은 worker-claude R72-A에서 수행한다.
