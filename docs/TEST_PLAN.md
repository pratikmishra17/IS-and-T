# Test plan

Hands-on testing of every screen, done the way people would use it: real clicks and typing in the
browser, with made-up people and tasks, covering the normal path, mistakes, and edge cases.

**Where it runs.** A throwaway copy of the app, so nothing touches the real data or sends email:

| Piece | Where |
|---|---|
| Database | a separate test Postgres on port 5544 (empty at the start) |
| Backend | a second copy on port 8090, with its own test admin (`admin@isandt.test`) |
| Frontend | `ng serve` on port 4100, pointed at the test backend |
| Email | printed to the test backend's log, never sent (that's how set-password links are opened) |

**Order.** Admin portal first (it creates everything the student portal needs), fixing problems as
they're found; then the student portal; then both together (things one side does that the other
must see). Each finding is listed at the bottom as a **bug** (fixed straight away), or a
**suggestion** (to optimise, combine, add or remove something: waits for a yes).

Legend: ✅ works · 🐞 bug found (see Findings) · 💡 suggestion · ⏳ not tested yet

---

## Part 1: Admin portal

### A1. Logging in and the account
| # | Scenario | Result |
|---|---|---|
| A1.1 | Wrong password: clear message, no hint whether the email exists | ✅ |
| A1.2 | First login with a starter password: must choose a new one before anything else | ✅ |
| A1.3 | New password rules (too short, same as old) | ✅ |
| A1.4 | An admin on the student login page is turned away (and the other way round) | ✅ |
| A1.5 | Forgot password: link printed/emailed, link works once, old password stops working | ✅ |
| A1.6 | My account: change name, change password (wrong current password refused) | ✅ |
| A1.7 | Log out from the avatar menu goes straight to the login page; back button doesn't get back in | ✅ |
| A1.8 | Sidebar collapses and expands; dark mode switch; pages remember tabs and filters | ✅ |

### A2. Users
| # | Scenario | Result |
|---|---|---|
| A2.1 | Add a student: required fields, email format, student ID; set-password link sent | ✅ |
| A2.2 | Same email twice / same student ID twice refused with a clear message | ✅ |
| A2.3 | Add a second admin; they set a password from the link and log in | ✅ |
| A2.4 | Edit someone's name, email, student ID | ✅ |
| A2.5 | Search, status filter, sorting; "Waiting for password" status | ✅ |
| A2.6 | Disable a student: they're logged out and can't log in; their tasks go to someone else; enable again | ✅ |
| A2.7 | Remove a student (confirm dialog); can't disable or remove yourself | ✅ |
| A2.8 | Team access: View only / View + mark done / Edit tasks | ✅ |

### A3. Calendar (semesters and holidays)
| # | Scenario | Result |
|---|---|---|
| A3.1 | Add a semester; end before start refused; overlapping semesters refused | ✅ |
| A3.2 | Edit and delete a semester (what happens to its shifts) | ✅ |
| A3.3 | Add a holiday; same date twice; import a calendar (.ics) file; delete | ✅ |
| A3.4 | Past holidays hidden/shown | ✅ |

### A4. Settings
| # | Scenario | Result |
|---|---|---|
| A4.1 | Daily digest time and recipients; "Send now" (email appears in the log) | ✅ |
| A4.2 | Default task length is used by new tasks | ✅ |

### A5. Inventory
| # | Scenario | Result |
|---|---|---|
| A5.1 | Categories and storage locations: add, rename, delete (refused while in use) | ✅ |
| A5.2 | Items: add, edit, archive, restore, delete (refused with history) | ✅ |
| A5.3 | Stock: receive, use, move, adjust; can't go below zero; history tab | ✅ |

