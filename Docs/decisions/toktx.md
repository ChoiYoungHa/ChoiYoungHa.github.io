# M4-09A `toktx` 사용 가능성 확인

- 확인일: 2026-08-26
- 명령: `toktx --version`
- exit code: `1`
- 결과: **확인 불가 (FAIL, PASS 아님)**
- 설치 시도: 하지 않음

## 실패 메시지 원문

```text
toktx : The term 'toktx' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
At line:2 char:1
+ toktx --version
+ ~~~~~
    + CategoryInfo          : ObjectNotFound: (toktx:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
```

`toktx`가 PATH에서 발견되지 않아 버전 문자열을 확보하지 못했다. M4-09B KTX2 샘플 변환은 이 상태로 진행할 수 없으며, 설치 또는 M4-09E WebP 폴백 선택은 master가 결정한다.
