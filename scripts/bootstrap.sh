#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "opencode-computer-bootstrap must run as root" >&2
  exit 1
fi

if [[ "$#" -ne 0 ]]; then
  echo "opencode-computer-bootstrap does not accept arguments" >&2
  exit 1
fi

exec 9>/run/opencode-computer-bootstrap.lock
flock -x 9

if ! mountpoint -q /data; then
  echo "ERROR: /data is not a mounted Railway volume." >&2
  exit 1
fi

if [[ "$(stat -c '%u:%g' /data)" != "0:0" ]]; then
  echo "ERROR: /data must be owned by root." >&2
  exit 1
fi

data_mode="$(stat -c '%a' /data)"
if (( (8#$data_mode & 8#022) != 0 )); then
  echo "ERROR: /data must not be writable by group or other users." >&2
  exit 1
fi

layout_file=/data/.opencode-computer-layout
password_file=/data/control/opencode-server-password
skills_link=/data/home/.config/opencode/skills

initial_directories=(
  /data/home
  /data/home/.cache
  /data/home/.cache/opencode
  /data/home/.config
  /data/home/.config/opencode
  /data/home/.local
  /data/home/.local/bin
  /data/home/.local/share
  /data/home/.local/share/opencode
  /data/home/.local/state
  /data/home/.local/state/opencode
  /data/home/.railway
  /data/workspace
  /data/skills
  /data/agentd
  /data/agentd/private
  /data/agentd/state
  /data/control
  /data/trash
)

protected_directories=(
  /data/home
  /data/workspace
  /data/skills
  /data/agentd
  /data/agentd/private
  /data/agentd/state
  /data/control
  /data/trash
)

validate_layout() {
  if [[ -L "$layout_file" ]] || [[ ! -f "$layout_file" ]]; then
    echo "ERROR: Invalid OpenCode Computer layout marker." >&2
    exit 1
  fi
  if [[ "$(stat -c '%u:%g:%a' "$layout_file")" != "0:0:644" ]] ||
    [[ "$(<"$layout_file")" != "1" ]]; then
    echo "ERROR: Untrusted OpenCode Computer layout marker." >&2
    exit 1
  fi

  for path in "${protected_directories[@]}"; do
    if [[ -L "$path" ]] || [[ ! -d "$path" ]]; then
      echo "ERROR: Invalid persistent directory: $path" >&2
      exit 1
    fi
  done

  if [[ -L "$password_file" ]] || [[ ! -s "$password_file" ]] ||
    [[ "$(stat -c '%u:%g:%a' "$password_file")" != "0:10003:640" ]]; then
    echo "ERROR: Invalid OpenCode server credential." >&2
    exit 1
  fi
}

if [[ -e "$layout_file" ]] || [[ -L "$layout_file" ]]; then
  validate_layout
  exit 0
fi

for path in "${initial_directories[@]}" "$skills_link" "$password_file"; do
  if [[ -e "$path" ]] || [[ -L "$path" ]]; then
    echo "ERROR: Refusing to initialize a partial or untrusted layout: $path" >&2
    exit 1
  fi
done

# Build the complete tree while it is root-owned. No unprivileged process can
# alter a pathname before the final ownership handoff.
install -d -o root -g root -m 0700 "${initial_directories[@]}"

cp -a /opt/opencode-computer/default-opencode/. /data/home/.config/opencode/
ln -s /data/skills "$skills_link"

password_tmp="$(mktemp /data/control/.opencode-server-password.XXXXXX)"
trap 'rm -f "$password_tmp"' EXIT
openssl rand -base64 48 | tr -d '\n' > "$password_tmp"
chown root:control "$password_tmp"
chmod 0640 "$password_tmp"
mv "$password_tmp" "$password_file"
trap - EXIT

find /data/home -depth -exec chown -h computer:computer {} +
find /data/home -type d -exec chmod 0700 {} +

chown computer:workspace /data/workspace /data/skills /data/trash
chmod 2770 /data/workspace /data/skills /data/trash

chown -R agentd:agentd /data/agentd
chmod 0700 /data/agentd /data/agentd/private /data/agentd/state

chown root:control /data/control "$password_file"
chmod 0750 /data/control
chmod 0640 "$password_file"

printf '1\n' > "$layout_file"
chown root:root "$layout_file"
chmod 0644 "$layout_file"

validate_layout
