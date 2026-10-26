#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

check_only=0
if [ "${1:-}" = '--check' ]; then check_only=1; shift; fi
if [ "$#" -gt 1 ]; then echo '사용법: bash deploy.sh [--check] [새-저장소-이름]'; exit 1; fi
repo_name="${1:-yeosu-suncheon-trip}"
if [[ ! "$repo_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]]; then
  echo '저장소 이름에는 영문, 숫자, 점, 밑줄, 하이픈을 사용하세요.'; exit 1
fi
for tool in python3 node; do
  command -v "$tool" >/dev/null || { echo "$tool 설치가 필요합니다."; exit 1; }
done
python3 build.py
for test in test-engine.js test-ui.js test-responsive.js test-gestures.js test-playback.js test-timeline.js; do
  node "$test"
done
python3 test-build.py
if [ "$check_only" -eq 1 ]; then echo '빌드·자동 검사 완료. GitHub에는 게시하지 않았습니다.'; exit 0; fi

for tool in git gh curl; do
  command -v "$tool" >/dev/null || { echo "$tool 설치가 필요합니다. GitHub CLI: brew install gh"; exit 1; }
done
gh auth status --hostname github.com >/dev/null 2>&1 || gh auth login --hostname github.com --web --git-protocol https
owner=$(gh api user --jq .login)
if [ "$owner" != 'llouis0622' ]; then
  echo "llouis0622 계정으로 로그인해 주세요. 현재 계정: $owner"; exit 1
fi
repo="$owner/$repo_name"
if [ ! -e .git ]; then git init -b main; fi
if [ "$(git rev-parse --show-toplevel)" != "$(pwd -P)" ]; then
  echo '압축을 푼 프로젝트 폴더 안에서 실행해 주세요.'; exit 1
fi
if [ "$(git branch --show-current)" != main ]; then
  echo '현재 브랜치가 main이 아닙니다. 작업을 보존하고 main에서 다시 실행하세요.'; exit 1
fi
remote=$(git remote get-url origin 2>/dev/null || true)
if [ -n "$remote" ]; then
  case "$remote" in
    "https://github.com/$repo"|"https://github.com/$repo.git"|"git@github.com:$repo.git") ;;
    *) echo "예상한 저장소는 $repo 입니다. 다른 origin이 연결되어 있어 중단합니다: $remote"; exit 1;;
  esac
elif gh repo view "$repo" >/dev/null 2>&1; then
  echo "$repo 저장소가 이미 있습니다. 새 이름을 지정하세요: bash deploy.sh yeosu-suncheon-trip-2"; exit 1
fi
# 이 프로젝트의 소스와 빌드 결과만 커밋합니다.
git add .gitignore README.md QA.md deploy.sh publish.sh build.py ui.css ui.js engine.js data.json map-fragment.html dist/index.html dist/.nojekyll test-*.js test-build.py test-browser.html
if ! git diff --cached --quiet; then
  git -c user.name="$owner" -c user.email="$owner@users.noreply.github.com" commit -m 'Enable ten-minute timeline drag and resize'
fi
if [ -z "$remote" ]; then
  gh repo create "$repo" --public --source=. --remote=origin --description '2026년 11월 28–30일 여수·순천 여행 지도와 일정 편집기'
fi
gh auth setup-git
git push -u origin main
# git-subtree 확장이나 전역 Git 작성자 설정 없이 정적 파일을 게시합니다.
# 현재 gh-pages를 부모로 이어서 게시하며 강제 푸시는 하지 않습니다.
pages_tree=$(git rev-parse 'main:dist')
pages_parent=''
if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch origin gh-pages
  pages_parent=$(git rev-parse FETCH_HEAD)
fi
if [ -n "$pages_parent" ] && [ "$(git rev-parse "$pages_parent^{tree}")" = "$pages_tree" ]; then
  pages_commit=$pages_parent
else
  parent_args=()
  if [ -n "$pages_parent" ]; then parent_args=(-p "$pages_parent"); fi
  pages_commit=$(git -c user.name="$owner" -c user.email="$owner@users.noreply.github.com" commit-tree "$pages_tree" "${parent_args[@]}" -m 'Deploy Yeosu and Suncheon travel planner')
fi
git push origin "$pages_commit:refs/heads/gh-pages"
if gh api "repos/$repo/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$repo/pages" -f 'source[branch]=gh-pages' -f 'source[path]=/' >/dev/null
else
  gh api --method POST "repos/$repo/pages" -f 'source[branch]=gh-pages' -f 'source[path]=/' >/dev/null
fi
url=$(gh api "repos/$repo/pages" --jq .html_url)
build_id=$(python3 -c 'import re; from pathlib import Path; print(re.search(r"name=\"app-build\" content=\"([^\"]+)\"", Path("dist/index.html").read_text()).group(1))')
page_file=$(mktemp)
trap 'rm -f "$page_file"' EXIT
echo "배포 요청 완료: $url"
echo '배포된 커밋과 실제 페이지 내용을 확인합니다. 첫 배포는 수 분 걸릴 수 있습니다.'
for attempt in {1..36}; do
  latest=$(gh api "repos/$repo/pages/builds/latest" --jq '[.status,.commit] | @tsv' 2>/dev/null || true)
  IFS=$'\t' read -r status deployed_commit <<< "$latest"
  if [ "$deployed_commit" = "$pages_commit" ]; then
    if [ "$status" = errored ]; then echo "Pages 빌드 실패: https://github.com/$repo/actions"; exit 1; fi
    if [ "$status" = built ] && curl --fail --silent --location --connect-timeout 10 --max-time 30 "$url?build=$build_id" -o "$page_file"; then
      if python3 - "$page_file" "$build_id" <<'PY'
import sys
from pathlib import Path
html = Path(sys.argv[1]).read_text()
sys.exit(0 if f'name="app-build" content="{sys.argv[2]}"' in html and '<title>여수-순천 여행</title>' in html else 1)
PY
      then
        echo "게시된 버전 확인 완료: $url"
        if [ "${TRIP_NO_OPEN:-0}" != 1 ] && command -v open >/dev/null; then open "$url" || true; fi
        exit 0
      fi
    fi
  fi
  sleep 10
done
echo "확인 시간이 초과됐습니다. 배포 상태: https://github.com/$repo/actions"
echo "사이트: $url"
echo '배포가 진행 중일 수 있습니다. Actions에서 완료 여부를 확인하세요.'
exit 2
