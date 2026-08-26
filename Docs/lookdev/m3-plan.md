# M3 룩디브 튜닝 계획 — R24-A 수치 진단 기반 (R26-A, 2026-08-26)

> 목적: `measure.mjs` 가 낸 숫자로 **무엇을, 어떤 순서로, 얼마나** 돌릴지 고정한다. 취향이 아니라 L1~L5 판정으로 채택한다(계획서 §6-4).
> 전제: 이 문서 작성 시점에 GPU 측정(M2-GATE)이 진행 중이라 **아무것도 연결·실행하지 않았다.** 값은 코드 실측 + Node 시뮬레이션이다.

## 0. 진단 요약 (Docs/lookdev/m2-vista{1,2,3}-metrics.json, low 720p, HEAD 481db4e 이전 캡처)

| 지표 | 목표(lookdev-targets) | vista1 | vista2 | vista3 | 판정 |
|---|---|---|---|---|---|
| L1 근경 채도 % | 30~36 | 11.8 | 12.2 | 12.2 | ✗ **너무 탈색** |
| L1 원경 채도 % | 8~12 | 13.8 | 8.8 | 2.9 | vista2만 ✓ |
| L2 근경 hue ° | 45~55 | 52.1 | 52.6 | 52.9 | ✓ (팔레트 hue 는 맞다) |
| L2 원경 hue ° | 205~215 | 234.1 | 214.8 | 218.7 | vista2만 ✓ |
| L3 근경 휘도 | 60~75 | 141.3 | 139.7 | 138.2 | ✗ **2배 밝다** |
| L3 원경 휘도 | 130~145 | 147.0 | 176.6 | 201.7 | ✗ 하늘이 밝다 |
| L5 전역 채도 중앙값 % | ≤22 | 9.5 | 8.4 | 8.7 | ✓ (이미 낮다 — 여유 12p) |
| PASS 수(자동 4) | | 1 | 2 | 1 | |

→ 결론: **문제는 색상이 아니라 노출과 채도다.** 근경이 목표보다 2배 밝고 채도는 1/3이다. 하늘(원경 밴드 2)은 147~202 로 목표 상단(145)을 넘는다. 대기원근(TSL B/C/D)은 원경을 **근경보다** 탈색·밝게 만드는 장치라, 근경이 먼저 목표에 들어와야 의미가 있다(§3 시뮬).

## 1. 현재 코드 실측값 (읽기만, 2026-08-26 HEAD 481db4e)

> **R30-A 정정**: 톤매퍼 행의 "NoToneMapping" 은 틀렸다. R3F `<Canvas>` 가 gl 생성 뒤 기본 **ACESFilmic** 을 주입하므로 M2 까지의 실제 톤매퍼는 ACES 였다(노출 1.0 에서 AgX 와 baseline 이 거의 같았던 이유). 그래서 M3 는 `flat` + `onCreated(applyToneMapping)` 으로 넘겼다. 결과는 `l1-l5-decision.json`.

