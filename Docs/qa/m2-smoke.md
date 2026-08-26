# M2-35 production smoke

- 측정일: 2026-08-26
- build hash: `9c86125`
- 조건: actual production build, 1280×720 `low`, WebGPU, `?route=bench`, 30초 워밍업

## Production build

- 명령: `npm run build`
- 결과: exit `0`
- M2-35 soak 실행 내부 재빌드: exit `0`, Vite build `720ms`
- 비치명 경고: Vite native config loader의 `__dirname` 호환 경고, 500kB 초과 chunk 경고

## 15분 걷기·대기

- 명령: `node Automation/run-bench.mjs --warmup 30 --soak 900 --soak-output Docs/qa/m2-15min.md`
- requested: `900s`
- elapsed: `915.4s`
- cycles: `14`
- crash: `0`
- TDR: `0`
- context-lost: `0`
- console/page errors: `0`
- 결과: **PASS**
- cleanup: port `4173` listener `0`

Chrome stderr에는 Google GCM 등록의 `DEPRECATED_ENDPOINT`가 반복됐으나 페이지 bench report의 error 카운터는 `0`이었다. 앱 console error가 아니라 Chrome 외부 서비스 등록 경고로 분리 기록한다.

`Docs/qa/m2-15min.md`의 제목 `M0b-25 15분 안정성`은 `run-bench.mjs`가 기존 호환을 위해 고정 출력하는 레거시 제목이다. 파일 경로, build hash `9c86125`, 측정일과 명령이 이번 M2-35 실행을 식별한다.
