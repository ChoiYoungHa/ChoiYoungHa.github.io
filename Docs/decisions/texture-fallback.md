# M4-09E 텍스처 WebP 폴백 조사

- 조사일: 2026-08-26
- 조사 기준 HEAD: 시작 `772e852`, 병행 통합 후 재확인 `0cadad6`
- 범위: 설치·변환 없이 로컬 CLI/Pillow 가용성과 현재 변환 대상만 조사
- KTX2 선행 상태: `Docs/decisions/toktx.md`의 `toktx --version` exit `1`(CommandNotFound). 이는 **변환 실행 실패 로그가 아니라 도구 가용성 실패 로그**다.

## 변환기 실측

| 명령 | exit | 버전/출력 | 판정 |
|---|---:|---|---|
| `magick -version` | `1` | 버전 없음. `magick : The term 'magick' is not recognized as the name of a cmdlet, function, script file, or operable program.` | 사용 불가 |
| `cwebp -version` | `1` | 버전 없음. `cwebp : The term 'cwebp' is not recognized as the name of a cmdlet, function, script file, or operable program.` | 사용 불가 |
| `ffmpeg -version` | `1` | 버전 없음. `ffmpeg : The term 'ffmpeg' is not recognized as the name of a cmdlet, function, script file, or operable program.` | 사용 불가 |
| `python -c "import PIL;print(PIL.__version__)"` | `9009` | 원문 출력 `Python `, 버전 확인 불가. PowerShell이 `C:\Users\USER\AppData\Local\Microsoft\WindowsApps\python.exe`를 먼저 선택한다. | 명령 그대로는 사용 불가 |
| `C:\Users\USER\AppData\Local\Programs\Python\Python312\python.exe -c "import PIL;print(PIL.__version__)"` | `0` | `12.3.0` | Pillow 사용 가능 |

Pillow 기능 실측은 `HDR_READ=None`, `WEBP_WRITE=WEBP`, `webp_feature=True`, exit `0`이었다. 실제 `Image.open('public/env/sky_1k.hdr')` 읽기 전용 확인도 exit `1`, `PIL.UnidentifiedImageError: cannot identify image file 'public/env/sky_1k.hdr'`였다. 따라서 설치된 Pillow 12.3.0은 WebP 출력은 가능하지만 현재 원본인 Radiance HDR을 읽지 못한다.

## 설치된 도구로 가능한 명령(기록만)

PNG/JPEG처럼 Pillow가 읽을 수 있는 향후 승인 텍스처에는 아래 무손실 WebP 명령을 쓸 수 있다. 이 조사에서는 실행하지 않았다.

```powershell
& 'C:\Users\USER\AppData\Local\Programs\Python\Python312\python.exe' -c "from PIL import Image; im=Image.open(r'<input.png>'); im.save(r'<output.webp>', 'WEBP', lossless=True, method=6)"
```

현재 `sky_1k.hdr`에는 이 명령을 적용할 수 없다. HDR 입력을 읽을 수 있는 ImageMagick·ffmpeg가 없으므로, 설치 없이 바로 실행 가능한 HDR→WebP 명령은 확보하지 못했다.

## 변환 대상 실측

`src/data/assets.csv`는 헤더 제외 14행이다. `texture_res=none`이 13행이고, 텍스처를 가진 행은 아래 1행뿐이다.

| asset_id | 원본 | 해상도 | before bytes | 설치 도구 호환 |
|---|---|---:|---:|---|
| `asset.env.sky.hdri.a` | `public/env/sky_1k.hdr` | 1024×512 | 1,428,760 | Pillow HDR 읽기 미지원 |

`public/`의 파일 7개를 전수 확인했다. 런타임 이미지성 파일은 HDR 1개와 UI SVG 2개이며, GLB 2개는 자산 대장에서 모두 `texture=none`/vertex color로 기록되어 있다. PNG/JPEG/WebP/KTX2 파일은 0개다.

**변환 대상 1개**: `public/env/sky_1k.hdr`. 다만 현 설치 도구로 즉시 변환 가능한 대상은 0개이며, WebP after 파일과 after bytes도 0개다.

## M4-09E 판정

- KTX2 실제 변환 실패 로그: 없음(`toktx` 자체 부재만 확인)
- WebP before bytes: 1개, 1,428,760B
- WebP after bytes: 없음
- 변환 실행·설치 시도: 없음
- 로드맵 M4-09E: **미체크 유지**

완료 조건인 “KTX2 실패 로그와 WebP before/after bytes 존재”를 충족하지 못했다. M4-09D 변환 실행 또는 신규 도구 설치 여부는 master/영하님 결정 범위다.
