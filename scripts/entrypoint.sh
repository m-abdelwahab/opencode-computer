#!/usr/bin/env bash
set -Eeuo pipefail

/usr/bin/sudo /usr/local/sbin/opencode-computer-bootstrap

for path in \
  /data/home/.cache \
  /data/home/.cache/opencode \
  /data/home/.config \
  /data/home/.config/opencode \
  /data/home/.local \
  /data/home/.local/bin \
  /data/home/.local/share \
  /data/home/.local/share/opencode \
  /data/home/.local/state \
  /data/home/.local/state/opencode \
  /data/home/.railway; do
  if [[ -L "$path" ]] || { [[ -e "$path" ]] && [[ ! -d "$path" ]]; }; then
    echo "Invalid persistent home directory: $path" >&2
    exit 1
  fi
  /usr/bin/mkdir -p "$path"
  /usr/bin/chmod 0700 "$path"
done

skills_link=/data/home/.config/opencode/skills
if [[ -L "$skills_link" ]]; then
  if [[ "$(/usr/bin/readlink "$skills_link")" != "/data/skills" ]]; then
    echo "Invalid OpenCode skills link." >&2
    exit 1
  fi
elif [[ -e "$skills_link" ]]; then
  echo "$skills_link must be a link to /data/skills." >&2
  exit 1
else
  /usr/bin/ln -s /data/skills "$skills_link"
fi

password_file=/data/control/opencode-server-password
OPENCODE_SERVER_PASSWORD="$(<"$password_file")"
if [[ -z "$OPENCODE_SERVER_PASSWORD" ]]; then
  echo "OpenCode Computer server credential is empty." >&2
  exit 1
fi
export OPENCODE_SERVER_PASSWORD
export OPENCODE_SERVER_USERNAME=opencode

cd "${WORKSPACE_ROOT:-/data/workspace}"

/usr/local/bin/opencode serve \
  --hostname 127.0.0.1 \
  --port 4096 &
opencode_pid=$!

/usr/bin/sudo --preserve-env=PORT,AGENTD_CONTROL_PORT,AGENT_COMPUTER_ID,OPENCODE_CLI_VERSION,RAILWAY_CLI_VERSION \
  /usr/local/sbin/opencode-computer-run &
agentd_pid=$!

shutdown() {
  trap - INT TERM
  kill -TERM "$opencode_pid" "$agentd_pid" 2>/dev/null || true
  wait "$opencode_pid" "$agentd_pid" 2>/dev/null || true
  exit 0
}

trap shutdown INT TERM

set +e
wait -n -p exited_pid "$opencode_pid" "$agentd_pid"
status=$?
set -e

kill -TERM "$opencode_pid" "$agentd_pid" 2>/dev/null || true
wait "$opencode_pid" "$agentd_pid" 2>/dev/null || true

echo "OpenCode Computer process $exited_pid exited unexpectedly with status $status." >&2
if [[ "$status" -eq 0 ]]; then
  exit 1
fi
exit "$status"