| 손잡이 | 현재값 | 어디서 | 비고 |
|---|---|---|---|
| `renderer.toneMapping` | **NoToneMapping(0)** — 설정 코드 없음 | three r185 `Renderer.js` L192 기본값. `gl/createRenderer.ts` 는 안 만짐 | lookdev.json 은 AgX(6) 시작 예정 |
| `renderer.toneMappingExposure` | **1.0** | `Renderer.js` L200 기본값 | lookdev.json 튜닝 범위 0.85~1.25 |
| `renderer.outputColorSpace` | sRGB | `Renderer.js` L184 기본값 | |
| `scene.environment` | HDR `/env/sky_1k.hdr` (RGBELoader, 1024×512) | `SkyDome.tsx` `applySkyTexture` | **IBL 이 주광**이다 |
| `scene.environmentIntensity` | **1** | `Scene.js` L95 기본값, 미설정 | 근경 휘도 손잡이 ① |
| `scene.background` | 같은 HDR | `SkyDome.tsx` | |
| `scene.backgroundIntensity` | **1** | `Scene.js` L77 기본값, 미설정 | 하늘 휘도 손잡이 |
| 재질 `envMapIntensity` | **1** (7곳 전부 기본값) | Terrain/MainPath/HeroTree/Foliage/Rock/Village/Controller | |
| DirectionalLight | intensity **1**, pos (48.4, 14.6, -48.4), shadow 1024² / 80m | `Lighting.tsx` | elevation ≈ 12°(atan(14.6/68.4)=12.05°), azimuth 는 M3-09 |
| AmbientLight | **0.35** | `Prototype.tsx` (HDR 로드 실패 보험) | HDR 이 뜨면 이중 환경광 |
| Fog | `FogExp2 #8FA0B0`, density **low 0.0080 / base 0.0055** | `Atmosphere.tsx` + `quality-presets.json` | = M3-05A 값과 이미 일치 |
| 지붕색 | `#704B38` HSL(20°, 33%, 33%) | `village/houseGeometry.ts` VILLAGE_COLORS.roof | 계획서 §6-2 `#7A4A32`(41%) 과 다름 — 채도 상한 30~38 안 |
| 초원 | `#4B4A33` | `Terrain.tsx` | §6-2 와 일치 |
| 길 | `#6B6653` | `MainPath.tsx` | |
| 식생 | Kenney GLB 정점색(청록 #00FFD0 계열, R21 보고) | `Foliage.tsx` | §6-2 `#3B3E26` 과 불일치 |

## 2. 손잡이별 예상 효과 (측정 정의: sRGB 8bit 캡처를 measure.mjs 가 잰다)

| 손잡이 | 움직이는 지표 | 방향 | 예상 크기 |
|---|---|---|---|
| ① `toneMapping = AgX` + `toneMappingExposure` | 근경 휘도(L3 near)·하늘 휘도(L3 far) **동시** | 노출↓ → 둘 다↓ | 근경 140→60~75 는 **약 −1.0 EV**(sRGB 감마 감안 exposure ≈0.45~0.55). 하늘도 같이 내려가 200→~130 |
| ① `scene.environmentIntensity` | 근경 휘도만(하늘 제외) | ↓ | IBL 이 주광이므로 exposure 와 거의 같은 효과, 하늘은 그대로 |
| ① `scene.backgroundIntensity` | 하늘 휘도만 | ↓ | 원경 밴드 2 의 대부분이 하늘 → L3 far 직접 제어 |
| ① AmbientLight 0.35 제거/감소 | 근경 휘도·그림자 대비(L4) | ↓ | 이중 환경광 해소. HDR 실패 폴백은 조건부로 |
| ② Fog density / 색 | 원경 채도·hue·휘도 | 밀도↑ → 원경이 안개색(210°, 18%, L 62%)으로 수렴 | 원경 hue 234→210, 채도 13.8→~10. 근경엔 영향 작음(40m 이내 e^(-0.008·40)=0.73 이라 이미 27% 섞임 → 근경 탈색의 원인 후보) |
| ③ TSL B/C/D (`depthGradeOutput`) | 원경 채도·hue·휘도의 **거리 함수** | 근경 유지, 원경만 이동 | §3 시뮬 참조. 근경이 목표에 든 뒤에만 의미 |
| ④ 재질 채도(지형·길·지붕·식생) | 근경 채도(L1 near) | 초원 `#4B4A33`(18%)→근경 28% 까지 허용(§6-2), 식생 `#3B3E26`, 지붕 `#7A4A32` | 근경 12%→30~36% 는 **재질 채도 + 노출**로만 올라간다. 대기 노드는 채도를 올리지 못한다 |

## 3. TSL B/C/D 근경→원경 시뮬레이션 (`Automation/test-depth-grade.mjs`, 12/12)

입력 = 목표 이미지 근경 통합색 `#4A4325`(33.3% / 48.6° / luma 66.3), 거리 260m(depthFactor 1).

| 파라미터 | 원경 S % | 원경 H ° | 원경 luma | L1 | L2 | L3 |
|---|---|---|---|---|---|---|
| §6-2 기본 (satFar 0.25 · hueStrength 0.85 · lumaGain 0.35) | 8.3 | 185.8 | 148.8 | ✓ | ✗ | ✗ |
| **후보 1** hueStrength **0.97** · lumaGain 0.35 · satFar 0.25 | 8.3 | 205.2 | 144.5 | ✓ | ✓ | ✓ |
| 후보 2 hueStrength 0.97 · lumaGain **0.34** · satFar 0.25 | 8.3 | 205.2 | 142.0 | ✓ | ✓ | ✓ |
| 후보 3 hueStrength **0.98** · lumaGain 0.35 · satFar 0.25 | 8.3 | 206.8 | 144.2 | ✓ | ✓ | ✓ |

- `hueStrength 0.85` 는 근경 hue 48° 기준으로 원경 186° 에 멈춘다 — **0.97~0.98 이어야 205° 를 넘는다.** 계획서 §6-2 의 0.85 는 근경 hue 가 더 높을 때(≈80°) 맞는 값이다. 정정 후보로 보고.
- `lumaGain 0.35` 는 sRGB 기준 luma 149 로 상단(145)을 살짝 넘는다. 0.34 가 안전.
- 현재 씬 근경(평균색 `#908D76`, S 10.5%)에는 어떤 파라미터를 걸어도 원경 S 2.6% — **근경 채도가 먼저다**(§0 결론 재확인).
- 주의: 시뮬은 sRGB 값에 직접 걸었다. 실제 노드는 `output`(선형, pre-tonemap)에 걸리므로 톤매퍼를 지나면 수치가 달라진다. 후보는 **출발값**이고 최종값은 measure.mjs 로 잡는다.

## 4. 적용 순서 (각 단계 = 코드 1~2곳 변경 → 캡처 3장 → measure → 표 갱신)

> 측정 명령(캡처는 R22-A `capture-run.sh` 방식: probe-server + `?shot=<vista>&q=low&report=<name>`; GPU 는 M2-GATE 종료 후에만):
> ```
> npm run build
> # vista-start / vista-mid / vista-village 3장 → Docs/lookdev/m3-<단계>-vista{1,2,3}.png
> node Automation/measure.mjs Docs/lookdev/m3-<단계>-vista1.png --targets src/data/lookdev-targets.json --out Docs/lookdev/m3-<단계>-vista1-metrics.json   # ×3
> ```
> 채택 규칙: 3 vista 합계 PASS 수가 직전 단계보다 **줄지 않고** L5 가 유지되면 채택. 줄면 되돌린다.

| 단계 | 변경 | 파일 | 목표 지표 | 완료 판정 |
|---|---|---|---|---|
| **0 baseline** | 없음 (M3-01 재캡처) | — | — | `Docs/lookdev/m3-before-[1-3].png` + metrics |
| **① 노출·환경광** | `toneMapping = AgXToneMapping`, `toneMappingExposure` **0.5 → 0.45/0.55 로 2회 더**; `scene.backgroundIntensity` 는 exposure 로 하늘이 130~145 에 안 들면 별도 0.7~0.85; `Prototype.tsx` ambient 0.35 → HDR 로드 성공 시 0 | `gl/createRenderer.ts`, `SkyDome.tsx`(background/environmentIntensity), `Prototype.tsx` | **L3 near 140→60~75, L3 far →130~145** | 3 vista 모두 L3 near ✓ |
| **② 안개** | density low 0.0080 유지하되 40m 이내 근경 탈색이 확인되면 0.0065 로; 색 `#8FA0B0` 유지 | `quality-presets.json` | L2 far 234→205~215(vista1), 근경 채도 손실 회복 | vista1 L2 ✓ |
| **③ TSL B/C/D** | `MeshStandardNodeMaterial` 로 7곳 교체 + `material.outputNode = depthGradeOutput({ …후보 1 })`; on/off 는 `?atmo=0` 쿼리 | `Atmosphere.tsx`(노드 팩토리 export), 재질 7곳 | L1 far 8~12, L2 far, L3 far 를 **거리 함수**로 | M3-05B/C/D 완료 조건 JSON + WebGPU/WebGL2 스모크(E/F) |
| **④ 팔레트** | 초원 근경 채도 18→24~28%(정점색 또는 재질 color), 식생 `#3B3E26`, 지붕 `#7A4A32` | Terrain/Foliage(codex)/houseGeometry(codex) | **L1 near 12→30~36** | 3 vista L1 near ✓, L5 ≤22 유지 |
| ⑤ 톤매퍼 비교 | 같은 프레임을 AgX/ACES/Neutral 로 3장 → L5 중앙값 비교 후 확정(계획서 §6-2) | `createRenderer.ts` | L5 | 표 1개 |

- ①→④ 순서인 이유: 노출이 바뀌면 채도(sRGB HSL S)도 같이 바뀌어 ④의 목표값이 흔들린다. 밝기를 먼저 고정한다. ③은 원경 전용이라 근경(①·④)이 잡힌 뒤에 넣어야 판정이 섞이지 않는다.
- ③ 연결 전 확인: `output` 노드 = 조명+안개 후 선형 색(NodeMaterial.js L537~547 실측). 알파 보존. WebGL2 는 같은 TSL 이 GLSL 로 컴파일되므로 별도 폴백 불필요 — 단 `?gl=webgl` 스모크(M3-05F)에서 shader error 0 을 실측할 것.
- 위험: ①에서 exposure 를 내리면 그림자 영역이 검게 눌려 L4(실루엣)는 좋아지지만 지붕 액센트 채도가 sRGB 에서 떨어질 수 있다 → ④에서 지붕을 마지막에 보정.

## 5. 산출·연결 대기 파일

| 파일 | 상태 |
|---|---|
| `src/scene/atmosphere/depthGradeMath.ts` | 순수 참조 구현. **어디서도 import 안 함**(`rg "atmosphere/" src` 0건) |
| `src/scene/atmosphere/depthGradeNode.ts` | TSL `makeDepthGrade(params)` / `depthGradeOutput(params)` / `depthFactorNode`. `npx tsc -b` 0. import 0 → 빌드 결과 불변 |
| `Automation/test-depth-grade.mjs` | 12/12 (`node --test` 개별) |
