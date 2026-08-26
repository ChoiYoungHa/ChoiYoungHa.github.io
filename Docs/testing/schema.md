# 외부 테스터 세션 스키마

`sessions-template.csv`는 `계획서.md §7-6`의 18열 헤더만 담은 빈 템플릿이다. 실제 세션은 `sessions-YYYYMMDD.csv`에 한 사람당 한 행으로 기록한다.

| 열 | 허용값·형식 | 단위·기록 규칙 |
|---|---|---|
| `tester_id` | `T-YYYYMMDD-NN` | 익명 ID; 사람과의 대응표를 만들지 않는다 |
| `date` | `YYYY-MM-DD` | KST 세션 날짜 |
| `consent` | `yes` / `no` | 익명 항목 기록 동의 |
| `os` | OS 이름과 주 버전 | 단위 없음; 예: `Windows 11` |
| `browser` | `Chrome` / `Edge` / `Firefox` / `Safari` / `other` | 브라우저 이름 |
| `browser_version` | 버전 문자열 | 주 버전 이상 기록 |
| `gpu_string` | 페이지의 adapter·ANGLE 표시 문자열 | 원문 그대로; 이름·계정 등 개인정보를 덧붙이지 않는다 |
| `backend` | `WebGPU` / `WebGL2` | 페이지 자동 표시값 |
| `preset` | `low` / `base` | 실행 품질 프리셋 |
| `launched` | `yes` / `no` | 링크가 열리고 화면이 표시됐는지 |
| `ttfi_sec` | 0 이상 숫자 / `-` | 초; 첫 이동까지, 미실행이면 `-` |
| `reached_target` | `yes` / `no` | 거대 수목 도달 여부 |
| `time_to_target_sec` | 0 이상 숫자 / `-` | 초; 미도달이면 `-` |
| `help_count` | 0 이상 정수 | 조작·방향을 알려준 횟수 |
| `dropoff_point` | 짧은 위치 설명 / `-` | 미이탈이면 `-`; 한 줄 |
| `recall_one_line` | 유도하지 않은 한 문장 / `-` | 줄바꿈 없는 UTF-8 텍스트 |
| `wow_5sec` | `yes` / `no` | 첫 5초 목표 지향 발화 여부 |
| `notes` | 짧은 보충 / `-` | 한 줄; 개인정보 기록 금지 |

## 개인정보 검사

열 수는 18개이며 이름·연락처·계정·IP·화면 녹화 등 개인정보 열은 **0개**다. `tester_id`는 익명 ID만 허용하고 실제 인물과의 대응표를 만들지 않는다.
