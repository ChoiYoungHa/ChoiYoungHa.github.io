#!/usr/bin/env bash
# 2026-08-28 (master) — GitHub Pages 배포: VITE_GAME=1 실빌드 → dist 를 gh-pages 브랜치(orphan)로 푸시.
# main 푸시는 .github/workflows/pages.yml 이 자동 배포한다. 이 스크립트는 수동·비상용(gh-pages 직접 푸시).
# 주의: Actions 배포(source=Actions)로 전환한 뒤엔 gh-pages 브랜치 푸시가 아니라 workflow_dispatch 를 쓴다.
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=${REMOTE:-origin}
VITE_GAME=1 npm run build
touch dist/.nojekyll
WT="$(mktemp -d)/gh-pages"
git worktree add --detach "$WT" >/dev/null
( cd "$WT" && git checkout --orphan gh-pages >/dev/null 2>&1 && git rm -rfq . && cp -r "$OLDPWD/dist/." . && git add -A && git -c user.name=master -c user.email=noreply@wnytech.co.kr commit -qm "deploy $(git -C "$OLDPWD" rev-parse --short HEAD)" && git push -f "$REMOTE" gh-pages:gh-pages )
git worktree remove --force "$WT"
git branch -D gh-pages >/dev/null 2>&1 || true
echo "deployed $(git rev-parse --short HEAD) → $REMOTE gh-pages"
