# M3-14 톤매퍼 3종 비교 (R30-A, 2026-08-26)

조건: 같은 빌드, 같은 vista 3곳(S1=vista-mid, S2=vista-start, S3=vista-village), low 720p, `?atmo=D&exposure=0.35&tonemap=<agx|neutral|aces>`. R3F `<Canvas>` 가 기본 ACES 를 덮어쓰는 문제를 `flat` + `onCreated(applyToneMapping)` 으로 고친 뒤 측정(그 전 3회는 전부 동일 결과 = 전부 ACES 였다). 이 비교는 팔레트·하늘 접합 전 상태이며 판정 지표(L5 전 화면 채도 중앙값 ≤22%)와 근경 채도(L1 30~36)를 같이 본다.

| 톤매퍼 | 샷 | 근경 채도 % | 근경 휘도 | 전역 채도 중앙값 % (L5 ≤22) |
|---|---|---|---|---|
| AgX | S2 (vista1) | 10.4 | 85 | 8.2 |
| AgX | S1 (vista2) | 10.6 | 84 | 5.9 |
| AgX | S3 (vista3) | 10.9 | 83 | 6.1 |
| Neutral | S2 (vista1) | 25.2 | 55 | 19.7 |
| Neutral | S1 (vista2) | 26.4 | 55 | 11.7 |
| Neutral | S3 (vista3) | 27.1 | 54 | 12.4 |
| ACESFilmic | S2 (vista1) | 14.3 | 68 | 11.1 |
| ACESFilmic | S1 (vista2) | 14.4 | 68 | 8.5 |
| ACESFilmic | S3 (vista3) | 14.8 | 66 | 8.7 |

## 판정
- 세 톤매퍼 모두 L5 ≤22% 를 만족한다(최대 Neutral S2 19.7%).
- **Neutral 채택.** AgX 는 근경 채도를 10% 로, ACES 는 14% 로 눌러 L1 근경 목표(30~36%)에서 멀어진다. Neutral 은 25~27% 로 채도를 보존해 팔레트 조정(초원 S19→30%)만으로 L1 근경 32~34% 에 도달했다(m3-after-*-metrics.json).
- 노출: Neutral 에서 0.35 는 근경 휘도 55 로 하한(60) 미달 → 0.44 로 확정(근경 66~67).
- 파일: `Docs/lookdev/m3-s3d035{agx,neutral,aces}-{1,2,3}.png` + `-metrics.json`. S1 = `-2`.

## 부수 발견
- 코드상 톤매퍼 설정이 없던 M2 까지의 실제 톤매퍼는 "없음" 이 아니라 **R3F 기본 ACESFilmic** 이었다(m3-plan.md §1 의 NoToneMapping 기재는 정정). 노출 1.0 에서 AgX 와 baseline 이 거의 같았던 이유.
