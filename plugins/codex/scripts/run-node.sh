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

is_supported_node() {
  "$1" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 18 || (major === 18 && minor >= 18) ? 0 : 1)' >/dev/null 2>&1
}

find_node() {
  if [ -n "${CODEX_COMPANION_NODE:-}" ] && [ -x "$CODEX_COMPANION_NODE" ] && is_supported_node "$CODEX_COMPANION_NODE"; then
    printf '%s\n' "$CODEX_COMPANION_NODE"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    candidate=$(command -v node)
    if is_supported_node "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
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
    is_supported_node "$candidate" || continue
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

node_bin=$(find_node) || {
  echo "Codex Companion requires Node.js >=18.18. Add a supported node to PATH or set CODEX_COMPANION_NODE to its executable path." >&2
  exit 127
}

add_supported_node_dir_to_path() {
  candidate=$1
  [ -x "$candidate" ] || return 0
  is_supported_node "$candidate" || return 0
  case "$candidate" in */*) candidate_dir=${candidate%/*} ;; *) candidate_dir=. ;; esac
  case ":$PATH:" in *":$candidate_dir:"*) ;; *) PATH="$PATH:$candidate_dir" ;; esac
}

case "$node_bin" in */*) node_dir=${node_bin%/*} ;; *) node_dir=. ;; esac
PATH="$node_dir${PATH:+:$PATH}"
home=${HOME:-}
for candidate in /opt/homebrew/bin/node /usr/local/bin/node /opt/local/bin/node "$home/.volta/bin/node" "$home"/.nvm/versions/node/*/bin/node "$home"/.local/share/fnm/node-versions/*/installation/bin/node "$home"/.asdf/installs/nodejs/*/bin/node "$home"/.local/share/mise/installs/node/*/bin/node; do
  add_supported_node_dir_to_path "$candidate"
done
export PATH

exec "$node_bin" "$script_dir/$target" "$@"
