#!/usr/bin/env bash
# 2026-08-28 (master) — GitHub Pages 배포: VITE_GAME=1 실빌드 → dist 를 gh-pages 브랜치(orphan)로 푸시.
# Actions 워크플로(Docs/deploy/pages.workflow.yml)는 PAT 에 workflow 스코프가 생기면 .github/workflows/ 로 옮겨 자동화한다.
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
