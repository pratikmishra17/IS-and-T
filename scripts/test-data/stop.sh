#!/bin/zsh
# Stops the test copy started by start.sh: frontend (:4100), backend (:8090) and database (:5544).
# The data stays in .state until the next start.sh, which replaces it.
HERE=${0:A:h}
STATE=$HERE/.state
QUIET=${1:-}

stop_pid() {  # $1 = pid file, $2 = what it is
  [[ -f "$1" ]] || return 0
  local pid=$(cat "$1")
  if kill -0 $pid 2>/dev/null; then
    kill $pid
    for i in {1..20}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
    kill -0 $pid 2>/dev/null && kill -9 $pid
    [[ -n "$QUIET" ]] || print "Stopped the test $2"
  fi
  rm -f "$1"
}

stop_pid "$STATE/frontend.pid" frontend
stop_pid "$STATE/backend.pid" backend

if [[ -f "$STATE/pgdata/postmaster.pid" ]]; then
  if [[ -z "${PG_BIN:-}" ]]; then
    if command -v pg_ctl >/dev/null; then PG_BIN=${$(command -v pg_ctl):h}
    else found=(/Library/PostgreSQL/*/bin(N) /opt/homebrew/opt/postgresql*/bin(N)); PG_BIN=${${(nO)found}[1]:-}
    fi
  fi
  "$PG_BIN/pg_ctl" -D "$STATE/pgdata" -m fast -w stop > /dev/null 2>&1 && { [[ -n "$QUIET" ]] || print "Stopped the test database"; }
fi
true
