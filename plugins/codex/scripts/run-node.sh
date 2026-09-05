#!/bin/sh
set -u

target=${1:-}
if [ -z "$target" ]; then
  echo "Codex Companion Node launcher requires a script name." >&2
  exit 64
fi
shift

case "$0" in
  */*) script_base=${0%/*} ;;
  *) script_base=. ;;
esac
script_dir=$(CDPATH= cd -- "$script_base" && pwd)

find_node() {
  if [ -n "${CODEX_COMPANION_NODE:-}" ] && [ -x "$CODEX_COMPANION_NODE" ]; then
    printf '%s\n' "$CODEX_COMPANION_NODE"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  home=${HOME:-}
  for candidate in \
    /opt/homebrew/bin/node /usr/local/bin/node /opt/local/bin/node \
    "$home/.volta/bin/node" \
    "$home"/.nvm/versions/node/*/bin/node \
    "$home"/.local/share/fnm/node-versions/*/installation/bin/node \
    "$home"/.asdf/installs/nodejs/*/bin/node \
    "$home"/.local/share/mise/installs/node/*/bin/node; do
    [ -x "$candidate" ] || continue
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

node_bin=$(find_node) || {
  echo "Codex Companion requires Node.js >=18.18. Add node to PATH or set CODEX_COMPANION_NODE to its executable path." >&2
  exit 127
}

exec "$node_bin" "$script_dir/$target" "$@"
