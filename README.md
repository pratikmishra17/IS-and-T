# IS&T Task Scheduler

A scheduling and task app for the Cleveland State University IS&T student team. Managers (admins)
plan deployments and fixes, set up semesters and work schedules, and track inventory; student
workers see their day, pick up tasks, request time off and look up stock.

| | |
|---|---|
| **Backend** | Java 21, Spring Boot 4, Spring Security, PostgreSQL, Flyway (`is-and-t-backend/`) |
| **Frontend** | Angular 22, Tailwind CSS 4 (`is-and-t-frontend/`) |
| **Plan and progress** | [`docs/PLAN.md`](docs/PLAN.md) |

The two apps run side by side on your machine: the backend on <http://localhost:8080> and the
frontend on <http://localhost:4200>. The frontend's dev server passes every `/api/...` request to the
backend, so in the browser you only ever open port 4200.

---

## 1. Install the tools

| Tool | Version | Check with |
|---|---|---|
| Java (JDK) | 21 | `java -version` |
| Node.js | 22.22+ or 24.15+ | `node -v` |
| PostgreSQL | 16 or newer (pgAdmin is handy for looking at the data) | `psql --version` or pgAdmin |
| An editor | Eclipse with Spring Tools (backend) and VS Code (frontend) are what we use | |

You don't need to install Maven or the Angular CLI: the backend comes with a Maven wrapper
(`./mvnw`) and the frontend uses the Angular CLI from its own `node_modules`.

## 2. Create the database

In pgAdmin (or `psql`), connected as `postgres`, create an empty database:

```sql
CREATE DATABASE isandt;
```

That's all. The tables are created by the backend itself the first time it starts (Flyway runs the
migration scripts in `is-and-t-backend/src/main/resources/db/migration`).

## 3. Set your environment variables

Passwords never go in the code or in git. The backend reads them from environment variables
instead. Only `DB_PASSWORD` is required to start.

