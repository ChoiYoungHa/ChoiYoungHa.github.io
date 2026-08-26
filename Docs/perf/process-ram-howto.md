# M4 프로세스 RAM 수동 측정

## 30초 측정 절차

1. 측정할 Web3D 창을 띄운 채 `Ctrl+Shift+Esc`로 Windows 작업 관리자를 열고 **세부 정보** 탭으로 이동한다.
2. 창 제목으로 측정 대상 Chrome을 식별한 뒤 해당 Chrome 프로세스 트리의 **작업 집합(메모리)** 값을 모두 더하고, 합계를 GB로 환산한다(`합계 MB ÷ 1024`).
3. `m4-process-ram.csv`에 측정 시각·창 제목·build hash·backend·합계 GB를 3회 기록하고, 세 값의 중앙값이 `≤24GB`인지 판정한다.

## 기록 규칙

- 다른 Chrome 창과 확장 프로그램 프로세스가 섞이지 않도록 측정 대상 창 제목을 CSV에 그대로 남긴다.
- 세 번 모두 같은 actual build와 preset/동선을 사용한다. backend가 다르면 note에 이유를 적고 동일 조건 3회를 다시 확보한다.
- `process_tree_working_set_gb`는 소수 둘째 자리까지 기록하고, 정렬한 세 값 중 가운데 값을 중앙값으로 쓴다. 누락은 PASS가 아니다.

이 수동 측정 1세트는 헤드리스 측정에서 프로세스 RAM을 얻지 못해 보류된 M0b·M1·M2 GATE의 동일 증거 공백을 함께 보완한다. M4 최종 판정에는 M4 actual build로 별도 3회를 기록해야 한다.
