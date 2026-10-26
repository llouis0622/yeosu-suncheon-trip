#!/usr/bin/env bash
# curl .../publish.sh | bash 로 실행합니다. 로그인 입력은 터미널에서 받습니다.
set -euo pipefail
repo='llouis0622/yeosu-suncheon-trip'
brew_bin=$(command -v brew || true)
if [ -z "$brew_bin" ]; then
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$candidate" ]; then brew_bin=$candidate; break; fi
  done
fi
if [ -n "$brew_bin" ]; then eval "$("$brew_bin" shellenv)"; fi
missing=()
for tool in git gh node python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    if [ "$tool" = python3 ]; then missing+=(python); else missing+=("$tool"); fi
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  if [ -z "$brew_bin" ]; then
    echo "필요한 도구가 없습니다: ${missing[*]}"
    echo 'Homebrew 설치 후 다시 실행하거나 Git, GitHub CLI, Node.js, Python 3를 설치하세요.'
    exit 1
  fi
  "$brew_bin" install "${missing[@]}"
fi
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  gh auth login --hostname github.com --web --git-protocol https < /dev/tty
fi
owner=$(gh api user --jq .login)
if [ "$owner" != llouis0622 ]; then
  echo "llouis0622 계정이 필요합니다. 현재 계정: $owner"
  echo 'gh auth switch --hostname github.com --user llouis0622'
  exit 1
fi
gh auth setup-git --hostname github.com
# 이전에 실패한 로컬 폴더나 다른 작업과 섞이지 않는 새 checkout을 사용합니다.
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/yeosu-suncheon-publish.XXXXXX")
echo "기존 GitHub 저장소의 최신 소스로 배포합니다: $repo"
git clone --branch main -- "https://github.com/$repo.git" "$work_dir/project"
cd "$work_dir/project"
bash deploy.sh
echo "완료 · 작업 복사본: $work_dir/project"