| Variable | Needed? | What it is |
|---|---|---|
| `DB_PASSWORD` | **Required** | Your local Postgres password |
| `DB_USERNAME` | Optional | Defaults to `postgres` |
| `DB_URL` | Optional | Defaults to `jdbc:postgresql://localhost:5432/isandt` |
| `DEV_ADMIN_EMAIL` | Recommended | The admin account to create for you on first start (defaults to Alister's) |
| `DEV_ADMIN_FIRST_NAME`, `DEV_ADMIN_LAST_NAME` | Optional | That admin's name |
| `DEV_ADMIN_PASSWORD` | Optional | A temporary password for that admin. You'll be asked to change it at first login. Without it, a set-password link is emailed instead (or printed in the console, see below) |
| `GMAIL_APP_PASSWORD` | Optional | A Gmail [App Password](https://myaccount.google.com/apppasswords) for sending real emails. Without it, emails are **printed in the backend console** instead of sent, which is fine for development |
| `MAIL_FROM` | Optional | The Gmail address emails are sent from (the app password must belong to it) |
| `DB_MIGRATION_USERNAME`, `DB_MIGRATION_PASSWORD` | Optional | Only after setting up the limited database users in [`docs/db-roles.sql`](docs/db-roles.sql) |

**In Eclipse:** Spring Boot Dashboard → right-click `is-and-t-backend` → *Open Config* →
*Environment* tab → *Add* each variable → *Apply*.

**From a terminal (macOS/Linux):** put them in front of the run command, for example
`DB_PASSWORD=secret DEV_ADMIN_EMAIL=you@example.com ./mvnw spring-boot:run`, or `export` them first.

## 4. Start the backend

**In Eclipse:** import `is-and-t-backend` as an existing Maven project, then start it from the
Spring Boot Dashboard.

**Or from a terminal:**

```bash
cd is-and-t-backend
./mvnw spring-boot:run
```

It's ready when the log says `Started IsAndTBackendApplication`. On the very first start you'll also
see Flyway create the tables and a line about the dev admin account being created.

## 5. Start the frontend

```bash
cd is-and-t-frontend
npm install
npm start
```

(`npm install` is only needed the first time and after someone changes `package.json`.)

## 6. Log in

Open <http://localhost:4200/admin/login> and log in with your dev admin:

- **With `DEV_ADMIN_PASSWORD` set:** use it, then choose a new password when asked.
- **Without it:** open the set-password link from the email, or, with no `GMAIL_APP_PASSWORD`, copy
  it from the backend console (look for the printed email), and choose a password there.

From the admin portal you can add students and other admins; each gets a link to set their own
password. Students log in at <http://localhost:4200/login>.

---

## Day-to-day

| Task | Command |
|---|---|
| Backend tests | `cd is-and-t-backend && ./mvnw test -Dtest='!IsAndTBackendApplicationTests'` |
| Frontend tests | `cd is-and-t-frontend && npm test -- --watch=false` |
| Production build of the frontend | `cd is-and-t-frontend && npm run build` |
| Restart the backend after a change | Eclipse: restart from the dashboard. Or touch the DevTools trigger file: `date > is-and-t-backend/target/classes/.reloadtrigger` |

(`IsAndTBackendApplicationTests` starts the whole app and needs the database, so it's left out of the
quick test run.)

**Changing the database:** never edit a migration that has already run. Add a new file named
`V<next number>__what_it_does.sql` in `is-and-t-backend/src/main/resources/db/migration`; it runs on the
next start. Hibernate only checks that the Java entities match the tables, so a mismatch stops the
app at startup with a message saying which column is wrong.

## Troubleshooting

| Problem | Fix |
|---|---|
| Backend: `password authentication failed for user "postgres"` | `DB_PASSWORD` is missing or wrong in your run configuration |
| Backend: `database "isandt" does not exist` | Create it (step 2) |
| Backend: `Schema-validation: missing column ...` | Your code is newer than your database or the other way round; pull the latest code and restart so Flyway runs the new migrations |
| Frontend: `Can't reach the server. Is the backend running?` | Start the backend (step 4); it must be on port 8080 |
| Login: "Too many attempts. Please wait N minutes" | Five wrong passwords lock that account for 15 minutes. Restarting the backend clears it in development |
| Emails don't arrive | Without `GMAIL_APP_PASSWORD` they're printed in the backend console. With it, check the spam folder and that the app password belongs to `MAIL_FROM` |
| Signed out unexpectedly | Sessions end after 15 minutes idle (admins) or 30 (students), 12 hours after login, and whenever the backend restarts |

## Project layout

```
docs/
  PLAN.md                 requirements, decisions, build phases and progress
  db-roles.sql            optional: limited database users for the app
is-and-t-backend/         Spring Boot API (/api/...)
  src/main/java/com/isandt/backend/
    auth/                 login, sessions, password links, security rules
    user/                 students and admins
    calendar/             semesters and holidays
    schedule/             weekly schedules, shifts, extra shifts and days off
    task/                 tasks: creating, assigning, claiming, completing
    timeoff/              time-off requests and reassigning affected tasks
    inventory/            catalog, stock per room, reservations
    portal/               the student portal's "my day" and calendar feed
    settings/             app settings and the daily digest email
    notification/         sending email
    common/               shared configuration, errors, web helpers
  src/main/resources/
    application*.properties   settings (dev and prod profiles)
    db/migration/             Flyway migration scripts
is-and-t-frontend/        Angular app
  src/app/
    pages/                one folder per page (pages/admin/... for the admin portal)
    layouts/              the frame around each portal
    services/             talking to the API, login state, route guards
    ui/                   shared dialogs, toasts, side panel, session timer
```

## Production

Start the backend with `SPRING_PROFILES_ACTIVE=prod`. That profile requires HTTPS (`FRONTEND_URL`
must start with `https://`), real email (`GMAIL_APP_PASSWORD`), and the limited database user from
[`docs/db-roles.sql`](docs/db-roles.sql); it refuses to start until all of them are set. The frontend
builds with `npm run build` and runs with `node dist/is-and-t-frontend/server/server.mjs`; set
`NG_ALLOWED_HOSTS` to the public host name.
