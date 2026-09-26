#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
node scripts/start-local.cjs
