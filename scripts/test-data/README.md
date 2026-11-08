# Test copy with sample data

One command builds a separate copy of the app, filled with a week of realistic data, for clicking
around and trying to break things. It never touches your own database, your backend on 8080 or your
frontend on 4200.

```bash
scripts/test-data/start.sh
```

Then open <http://localhost:4100>:

| Who | Email | Where |
|---|---|---|
| Admin | `admin@isandt.test` | `/admin/login` |
| Alister (student, can edit team tasks) | `alister.p@isandt.test` | `/login` |
| Other students | `hetvi.shah`, `pratik.patel`, `grace.kim`, `alex.romero`, `oskar.nowak` (all `@isandt.test`) | `/login` |

The passwords are made up on every run and saved in `scripts/test-data/.state/secrets.env`. All
students share one password. Git ignores the `.state` folder, so they're never committed.

Stop the copy with `scripts/test-data/stop.sh`. Running `start.sh` again throws the old copy away and
builds a fresh one, so a broken copy is easy to replace.

## What it does

1. Makes a brand-new Postgres database on port 5544, kept in `.state/pgdata`.
2. Compiles the backend and starts it on port 8090 against that database. Emails are printed to
   `.state/backend.log` and never sent, because the Gmail password is left out on purpose. The
   `weekly-shifts.csv` import is off, so only the seed decides who works when.
3. Runs `seed/seed.py`, which signs in as the admin and as each student and uses the real API, the
   way the browser does. The app's own rules apply: anything they refuse is printed as `FAIL` (also in
   `.state/seed.log`). Students set their passwords from the links printed in the backend log.
4. Starts the frontend on port 4100, sending `/api` calls to the test backend. Skip this step with
   `--no-frontend`.

## What's in it

The data runs from the day you start it through the next 7 days. Weekly shifts repeat by weekday, so
each task goes on a weekday ("the next Monday"), not a fixed date. The same people are on shift for
it whichever day you run this.

- 3 semesters (the current one includes today), 7 holidays (one already past, one on the coming
  Saturday that has an extra shift)
- 5 admins, 8 students: 6 have passwords, Adam never opened his link, Jordan is disabled
- 7 categories, 6 rooms, 12 items with stock (plus 1 archived), and stock that's been received,
  removed, counted and moved
- Weekly shifts for 6 students, plus one-off changes: extra shifts (weekends too), a cancelled day,
  part of a day off
- About 30 tasks: assigned, unassigned, claimed, handed off, done, couldn't do, cancelled,
  rescheduled, and deployments that finished with items missing, plus a follow-up
- At least 5 of each waiting request: time off, different hours, "I can do this" offers, submitted
  hours, missing items. A few of each are already answered.

## Needs

- Postgres, found on the PATH, in `/Library/PostgreSQL/*/bin` or in Homebrew's folder (or set `PG_BIN`)
- Java 21 (or set `JAVA_HOME`), Python 3.9+, and the frontend's `npm install` done
- Ports 5544, 8090 and 4100 free
