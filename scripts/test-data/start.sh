#!/bin/zsh
# Builds a throwaway copy of the app filled with test data, separate from your own database:
#   Postgres on 127.0.0.1:5544  ->  backend on :8090  ->  frontend on :4100
# Every run starts from nothing (the previous copy is deleted), so it's safe to break things in it.
# Your own database, your backend on 8080 and your frontend on 4200 are never touched.
#
#   scripts/test-data/start.sh                 everything, then open http://localhost:4100
#   scripts/test-data/start.sh --no-frontend   database and backend only
#   scripts/test-data/stop.sh                  stops all three
#
# Logins and passwords: scripts/test-data/.state/secrets.env (made up on each run, never committed).
set -euo pipefail

HERE=${0:A:h}                     # this folder (zsh: absolute path of the script's directory)
REPO=${HERE:h:h}
STATE=$HERE/.state
DB_PORT=5544 BACKEND_PORT=8090 FRONTEND_PORT=4100
FRONTEND=yes
[[ "${1:-}" == "--no-frontend" ]] && FRONTEND=no

say() { print -P "%B==> $*%b" }

# ---- Find the tools -------------------------------------------------------------------------------
# Postgres: PG_BIN if set, else on the PATH, else the EnterpriseDB installer's or Homebrew's folder.
if [[ -z "${PG_BIN:-}" ]]; then
  if command -v initdb >/dev/null; then PG_BIN=${$(command -v initdb):h}
  else
    # (N): a pattern that matches nothing is skipped instead of an error; (nO): newest version first
    found=(/Library/PostgreSQL/*/bin(N) /opt/homebrew/opt/postgresql*/bin(N))
    PG_BIN=${${(nO)found}[1]:-}
  fi
fi
[[ -x "$PG_BIN/initdb" ]] || { print "Can't find Postgres (initdb). Set PG_BIN to its bin folder, e.g. PG_BIN=/Library/PostgreSQL/18/bin"; exit 1 }
export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 21 2>/dev/null || true)}
[[ -x "$JAVA_HOME/bin/java" ]] || { print "Can't find Java 21. Set JAVA_HOME to it."; exit 1 }

# ---- Start clean ----------------------------------------------------------------------------------
"$HERE/stop.sh" --quiet
for port in $DB_PORT $BACKEND_PORT $FRONTEND_PORT; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    print "Port $port is already in use by something else (lsof -iTCP:$port). Stop it and run this again."; exit 1
  fi
done
rm -rf "$STATE"
mkdir -p "$STATE"
chmod 700 "$STATE"

# ---- Made-up passwords (only in .state, which git ignores) ----------------------------------------
pw() { openssl rand -base64 24 | tr -d '/+=' | cut -c1-20 }
umask 077
cat > "$STATE/secrets.env" <<EOF
# Logins for the test copy at http://localhost:$FRONTEND_PORT, made up by start.sh on $(date).
# Admin portal: /admin/login. Students (Alister is alister.p@isandt.test): /login.
ADMIN_EMAIL=admin@isandt.test
ADMIN_PASSWORD=$(pw)
STUDENT_PASSWORD=$(pw)

# Used by the test backend and the seed script.
DB_URL=jdbc:postgresql://127.0.0.1:$DB_PORT/isandt
DB_USERNAME=isandt_test
DB_PASSWORD=$(pw)
DEV_ADMIN_EMAIL=admin@isandt.test
DEV_ADMIN_PASSWORD=$(pw)
DEV_ADMIN_FIRST_NAME=Tessa
DEV_ADMIN_LAST_NAME=Admin
EOF
umask 022
set -a; source "$STATE/secrets.env"; set +a