### A6. Shifts & tasks (the Planner)
| # | Scenario | Result |
|---|---|---|
| A6.1 | Weekly shifts for several students (paint and type), weekly hour limit warning | ✅ |
| A6.2 | One-off changes: day off, extra shift, part of a day off | ✅ |
| A6.3 | Week, Day, Task list views; arrows, Today, Month picker; view remembered | ✅ |
| A6.4 | New task: button, drag on the board, click for 30 minutes; required fields | ✅ |
| A6.5 | Who does it: automatic, nobody, a chosen student (on shift / not on shift warning) | ✅ |
| A6.6 | Things to bring (suggestions and typed), inventory items reserved | ✅ |
| A6.7 | Drag a task to another person / to Unassigned | ✅ |
| A6.8 | Edit and reschedule (assignee no longer free → reassigned), cancel | ✅ |
| A6.9 | Student requests: semester hours, shift changes, offers to take a task | ✅ |
| A6.10 | Time-off requests: approve (tasks move) and decline | ✅ |
| A6.11 | Missing items: a backorder after a short completion, follow-up deployment | ✅ |
| A6.12 | Tab counts are right and update | ✅ |

### A7. Dashboard
| # | Scenario | Result |
|---|---|---|
| A7.1 | Numbers match reality; every card and link goes where it says | ✅ |

### A8. Activity log
| # | Scenario | Result |
|---|---|---|
| A8.1 | Everything done above appears, with who, what, item and result | ✅ |
| A8.2 | Failed actions show the reason; search and filters | ✅ |

---

## Part 2: Student portal
| # | Scenario | Result |
|---|---|---|
| U1 | Set password from the email link; log in; wrong portal; log out | ✅ |
| U2 | Home: today's shifts and tasks, hours this week, up for grabs | ✅ |
| U3 | Tasks: claim, give back, hand off, mark done (with items used), couldn't do it | ✅ |
| U4 | Team: everyone's week and day, semester list, "I can do this", shift change requests, each access level | ✅ |
| U5 | Schedule: class times, preferred hours, submit; time off; calendar feed link | ✅ |
| U6 | Inventory (read-only view) | ✅ |
| U7 | My account (same page as the admin one, tested in A1.6) | ✅ |
| U8 | Phone-sized screens: tab bar, More menu, pages fit | ✅ |

## Part 3: Both together
| # | Scenario | Result |
|---|---|---|
| B1 | Student asks → admin answers → student sees the answer (hours, time off, shift change, offer) | ✅ |
| B2 | Admin changes shifts/tasks → student's Home, Tasks and Team update | ✅ |
| B3 | Activity log has both sides | ✅ |

## Part 4: Sessions and security
| # | Scenario | Result |
|---|---|---|
| S1 | Timeouts: admins 15 min idle, students 30 min idle, everyone 12 h max; warning 1 min before | ✅ |
| S2 | "Stay signed in" restarts the idle clock (warning came back a full idle period later) | ✅ |
| S3 | No answer: signed out on time, server session ended, login says why (`?ended=idle`), both portals | ✅ |
| S4 | A student can't withdraw, hand off, give back or finish someone else's time off, shift change, offer or task | ✅ |
| S5 | A student gets 403 on every admin address; can't raise their own team access | ✅ |
| S6 | Changes without the CSRF token are refused; security headers (CSP, no framing, no referrer) on every response | ✅ |
| S7 | Errors never show stack traces or SQL; bad ids, broken JSON, huge date ranges answered cleanly | ✅ |
| S8 | Session cookie is HttpOnly; a made-up calendar-feed token gets 404 | ✅ |

## Part 5: A full week of data (Sun Nov 8 - Sun Nov 15, 2026)
Rebuilt on Nov 8 on a fresh test database (the first copy was lost with the temporary folder), through
the API the way people would use it, by the admin and by students (mostly Alister, with Edit access):
29 tasks in every state (weekend ones included), 12 items in 7 categories and 6 rooms (added with
starting stock; stock added, removed, counted and moved), 3 semesters, 7 holidays (one edited),
8 one-off shift changes (2 on the weekend), 8 students (one disabled, one without a password),
5 admins, and waiting for an answer: 5 time-off requests, 6 shift changes, 8 offers, 5 semester-hours
requests, 6 missing items. Rebuild it any day with `scripts/test-data/start.sh` (see
[scripts/test-data/README.md](../scripts/test-data/README.md)): dates are worked out from the day it
runs, so it always covers today through the next 7 days.

---

## Findings

