# M3 튜닝 스윕 기록 (R30-A, 2026-08-26)

공통: low 720p, 3장 = vista-start(S2)/vista-mid(S1)/vista-village(S3) 순서 `-1/-2/-3`. 모든 값은 같은 빌드에서 쿼리 스위치(`?exposure=&tonemap=&bgi=&envi=&skymix=&atmo=&gnear=&gfar=&gsat=&ghue=&glum=`)로 바꿨다(팔레트·하늘접합 코드 반영 시점: t1 부터). 측정 = `measure.mjs`. 최종 채택 = t9 = `Docs/lookdev/m3-after-*`.

| 태그 | 조건 / 결과 |
|---|---|
| s1e10 | atmo=A exposure=1.0 (AgX 의도, 실제 ACES: R3F 기본 덮어씀) |
| s1e055 | atmo=A exposure=0.55 (실제 ACES) |
| s1e045 | atmo=A exposure=0.45 (실제 ACES) |
| sky-bug | (첫 s1e* 3회는 bgi/envi=0 버그로 검은 화면 — 덮어씀) |
| s1e035agx/neutral/aces | atmo=A exposure=0.35 — flat 전이라 3종 동일(전부 ACES) |
| x0 | vista-mid atmo=A exposure=0.42 neutral bgi=1.15 |
| x1 | 같은 조건 atmo=D → x0 과 동일(원경 밴드=하늘) |
| x2 | atmo=D gnear=0 gfar=10 glum=.45 gsat=.1 ghue=1 (극단값: 오버라이드 동작 확인) |
| atmo0/A/B/D | vista-village exposure=0.42 neutral, 단계별 픽셀 차분 확인(A≠D 37k px) |
| n042b12 | atmo=D exposure=0.42 neutral bgi=1.2 (팔레트·하늘접합 전) 4/12 |
| t1 | 하늘접합 0.7·초원 #504B2B·길 #6F674A 적용 후, exposure=0.42 neutral bgi=1.0 gfar=160 → 7/12 |
| t2 | bgi=0.85 → 7/12 |
| t3 | bgi=1.15 gfar=120 glum=.4 gsat=.2 → 8/12 (bench programs 40, 1%low 20.3) |
| t4 | gfar=100 glum=.45 gsat=.15 → t3 과 동일(원경=하늘) |
| t5 | exposure=0.46 bgi=1.4 skymix=0.6 → 7/12 |
| t6 | exposure=0.44 bgi=1.45 skymix=0.6 → 7/12 |
| t7 | exposure=0.44 bgi=1.75 skymix=0.55 → 7/12 (S1 far Y 134) |
| t8 | bgi=2.0 skymix=0.5 → 7/12 |
| t9 | exposure=0.44 bgi=1.75 skymix=0.4 → 8/12, S1 4/4 ★채택 = after |
| t10 | skymix=0.45 → 8/12 |
| d1-bench | atmo=D exposure=0.35 첫 bench: calls 63 programs 40 1%low 18.7 |
| t3-bench | t3 설정: calls 57 programs 40 1%low 20.3 |
| l4nohero | vista-village hideHero → 수목 픽셀 0 (S3 는 마을 방향) |
