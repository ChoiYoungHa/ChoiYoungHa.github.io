# M3 S3 방위 가중 haze 설계 (R51-B)

## 목표와 입력 근거

- 문제 지표: `Docs/lookdev/m3-after-3-metrics.json`의 S3 far luma는 **166.4**, 목표 상한은 **145**다.
- 고정값: `src/data/lookdev.json`의 `backgroundIntensity=1.75`, `environmentIntensity=1.0`, `hazeMix=0.4`는 바꾸지 않는다.
- S1 시선 벡터는 `(20, -36)`, S3 시선 벡터는 `(-36.3, 99.3)`이다(`src/data/vistas.json`).
- yaw 규약은 `atan2(forward.x, forward.z)`이며 S1은 `150.9454°`, S3은 `-20.0803°`다.

## 방위 함수와 동결 데이터

`src/scene/sky/hazeDirection.ts`의 raised half-cosine을 사용한다.

```text
lobe(theta) = max(0, cos(theta - brightYawDeg))
hazeMixDir(theta) = min(1, hazeMix * (1 + gain * lobe(theta)))
attenuation(theta) = min(maxAttenuation, maxAttenuation * gain * lobe(theta))
```

`lookdev.json`의 기본 후보는 다음과 같다.

| 키 | 값 | 근거 |
|---|---:|---|
| `enabled` | `false` | 기존 M3 GATE 재현성 보존 |
| `brightYawDeg` | `-20.0803` | S3 position→target 시선의 실측 yaw |
| `gain` | `0.86` | 15% 감쇠 상한에서 필요한 12.86%에 가장 가까운 2자리 후보 |
| `maxAttenuation` | `0.15` | 방향 감쇠 안전 상한 |

S1과 밝은 방위의 각 차이는 `171.0257°`라 cosine이 음수이고 lobe는 정확히 0이다. 따라서 S1은 `hazeMix=0.4`, 감쇠 0으로 유지된다. S3은 bright yaw와 일치해 lobe가 1이다.

## 휘도 보존 tint와 추가 감쇠가 필요한 이유

기존 `SkyDome`은 `tinted = haze * luminance(sky) / luminance(haze)`를 사용한다. 따라서 `luminance(tinted) = luminance(sky)`이고 haze 혼합률만 높이면 선형 휘도는 보존된다. R51-B의 목표를 실제로 움직이기 위해 coordinator 승인에 따라 opt-in 경로에만 방향성 `luminanceScale = 1 - attenuation`을 함께 적용했다. 안개색 `#8FA0B0` 자체는 바꾸지 않아 계획서 §6-2 E의 상수색 규칙을 유지한다.

## gain 후보와 예상값

화면 luma가 감쇠율에 1차 비례한다는 튜닝용 근사에서 필요한 감쇠율은 다음과 같다.

```text
required = 1 - 145 / 166.4 = 0.128606 (12.86%)
```

| 후보 gain | S3 hazeMix | S3 감쇠 | 예상 S3 luma |
|---:|---:|---:|---:|
| `0.86` | `0.744` | `0.129` | `166.4 × 0.871 = 144.9344` |
| `1.00` | `0.800` | `0.150` | `166.4 × 0.850 = 141.4400` |

Neutral tone mapping은 비선형이므로 위 값은 캡처 후보 선택용 예상치이지 GATE 실측을 대체하지 않는다. 우선 `gain=0.86`으로 과감쇠를 피하고, 145를 넘으면 `gain=1.00`을 재검증한다.

## 기본 off 불변성과 프로그램 수

- 기본 `enabled=false`에서는 `hazeDirectionEnabled` uniform이 0이어서 파생값이 `hazeWeight=1`, `luminanceScale=1`이다. 고정 `hazeMix=0.4`에서 새 출력은 `mix(sky,tinted,clamp(0.4×1,0,1))×1`이므로 기존 `mix(sky,tinted,0.4)`와 동일하다.
- `?hazeDir=1`은 같은 background node 그래프의 uniform 값만 갱신하며 재질·shader define·프로그램 분기를 추가하지 않는다. 따라서 프로그램 변형 수 증가는 0으로 예상한다.
- IBL `scene.environment`, exposure, background/environment intensity는 이 옵션의 영향을 받지 않는다.

## GATE 후 캡처 확정 절차

1. S1·S3을 기본 URL과 `?hazeDir=1` URL에서 같은 HEAD·프리셋·카메라로 각각 캡처한다.
2. 기존 measure 도구로 S1/S3 far luma를 재고, S1 130~145 유지와 S3 ≤145를 함께 확인한다.
3. S3가 초과하면 gain 1.00 후보를 적용해 재캡처하고, 프로그램 수·shader/console error 0도 함께 기록한다.