### Bugs (fixed as found)
1. Every confirm dialog (delete, disable, remove) opened in the top-left corner: Tailwind reset the dialog's centring margin. Fixed in styles.css.
2. "Forgot password?" from the admin login used the student look and "Back to login" went to the student login. Fixed: it now keeps ?portal=admin.
3. Activity log credited "Set a password from an email link" to whoever was logged in on that browser. Fixed: it names the account whose password was set.
4. Activity log showed "#5" for one-day shift changes and no name for added/imported holidays. Fixed: student name and date, holiday name, file name.
5. Student Tasks → Hand off always said "Nobody else is on shift" even when colleagues were free: the list arrived but the screen never redrew (zoneless app, plain field). Fixed with a signal.
6. Admin "Give it to …" on a student's offer crashed (500): a lazy-loaded task's start time was read from its field instead of its getter. Fixed in Task.overlaps.
7. Offers showed times with seconds ("10:00:00"). Fixed.
8. Team page wording: task history showed raw codes ("AUTO_ASSIGNED"), the change form said "You work Not working that day", My requests said "(now Not working)". Fixed.
9. Offers for a task that was finished, cancelled, or already given to that student stayed "Waiting" forever: they inflated the Student requests count, and accepting one failed. Fixed: they close as "No longer needed" (new status, migration V16).

### Suggestions (waiting for a yes)
0a. **Important (bug, needs a decision):** "Every week from …" shift changes (and any weekly-shift edit) rewrite the whole semester, including weeks already past: after approving Hetvi's "every Thursday from Nov 12", last week now shows 21 h she never worked. Fixing it means giving weekly shifts a start date (a database change).
0. **Important:** deleting a semester silently deletes every student's weekly shifts for it; the confirmation only mentions the hour limit. Block it while shifts exist, or warn with the counts.
1. After logging in, return to the page you were on (now always the Dashboard).
2. On weekends, open the Planner (and Dashboard) on the coming week instead of the week that just ended.
3. Combine "Things to bring" and "Reserve from stock" into one list: picking an inventory item reserves it.
4. Holidays could automatically mean no shifts (today each one needs a manual day off).
5. Assign warnings should say the exact reason (e.g. "hasn't set a password yet, so can't see this task").
6. Add an item with a starting quantity and room in one step; add a "Move between rooms" stock action.
7. Daily digest: include the next few days' unassigned tasks and anything waiting for an answer (time off, shift changes, offers).
8. Delete buttons that can't work (item with history, category in use) should be disabled with the reason, consistently.
9. A used/expired set-password link should say so as soon as it opens, with a "send me a new one" button.
11. Merge the two ways to ask for a day off (Schedule → Time off, and Team → shift change with no hours) into one "ask for a change" flow and one requests list.
12. Remove the leftover /logout "Ready to leave?" page (the avatar menus log out directly; after its button it stays on the page).
13. Home and the student Schedule: on weekends show "next up" (next shift/task) instead of an empty today; don't nag "hours not submitted" when an admin already set shifts.
14. Disabling a student: say in the confirmation how many upcoming tasks will move to others.
15. Follow-up deployments default to today even on weekends: default to the next working day.
16. Phones: open the Planner on the Day view (the week board shows one day at a time).
17. Student shift-change form: when you change the date, also fill the hours with that day's current shifts (only the "You work …" line updates now).
10. Small polish: carry the email to the other portal's login; show dates as "Wed, Nov 11" in messages and task history; focus a new "Things to bring" line; clear stale form errors when fixed; a past holiday should say it's under "Show past holidays"; let holidays be edited; categories added inline instead of a side panel.

18. One-off shift changes: the backend accepts "whole day off" with times and silently ignores the times (a whole day off instead of part). The screen never sends that, but the backend should refuse it.
19. Dashboard "Needs attention" only counts time-off requests: add shift changes, offers, semester hours and missing items, each linking to its tab.
20. Weekend work: tasks can be planned on Saturdays and Sundays (backups, an open house), but no one can be given a weekend shift, so they can never be auto-assigned and students can't ask for weekend time off or changes. Allow an admin to add an extra weekend shift (one-off only).

### Your answers (Nov 8, 2026)
Nothing is changed yet. All answered and built on Nov 8 (see "Built" below).

