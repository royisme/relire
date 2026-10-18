#!/usr/bin/env bash
# docs/agent-delegation.md · start `pi -p` under a watchdog. pi sometimes
# hangs at startup with no network connection at all; a live process says
# nothing. If no TCP connection appears within 48 s, kill and retry (max 5).
# Usage: scripts/pi-dispatch.sh <worktree> <provider/model> <prompt-file> <log> [timeout-seconds]
#
# agy work goes through pi too (the owner's rule, 2026-09-30): pass
# `antigravity/gemini-3.8-flash` (~/.config/pi-agy-lean/README.md). The model is
# mandatory: pi's default is now antigravity, so a call without --model would
# silently run Gemini.
#
# Extensions: `-ne` is the DEFAULT again. On 2026-09-30 pi-crew was removed and a small
# file-writing task ran fine without `-ne`, so it was dropped; the first real task
# then went through pi-subagents instead: pi wrote a plan, launched a
# "Sonnet child task" that returned 401, and implemented nothing. A small task never
# triggers the delegation, so passing it proved nothing. PI_EXT=1 allows extensions
# (only worth trying on a task you can afford to see hijacked). antigravity comes
# from an extension, so under `-ne` the lean extension is loaded explicitly with -e.
# NOTE: neither pi nor agy is sandboxed. A worktree isolates file edits, not shell
# access: either can read .dev.vars through an absolute path.
set -u
wt=$(cd "$1" && pwd) model=$2 prompt=$(cd "$(dirname "$3")" && pwd)/$(basename "$3") log=$(cd "$(dirname "$4")" && pwd)/$(basename "$4") limit=${5:-5400}
[ -s "$prompt" ] || { echo "prompt file missing or empty: $prompt" >&2; exit 2; }
case "$model" in
  */*) ;;
  *) echo "model must be <provider>/<model>, got: '$model'" >&2; exit 2 ;;
esac
flags=(-ne)
if [ "${PI_EXT:-0}" = 1 ]; then flags=(); fi
if [ "${model%%/*}" = antigravity ] && [ "${#flags[@]}" -gt 0 ]; then
  lean="$HOME/.pi/agent/extensions/agy-lean.ts"
  [ -f "$lean" ] || { echo "antigravity needs $lean (see ~/.config/pi-agy-lean/README.md)" >&2; exit 2; }
  flags=(-ne -e "$lean")
fi
# Every descendant of $1 (children, grandchildren, ...), one pid per line.
descendants() {
  local p
  for p in $(pgrep -P "$1" 2>/dev/null); do echo "$p"; descendants "$p"; done
}
# True if $1 or any descendant holds an established TCP connection.
has_connection() {
  local p
  for p in "$1" $(descendants "$1"); do
    if lsof -a -i TCP -p "$p" 2>/dev/null | grep -q ESTABLISHED; then return 0; fi
  done
  return 1
}
for attempt in 1 2 3 4 5; do
  echo "[watchdog] attempt $attempt $(date +%T)" >>"$log"
  (cd "$wt" && exec timeout "$limit" pi -p ${flags[@]+"${flags[@]}"} --no-session --model "$model" --thinking "${PI_THINKING:-high}" "$(cat "$prompt")") >>"$log" 2>&1 &
  pid=$!
  connected=0
  for _ in $(seq 1 16); do
    sleep 3
    kill -0 "$pid" 2>/dev/null || break
    # pi runs under timeout, and agy-backed models open their sockets in a grandchild
    # that has its own process group (so `lsof -g <group>` saw nothing and the
    # watchdog killed a healthy task five times). Walk the whole descendant tree.
    if has_connection "$pid"; then connected=1; break; fi
  done
  if [ "$connected" = 1 ] || ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid"; code=$?
    echo "[watchdog] exit $code $(date +%T)" >>"$log"
    exit "$code"
  fi
  echo "[watchdog] no connection after 48s, killing $pid" >>"$log"
  pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
done
echo "[watchdog] gave up after 5 attempts" >>"$log"
exit 124
