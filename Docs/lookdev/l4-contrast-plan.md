# L4 3번째 체크(줄기 vs 수관) 대비 파라미터 계획 (R54-A, 2026-08-26)

> 목적: `Docs/qa/m3-l4-contrast.json` 의 S2 흑백 실측 **줄기 105.7 / 수관 100.6 / 하늘 147.4 → 줄기-수관 Δ5.1**(문턱 10 미달)을 색 파라미터로 해결할 준비. **기본 off** — 캡처 검증(GATE 후 GPU 세션) 전까지 화면은 현재와 비트 동일. 채택은 master.

## 1. 구현 (전부 `wt/claude`)

| 파일 | 내용 |
|---|---|
| `src/data/lookdev.json` | `heroContrast: { enabled:false, trunkLumaScale:1.0, canopyLumaScale:1.0 }` 키 추가만 |
| `src/scene/hero/heroTreeGeometry.ts` | `buildHeroTree(lod, seed, colors = DEFAULT_HERO_COLORS)` — 정점색만 파라미터, 지오메트리 수치·tris 불변. 순수 함수 `rgbToHsl`·`hslToRgb`·`scaleLightness`(HSL **L 만** 배율, hue·S 유지)·`heroContrastColors(cfg)`(off → `DEFAULT_HERO_COLORS` **동일 객체**) |
| `src/scene/HeroTree.tsx` | `readHeroContrast(location.search)` → `heroContrastColors` → `toGeometry(lod, colors)`. 쿼리 `?heroContrast=1`(on) / `?heroTrunk=0.75&heroCanopy=1.1`(배율 덮어쓰기, 부재는 lookdev 값 — `Number(null)===0` 함정 회피) |
| `Automation/test-hero-contrast.mjs` | 14/14 — off 비트 동일(LOD0·1 positions·normals·colors deepEqual), hue·S 유지, 후보 탐색 출력 |

**기본 off 불변 근거**: `heroContrastColors({enabled:false})` 는 새 객체를 만들지 않고 `DEFAULT_HERO_COLORS`(= `{trunk: TRUNK_COLOR, canopy: CANOPY_COLOR}` 기존 상수) 를 반환하고, `buildHeroTree` 는 그 색을 기존과 같은 `tube`/`ellipsoid` 호출에 넘긴다. 테스트가 `buildHeroTree(0)` 과 `buildHeroTree(0, undefined, heroContrastColors(lookdev.heroContrast))` 의 Float32Array 를 요소 단위로 비교해 동일함을 확인했다(LOD0 7,248 정점·LOD1 2,154 정점). programs 수 불변(재질 추가 없음, 정점색만).

## 2. 후보 계산

입력: 실측 흑백 휘도(줄기 105.7·수관 100.6·하늘 147.4). 화면 휘도 예측 모델 두 가지 —
- **gamma(보수적)**: 조명은 선형 곱, 화면은 sRGB → screen ∝ 배율^(1/2.2). 후보 선정 기준.
- linear: screen ∝ 배율(상한 추정).

수관 팔레트 규칙(`Docs/style-bible/palette.md`·§6-2): hue 68°·S 24%±6pp·**L 20%±6pp(≤26%)** → 수관 배율 ≤ **1.30**. 줄기는 규칙 없음(어둡게만).

| 수관 배율 | Δ≥10 되는 최소 줄기 배율 | 줄기 L | 수관 L | gamma Δ | linear Δ | 하늘 대비(줄기/수관, gamma) |
|---|---|---|---|---|---|---|
| 1.00 | 0.70 | 19.2% | 19.6% | 10.7 | 26.6 | 57.5 / 46.8 |
| 1.05 | 0.75 | 20.6% | 20.6% | 10.1 | 26.4 | 54.7 / 44.5 |
| **1.10** | **0.75** | 20.6% | 21.6% | **12.3** | 31.4 | 54.7 / 42.3 |
| **1.15** | **0.80** | 22.0% | 22.5% | **11.7** | 31.1 | 51.9 / 40.2 |
| 1.20 | 0.85 | 23.3% | 23.5% | 11.1 | 30.9 | 49.2 / 38.1 |
| 1.25 | 0.90 | 24.7% | 24.5% | 10.6 | 30.6 | 46.6 / 36.1 |
| 1.30 | 0.95 | 26.1% | 25.5% | 10.1 | 30.4 | 44.1 / 34.1 |

### 추천 2조합

| 후보 | `heroTrunk` | `heroCanopy` | 예상 Δ(gamma~linear) | 수관 HSL | 팔레트 |
|---|---|---|---|---|---|
| **K1** | **0.75** | **1.10** | 12.3 ~ 31.4 | 67.5° / 24.0% / 21.6% | ✓ (L +1.6pp) |
| **K2** | **0.80** | **1.15** | 11.7 ~ 31.1 | 67.5° / 24.0% / 22.5% | ✓ (L +2.5pp) |

- 두 후보 모두 하늘 대비 두 체크(≥20)는 여유 있게 유지되고(수관-하늘 40 이상), 줄기 hue 30°·S 28.6% 유지.
- 스펙 예시 **0.85 / 1.05** 는 gamma 모델에서 Δ **4.7**(linear 15.8)로 보수 기준 미달 — 실제 화면이 linear 쪽이면 통과할 수 있으나 후보에서 제외.
- 수관 L 상승은 L5(전역 채도 중앙값 20.5 ≤ 22)에 영향이 작아야 한다 — S 를 고정했으므로 HSL S 는 그대로이나 화면 픽셀 S 는 조명·톤매퍼로 달라질 수 있어 **캡처로 확인**(아래 3).

## 3. GATE 후 GPU 세션 검증 절차 (3줄)

```
1) 캡처: ?shot=vista-start&heroContrast=1&heroTrunk=0.75&heroCanopy=1.1  (+ 같은 URL&hideHero=1)  → Docs/lookdev/m3-l4k1-1.png / m3-l4k1-nohero-1.png, 흑백 변환 m3-l4k1-1-bw.png
2) node Automation/l4-contrast.mjs --color m3-l4k1-1.png --nohero m3-l4k1-nohero-1.png --bw m3-l4k1-1-bw.png --bbox 553,89,739,302 --out Docs/qa/m3-l4-contrast-k1.json   → 3쌍 Δ≥10 확인
3) node Automation/measure.mjs (S1 ?shot=vista-mid&heroContrast=1… · S2) → L1~L3·L5 가 l1-l5-decision.json 값과 같은 판정인지(특히 L5 ≤22) 확인. 통과하면 lookdev.json 의 배율을 그 값으로 바꾸고 enabled=true (master 결정)
```

K1 이 미달이면 K2 로 반복. 두 개 다 미달이면 예측 모델이 틀린 것 — 실측 Δ 와 예측 Δ 의 비율로 모델을 보정한 뒤 재계산(`test-hero-contrast.mjs` 의 `predict`).