| # | Answer | Notes |
|---|---|---|
| 0a | Yes: **option b** | Weekly changes only affect weeks from the change on; earlier weeks are kept as a saved snapshot |
| 0 | Yes: **warn** | Warn with counts before deleting a semester that has shifts (don't block) |
| 1 | Yes, as a setting | Each user picks their landing page in Settings; default is the Dashboard |
| 2 | Yes, and show it | Weekends open on the coming week, with a visible note saying so |
| 3 | Yes | One list for "Things to bring" and "Reserve from stock" |
| 4 | Yes, with a way out | A holiday means no shifts by default, but someone can still be given a shift that day |
| 5 | Yes | Exact reasons in assign warnings |
| 6 | Yes, plus item picking | Add with starting quantity and room; "Move between rooms". In deployments: clicking an item (e.g. the ultrawide) adds 1, clicking it again removes it; the quantity is changed at the bottom |
| 7 | Yes | Daily email lists upcoming unassigned tasks and pending requests |
| 8 | Yes | Item, room and category deletes greyed out with the reason |
| 9 | Yes | Used/expired link says so, with "send me a new one" |
| 10 | Yes, all (a-g) | Email carry-over, friendly dates, focus new line, clear fixed errors, past-holiday hint, edit holidays, inline categories |
| 11 | Yes | One "Ask for a change" flow and one requests list |
| 12 | Yes | Visiting /logout logs you out and lands on the login page |
| 13 | Yes | Weekend "next up"; no hours nag once shifts are set |
| 14 | Yes | Disable confirmation says how many tasks move |
| 15 | Yes | Follow-ups default to the next working day |
| 16 | Yes | Phones open the Planner on Day view |
| 17 | Yes | Changing the date refills the hours unless you typed your own |
| 18 | Yes | Server refuses a whole day off that has times |
| 19 | Yes | "Needs attention" counts every kind of request |
| 20 | Yes | Admins can add a one-off weekend shift |

### Built (Nov 8, 2026)
Every answer above is in. Database changes: V17 (kept days, for 0a), V18 (after-login choice, for 1),
V19 (stock moves, for 6), V20 (one-day shift changes on weekends, for 20).

- 0a: weekly changes keep earlier days as they were (a saved copy of each day before the change); checked: an "every Thursday from Nov 19" change leaves Nov 12 at the old hours.
- 0: deleting a semester lists what goes with it (weekly shifts, hours, requests).
- 1: Account page → "After logging in": the Dashboard/Home (default) or the page you were on.
- 2: on a weekend the Planner opens on next week (with a note and "Show this weekend"); the Dashboard shows Monday when the weekend is quiet.
- 3 + 6: one "Things to bring" list: click an item to add 1 (stock items are reserved), click again to remove, set how many below. Items can be added with starting stock; "Move to room" in Adjust stock.
- 4: holidays mean no weekly shifts; an extra shift that day still counts. Adding a holiday re-checks tasks.
- 5: assign warnings say exactly why (no password, not working that day, shift doesn't cover it, busy with another task).
- 7: the daily email adds unassigned tasks for the next 4 days and everything waiting for an answer.
- 8: impossible deletes (item or room with history, category with items) are greyed out with the reason on hover.
- 9: the set-password page checks its link first: used/expired links say so, with "Send me a new one".
- 10: email carried between the two logins; "Wed, Nov 11" dates in messages; focus on a new typed line; errors clear when a field changes; past holiday hint; holidays can be edited; categories added inline.
- 11: one "Ask for a change" form (time off / different hours that day / every week) and one My requests list for students; time off moved into the admin's Student requests tab.
- 12: /logout logs out straight away and says so on the login page.
- 13: Home shows the next shift/task on an empty day; no "hours not submitted" once shifts are set.
- 14: disabling or removing a student says how many upcoming tasks will move.
- 15: follow-up deployments default to the next working day.
- 16: phones open the Planner on the Day view.
- 17: changing the date in the change form refills the hours (unless you typed your own).
- 18: a whole day off with times is refused.
- 19: Dashboard "Needs attention" counts every kind of request.
- 20: weekend extra shifts and one-day weekend requests; the week views show Saturday/Sunday when something is on them (or with "Show weekend").

Found while testing these: the student Schedule listed "part of the day off" changes as "extra shift"
(fixed), and the database still refused weekend one-day requests (fixed by V20).

