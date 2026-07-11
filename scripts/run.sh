#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "opencode-computer-run must run as root" >&2
  exit 1
fi

if [[ "$#" -ne 0 ]]; then
  echo "opencode-computer-run does not accept arguments" >&2
  exit 1
fi

if ! mountpoint -q /data || [[ ! -f /data/.opencode-computer-layout ]]; then
  echo "ERROR: OpenCode Computer persistent layout is not ready." >&2
  exit 1
fi

exec setpriv \
  --reuid=10002 \
  --regid=10002 \
  --init-groups \
  --no-new-privs \
  env -i \
    AGENTD_CONTROL_HOST=127.0.0.1 \
    AGENTD_CONTROL_PORT="${AGENTD_CONTROL_PORT:-43117}" \
    AGENTD_HEALTH_HOST=0.0.0.0 \
    AGENT_COMPUTER_ID="${AGENT_COMPUTER_ID:-}" \
    HOME=/var/lib/agentd \
    NODE_ENV=production \
    OPENCODE_CLI_VERSION="${OPENCODE_CLI_VERSION:-}" \
    OPENCODE_SERVER_PASSWORD_FILE=/data/control/opencode-server-password \
    OPENCODE_SERVER_URL=http://127.0.0.1:4096 \
    OPENCODE_SERVER_USERNAME=opencode \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    PORT="${PORT:-8080}" \
    RAILWAY_CLI_VERSION="${RAILWAY_CLI_VERSION:-}" \
    WORKSPACE_ROOT=/data/workspace \
    /usr/local/bin/node /opt/opencode-computer/src/agentd.mjs