# ---- Database -------------------------------------------------------------------------------------
say "Creating a fresh database on port $DB_PORT"
print -r -- "$DB_PASSWORD" > "$STATE/pw.tmp"
"$PG_BIN/initdb" -D "$STATE/pgdata" -U "$DB_USERNAME" --pwfile="$STATE/pw.tmp" -A scram-sha-256 -E UTF8 > "$STATE/initdb.log" 2>&1
rm "$STATE/pw.tmp"
"$PG_BIN/pg_ctl" -D "$STATE/pgdata" -l "$STATE/postgres.log" -w \
  -o "-p $DB_PORT -c listen_addresses=127.0.0.1 -k '$STATE'" start > /dev/null
PGPASSWORD=$DB_PASSWORD "$PG_BIN/createdb" -h 127.0.0.1 -p $DB_PORT -U "$DB_USERNAME" isandt

# ---- Backend --------------------------------------------------------------------------------------
say "Compiling the backend"
cd "$REPO/is-and-t-backend"
./mvnw -q compile
./mvnw -q dependency:build-classpath -Dmdep.outputFile="$STATE/classpath.txt" > /dev/null

say "Starting the test backend on port $BACKEND_PORT (log: .state/backend.log)"
# - No Gmail password, so emails are printed to the log instead of sent (the seed reads the
#   set-password links from there). MAIL_FROM is cleared too, so nothing points at a real inbox.
# - DevTools restarts are off, so restarting your own backend doesn't restart this one.
# - The weekly-shifts.csv import is off, so only the seed decides who works when.
env -u GMAIL_APP_PASSWORD -u MAIL_FROM nohup "$JAVA_HOME/bin/java" -Dspring.devtools.restart.enabled=false \
  -cp "target/classes:$(cat "$STATE/classpath.txt")" com.isandt.backend.IsAndTBackendApplication \
  --server.port=$BACKEND_PORT --app.frontend-url=http://localhost:$FRONTEND_PORT \
  --spring.jpa.show-sql=false --app.seed.weekly-shifts=classpath:no-such-file.csv \
  > "$STATE/backend.log" 2>&1 < /dev/null &
print $! > "$STATE/backend.pid"
for i in {1..90}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$BACKEND_PORT/api/auth/me" || true)
  [[ "$code" == 204 || "$code" == 200 ]] && break
  if ! kill -0 $(cat "$STATE/backend.pid") 2>/dev/null; then print "The backend stopped while starting:"; tail -30 "$STATE/backend.log"; exit 1; fi
  sleep 1
done
[[ "$code" == 204 || "$code" == 200 ]] || { print "The backend didn't start in 90 seconds; see $STATE/backend.log"; exit 1 }

# ---- Data -----------------------------------------------------------------------------------------
say "Filling it with test data"
TEST_STATE_DIR=$STATE TEST_BACKEND_PORT=$BACKEND_PORT python3 "$HERE/seed/seed.py" 2>&1 | tee "$STATE/seed.log" || \
  print "\nThe seed reported problems: see the FAIL lines or the error above (also in .state/seed.log)."

# ---- Frontend -------------------------------------------------------------------------------------
if [[ $FRONTEND == yes ]]; then
  say "Starting the test frontend on port $FRONTEND_PORT (log: .state/frontend.log)"
  print -r -- "{ \"/api\": { \"target\": \"http://localhost:$BACKEND_PORT\", \"secure\": false } }" > "$STATE/proxy.json"
  cd "$REPO/is-and-t-frontend"
  nohup node node_modules/@angular/cli/bin/ng.js serve --port $FRONTEND_PORT --proxy-config "$STATE/proxy.json" --no-hmr \
    > "$STATE/frontend.log" 2>&1 < /dev/null &
  print $! > "$STATE/frontend.pid"
  for i in {1..120}; do
    curl -s -o /dev/null "http://localhost:$FRONTEND_PORT/" && break
    sleep 1
  done
fi

print
say "Ready: http://localhost:$FRONTEND_PORT"
print "   Admin:    $ADMIN_EMAIL at /admin/login"
print "   Alister:  alister.p@isandt.test at /login (other students: hetvi.shah, pratik.patel, grace.kim, alex.romero, oskar.nowak)"
print "   Passwords: $STATE/secrets.env"
print "   Stop it:  scripts/test-data/stop.sh"
