#!/usr/bin/env bash
set -Eeuo pipefail

password_file=/data/control/opencode-server-password
if [[ ! -r "$password_file" ]]; then
  echo "OpenCode Computer server credential is unavailable." >&2
  exit 1
fi

OPENCODE_SERVER_PASSWORD="$(<"$password_file")"
if [[ -z "$OPENCODE_SERVER_PASSWORD" ]]; then
  echo "OpenCode Computer server credential is empty." >&2
  exit 1
fi
export OPENCODE_SERVER_PASSWORD
export OPENCODE_SERVER_USERNAME=opencode

exec /usr/local/bin/opencode attach \
  "http://127.0.0.1:4096" \
  --dir "${WORKSPACE_ROOT:-/data/workspace}" \
  "$@"
