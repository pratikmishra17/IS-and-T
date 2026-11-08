"""Fills a fresh test copy of the app with realistic data, from today through the next 7 days, the way
people would: the admin sets things up, students (mostly Alister, who has Edit access) use every
student feature, and the admin answers some requests while leaving at least five of each waiting.

Every call goes through the real API, so the app's own rules apply: a refusal is printed as FAIL,
not hidden. Run by start.sh against a brand-new database; running it twice on the same database
fails at the first step (the admin's temporary password is already gone).

Dates are worked out from the day it runs. Shifts repeat by weekday, so each task is placed on a
weekday (the next Monday, the next Tuesday, ...) rather than a fixed date: the same people are on
shift for it whichever day you run this."""
import datetime as dt
from zoneinfo import ZoneInfo

import api

# ---- Dates ----------------------------------------------------------------------------------------

# The backend's idea of "today" is campus time (app.time-zone), so use the same here.
TODAY = dt.datetime.now(ZoneInfo("America/New_York")).date()
WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
day = lambda d: d.isoformat()
plus = lambda n: day(TODAY + dt.timedelta(days=n))
pretty = lambda iso: dt.date.fromisoformat(iso).strftime("%a %b %-d")


def on(weekday, after=1):
    """The first `weekday` at least `after` days from today. With the default, the seven weekdays land
    on tomorrow ... a week from today: the "next 7 days" this script fills."""
    d = TODAY + dt.timedelta(days=after)
    while WEEKDAYS[d.weekday()] != weekday:
        d += dt.timedelta(days=1)
    return day(d)


# Requests (time off, different hours) are for the week after the 7 days: the Monday at least 8 days away.
NEXT_MONDAY = dt.date.fromisoformat(on("MONDAY", after=8))
nxt = lambda n: day(NEXT_MONDAY + dt.timedelta(days=n))  # nxt(0) Monday, nxt(1) Tuesday, ... nxt(7) the Monday after
WEEKEND_TODAY = TODAY.weekday() >= 5


def term(start, days, kind):
    names = {"FALL": "Fall", "SPRING": "Spring", "SUMMER": "Summer"}
    end = start + dt.timedelta(days=days)
    return {"name": f"{names[kind]} {(start + dt.timedelta(days=days // 2)).year}", "type": kind, "startDate": day(start), "endDate": day(end),
            "weeklyHourLimit": 40 if kind == "SUMMER" else 20}


# The current semester started 11 weeks ago and ends in about 6, so today and every request date are in it.
season = "SPRING" if TODAY.month <= 5 else "SUMMER" if TODAY.month <= 7 else "FALL"
after_season = {"FALL": "SPRING", "SPRING": "SUMMER", "SUMMER": "FALL"}
CURRENT = term(TODAY - dt.timedelta(days=75), 115, season)
NEXT = term(dt.date.fromisoformat(CURRENT["endDate"]) + dt.timedelta(days=32), 115, after_season[season])
LATER = term(dt.date.fromisoformat(NEXT["endDate"]) + dt.timedelta(days=10), 81, after_season[NEXT["type"]])
term_end = dt.date.fromisoformat(CURRENT["endDate"])
next_start = dt.date.fromisoformat(NEXT["startDate"])

# ---- Helpers --------------------------------------------------------------------------------------

failures = []


def step(label, fn):
    try:
        out = fn()
        print(f"  ok   {label}")
        return out
    except api.ApiError as e:
        print(f"  FAIL {label}: {e.status} {e.body[:220]}")
        failures.append(label)
        return None


def rid(r):
    return None if r is None else (r["result"]["id"] if "result" in r else r["id"])


W = lambda *blocks: [{"day": d, "start": s, "end": e} for d, s, e in blocks]
hrs = lambda *b: [{"start": s, "end": e} for s, e in b]

print(f"Filling the test app for {pretty(day(TODAY))} to {pretty(plus(7))} (semester {CURRENT['name']}: {CURRENT['startDate']} to {CURRENT['endDate']})")

print("\n== Admin: first login (the temporary password is replaced)")
admin_email = api.secret("ADMIN_EMAIL")
first = api.Session(admin_email, api.secret("DEV_ADMIN_PASSWORD"), "ADMIN")
step("Replace the temporary password", lambda: first.post("/api/account/password",
     {"currentPassword": api.secret("DEV_ADMIN_PASSWORD"), "newPassword": api.secret("ADMIN_PASSWORD")}))
ad = api.admin()

print("\n== Admin: semesters, holidays, settings")
fall = rid(step(f"Semester {CURRENT['name']} (now)", lambda: ad.post("/api/admin/semesters", CURRENT)))
step(f"Semester {NEXT['name']}", lambda: ad.post("/api/admin/semesters", NEXT))
step(f"Semester {LATER['name']}", lambda: ad.post("/api/admin/semesters", LATER))
break_start = next_start + dt.timedelta(days=50)
for name, frm, to in [("Reading day", plus(-45), None),                                   # already over: under "Show past holidays"
                      ("Campus network maintenance", on("SATURDAY"), None),               # in the 7 days, with an extra shift on it
                      ("Founders Day", nxt(4), None),
                      ("Mid-term break", nxt(10), nxt(11)),
                      ("Term break", day(term_end + dt.timedelta(days=3)), day(term_end + dt.timedelta(days=14))),
                      ("Welcome day", day(next_start - dt.timedelta(days=1)), None),
                      ("Mid-semester break", day(break_start), day(break_start + dt.timedelta(days=4)))]:
    step(f"Holiday {name}", lambda n=name, f=frm, t=to: ad.post("/api/admin/holidays", {"name": n, "from": f, "to": t}))
hol = [h for h in ad.get("/api/admin/holidays") if h["name"] == "Mid-semester break"]
step("Edit a holiday: the mid-semester break moves a week later", lambda: ad.put("/api/admin/holidays", {"ids": [h["id"] for h in hol],
     "holiday": {"name": "Mid-semester break", "from": day(break_start + dt.timedelta(days=7)), "to": day(break_start + dt.timedelta(days=11))}}))

print("\n== Admin: people")
for first_name, last in [("Morgan", "Lee"), ("Priya", "Nair"), ("Daniel", "Okafor"), ("Sam", "Rivera")]:
    step(f"Admin {first_name} {last}", lambda f=first_name, l=last: ad.post("/api/admin/admins", {"firstName": f, "lastName": l, "email": f"{f.lower()}.{l.lower()}@isandt.test"}))
PEOPLE = [("hetvi", "Hetvi", "Shah", "hetvi.shah"), ("alister", "Alister", "Pereira", "alister.p"), ("pratik", "Pratik", "Patel", "pratik.patel"),
          ("grace", "Grace", "Kim", "grace.kim"), ("alex", "Alex", "Romero", "alex.romero"), ("oskar", "Oskar", "Nowakowski", "oskar.nowak"),
          ("adam", "Adam", "Cruz", "adam.cruz"), ("jordan", "Jordan", "Blake", "jordan.blake")]
ID = {}
for i, (key, f, l, mail) in enumerate(PEOPLE):
    ID[key] = rid(step(f"Student {f} {l}", lambda f=f, l=l, m=mail, i=i: ad.post("/api/admin/students", {"firstName": f, "lastName": l, "email": f"{m}@isandt.test", "studentId": f"27000{i + 1:02d}"})))
for key, f, l, mail in PEOPLE[:6]:  # Adam and Jordan never open their link
    step(f"{f} sets a password from the email link", lambda m=mail: api.set_password_from_email(f"{m}@isandt.test", api.secret("STUDENT_PASSWORD")))
step("Alister gets 'Edit tasks' team access", lambda: ad.put(f"/api/admin/students/{ID['alister']}/task-access", {"access": "EDIT"}))
step("Hetvi gets 'View + mark done'", lambda: ad.put(f"/api/admin/students/{ID['hetvi']}/task-access", {"access": "COMPLETE"}))
step("Disable Jordan (left the team)", lambda: ad.post(f"/api/admin/students/{ID['jordan']}/disable"))
admins = ad.get("/api/admin/admins")
step("Settings: digest at 07:30 to the main admin and Morgan, 45-minute default", lambda: ad.put("/api/admin/settings",
     {"digestTime": "07:30", "defaultTaskDuration": 45, "digestRecipientIds": [a["id"] for a in admins if a["email"] in (admin_email, "morgan.lee@isandt.test")]}))

print("\n== Admin: inventory")
cats = {}
for name in ["Monitors", "Laptops", "Docks & adapters", "Cables", "Peripherals", "Printing", "AV equipment"]:
    cats[name] = rid(step(f"Category {name}", lambda n=name: ad.post("/api/admin/inventory/categories", {"name": n})))
rooms = {}
for b, room, d in [("Rhodes Tower", "1408", "Main IS&T storage"), ("Fenn Tower", "FT 404", "Cable closet"), ("Business Building", "B12", "Printer supplies"),
                   ("Main Classroom", "MC 201", "AV cage"), ("Michael Schwartz Library", "LB 300", "Library IT room"), ("Berkman Hall", "BH 120", "Adapter drawer")]:
    rooms[room] = rid(step(f"Room {b} {room}", lambda b=b, r=room, d=d: ad.post("/api/admin/inventory/locations", {"building": b, "room": r, "description": d})))
items = {}
for name, cat, maker, model, low, room, qty in [
        ("Dell P2422H 24-inch monitor", "Monitors", "Dell", "P2422H", 4, "1408", 12), ("LG 34-inch ultrawide", "Monitors", "LG", "34WP65C", 2, "1408", 3),
        ("Dell Latitude 5440 laptop", "Laptops", "Dell", "Latitude 5440", 3, "1408", 8), ("MacBook Air 13-inch", "Laptops", "Apple", "M3", 1, "1408", 2),
        ("USB-C docking station", "Docks & adapters", "Dell", "WD19S", 3, "1408", 6), ("USB-C to HDMI adapter", "Docks & adapters", "Anker", "A8312", 4, "BH 120", 10),
        ("HDMI cable, 6 ft", "Cables", "Amazon Basics", "", 5, "1408", 20), ("Cat6 Ethernet cable, 10 ft", "Cables", "Monoprice", "", 10, "FT 404", 30),
        ("Logitech keyboard and mouse set", "Peripherals", "Logitech", "MK270", 3, "FT 404", 9), ("Logitech C920 webcam", "Peripherals", "Logitech", "C920", 2, "LB 300", 4),
        ("HP 58A toner cartridge", "Printing", "HP", "CF258A", 2, "B12", 3), ("Wireless presenter remote", "AV equipment", "Logitech", "R500", 1, "MC 201", 2)]:
    items[name] = rid(step(f"Item {name} with {qty} in {room}", lambda n=name, c=cat, m=maker, mo=model, lo=low, r=room, q=qty: ad.post("/api/admin/inventory/items",
                      {"categoryId": cats[c], "name": n, "manufacturer": m, "model": mo, "lowStockThreshold": lo, "attributes": {"Kind": c},
                       "startingLocationId": rooms[r], "startingQuantity": q})))
vga = rid(step("Item VGA cable (old), no stock", lambda: ad.post("/api/admin/inventory/items", {"categoryId": cats["Cables"], "name": "VGA cable (old)", "manufacturer": "", "model": "", "lowStockThreshold": 0, "attributes": {}})))
step("Archive the VGA cable", lambda: ad.post(f"/api/admin/inventory/items/{vga}/archive"))
R = rooms
stock = lambda item, room, kind, q, note, to=None: ad.post("/api/admin/inventory/stock", {"itemId": items[item], "locationId": R[room], "type": kind, "quantity": q, "note": note, "toLocationId": R[to] if to else None})
step("Receive 10 more HDMI cables", lambda: stock("HDMI cable, 6 ft", "1408", "ADD", 10, "Delivery from CDW"))
step("Remove 2 broken keyboards", lambda: stock("Logitech keyboard and mouse set", "FT 404", "REMOVE", 2, "Broken, recycled"))
step("Count correction: 28 Ethernet cables", lambda: stock("Cat6 Ethernet cable, 10 ft", "FT 404", "SET", 28, "Shelf count"))
step("Move 5 HDMI cables to MC 201", lambda: stock("HDMI cable, 6 ft", "1408", "MOVE", 5, "For the classroom", "MC 201"))
step("Move 2 monitors to FT 404", lambda: stock("Dell P2422H 24-inch monitor", "1408", "MOVE", 2, "Fenn refresh", "FT 404"))

print("\n== Admin: weekly shifts (Monday to Friday)")
SHIFTS = {
    "hetvi": W(("MONDAY", "09:00", "13:00"), ("WEDNESDAY", "09:00", "13:00"), ("FRIDAY", "09:00", "13:00")),
    "alister": W(("MONDAY", "12:00", "17:00"), ("TUESDAY", "12:00", "17:00"), ("THURSDAY", "12:00", "17:00")),
    "pratik": W(("TUESDAY", "09:00", "15:00"), ("THURSDAY", "09:00", "15:00")),
    "grace": W(("MONDAY", "13:00", "18:00"), ("WEDNESDAY", "13:00", "18:00"), ("FRIDAY", "09:00", "12:00")),
    "alex": W(("TUESDAY", "10:00", "14:00"), ("WEDNESDAY", "10:00", "14:00"), ("THURSDAY", "10:00", "14:00")),
    "oskar": W(("MONDAY", "10:00", "16:00"), ("FRIDAY", "10:00", "16:00")),
}
for key, blocks in SHIFTS.items():
    step(f"Weekly shifts for {key}", lambda k=key, b=blocks: ad.put(f"/api/admin/schedule/students/{ID[k]}/shifts?semesterId={fall}", {"shifts": b, "requestId": None}))

print("\n== Students: class times and preferred hours, submitted")
S = {k: api.student(f"{m}@isandt.test") for k, f, l, m in PEOPLE[:6]}
for key, s in S.items():
    step(f"{key} enters classes and hours, and submits", lambda s=s, k=key: (
        s.put(f"/api/me/schedule/availability?semesterId={fall}", {"classes": W(("TUESDAY", "08:00", "09:15"), ("THURSDAY", "16:00", "17:15")) if k != "alister" else W(("WEDNESDAY", "09:00", "11:30")),
                                                                    "preferred": SHIFTS[k]}),
        s.post(f"/api/me/schedule/submit?semesterId={fall}")))
reqs = ad.get("/api/admin/schedule/requests")
h = next((r for r in reqs if r["studentId"] == ID["hetvi"]), None)
if h:
    step("Admin approves Hetvi's hours as they are", lambda: ad.put(f"/api/admin/schedule/students/{ID['hetvi']}/shifts?semesterId={fall}", {"shifts": SHIFTS["hetvi"], "requestId": h["id"]}))

print("\n== Admin: one-off shift changes (weekends too)")
changes = [("hetvi", {"date": on("FRIDAY"), "type": "CANCEL", "reason": "Conference trip"}),
           ("alex", {"date": on("TUESDAY"), "type": "EXTRA", "start": "14:00", "end": "16:00", "reason": "Covering the help desk"}),
           ("grace", {"date": on("MONDAY"), "type": "OFF", "start": "16:00", "end": "18:00", "reason": "Leaves early for class"}),
           ("oskar", {"date": on("THURSDAY"), "type": "EXTRA", "start": "09:00", "end": "12:00", "reason": "Room refresh"}),
           ("pratik", {"date": on("WEDNESDAY"), "type": "EXTRA", "start": "09:00", "end": "13:00", "reason": "Swapped with Hetvi"}),
           ("alister", {"date": on("SATURDAY"), "type": "EXTRA", "start": "10:00", "end": "14:00", "reason": "Network maintenance standby"}),
           ("grace", {"date": on("SUNDAY"), "type": "EXTRA", "start": "12:00", "end": "16:00", "reason": "Open house"})]
if WEEKEND_TODAY:  # on a weekday Alister may already be working at noon, so this one is only added on a weekend
    changes.insert(0, ("alister", {"date": plus(0), "type": "EXTRA", "start": "12:00", "end": "16:00", "reason": "Weekend lab cover"}))
for key, body in changes:
    r = step(f"{body['type']} for {key} on {pretty(body['date'])}", lambda k=key, b=body: ad.post(f"/api/admin/schedule/students/{ID[k]}/exceptions", b))
    if r and r.get("warnings"):
        print("         warnings:", "; ".join(r["warnings"]))

print("\n== Admin: tasks for the 7 days")


def task(title, date, start, mins, location, kind="FIX", desc="", supplies=(), planned=(), auto=True, employee=None, parent=None):
    return {"type": kind, "title": title, "description": desc, "date": date, "startTime": start, "durationMinutes": mins, "location": location,
            "employeeName": employee[0] if employee else None, "employeeEmail": employee[1] if employee else None, "employeePhone": employee[2] if employee else None,
            "supplies": [{"name": n, "quantity": q} for n, q in supplies],
            "items": [{"itemId": items[n], "locationId": R[r], "quantity": q} for n, r, q in planned],
            "parentTaskId": parent, "autoAssign": auto}


MON, TUE, WED, THU, FRI, SAT, SUN = (on(d) for d in WEEKDAYS)
T = {}
plan = [
    ("lab", task("Lab reset", plus(0), "13:00", 60, "Main Classroom MC 201", desc="Reset PCs after the workshop.")),
    ("paper", task("Restock printer paper", plus(0), "15:00", 30, "Business Building B12", auto=False)),
    ("projector", task("Projector bulb replacement", MON, "09:30", 60, "Main Classroom MC 201", employee=("Dr. Amy Chen", "a.chen@csuohio.test", "216-555-0141"))),
    ("dock", task("Dock setup for Dr. Patel", MON, "11:00", 45, "Rhodes Tower 1520", kind="DEPLOYMENT", planned=[("USB-C docking station", "1408", 1), ("HDMI cable, 6 ft", "1408", 2)], employee=("Dr. Raj Patel", "r.patel@csuohio.test", "216-555-0177"))),
    ("ethernet", task("Ethernet port not working", MON, "14:00", 30, "Fenn Tower FT 410", supplies=[("Cable tester", 1)])),
    ("reimage", task("Laptop reimage", MON, "15:30", 60, "Rhodes Tower 1408", auto=False)),
    ("avcart", task("Check the AV cart", MON, "16:30", 30, "Main Classroom MC 201")),
    ("toner", task("Lab printer toner", TUE, "10:30", 30, "Business Building B12", planned=[("HP 58A toner cartridge", "B12", 1)])),
    ("label", task("Label spare cables", TUE, "11:00", 45, "Fenn Tower FT 404", auto=False)),
    ("desk", task("New staff desk deployment", TUE, "13:00", 90, "Business Building BU 330", kind="DEPLOYMENT", planned=[("Dell P2422H 24-inch monitor", "1408", 2), ("USB-C docking station", "1408", 1), ("Logitech keyboard and mouse set", "FT 404", 1)], employee=("Maria Lopez", "m.lopez@csuohio.test", "216-555-0102"))),
    ("kiosk", task("Library kiosk reboot", TUE, "15:00", 30, "Michael Schwartz Library LB 100")),
    ("smartboard", task("Smart board calibration", WED, "10:00", 30, "Main Classroom MC 201")),
    ("conf", task("Conference room refresh", WED, "10:30", 90, "Berkman Hall BH 150", kind="DEPLOYMENT", planned=[("USB-C to HDMI adapter", "BH 120", 3), ("HDMI cable, 6 ft", "1408", 3), ("Wireless presenter remote", "MC 201", 1)])),
    ("helpdesk", task("Help desk cover", WED, "12:00", 60, "Michael Schwartz Library LB 300", auto=False)),
    ("webcam", task("Webcam install for hybrid room", WED, "13:30", 60, "Michael Schwartz Library LB 210", kind="DEPLOYMENT", planned=[("Logitech C920 webcam", "LB 300", 2)])),
    ("keyboard", task("Keyboard swap", THU, "09:30", 30, "Rhodes Tower 1408", auto=False)),
    ("arm", task("Monitor arm install", THU, "10:00", 60, "Rhodes Tower 1302", supplies=[("Monitor arm", 2), ("Allen key set", 1)])),
    ("wifi", task("Wi-Fi dead zone survey", THU, "14:00", 60, "Berkman Hall 2nd floor", supplies=[("Laptop with Wi-Fi analyser", 1)])),
    ("cables", task("Tidy cables under podium", THU, "15:30", 30, "Main Classroom MC 201", auto=False)),
    ("drill", task("Fire drill: check exit signs", FRI, "09:15", 30, "Rhodes Tower 1st floor")),
    ("handout", task("Faculty laptop handouts", FRI, "10:30", 90, "Rhodes Tower 1408", kind="DEPLOYMENT", planned=[("Dell Latitude 5440 laptop", "1408", 3), ("USB-C to HDMI adapter", "BH 120", 3)])),
    ("count", task("End-of-week stock count", FRI, "11:00", 60, "Rhodes Tower 1408", auto=False)),
    ("printer", task("Printer offline in the Dean's office", FRI, "14:00", 45, "Fenn Tower FT 600", employee=("Linda Park", "l.park@csuohio.test", "216-555-0123"))),
    ("standby", task("Network maintenance standby", SAT, "10:00", 120, "Rhodes Tower 1408 server closet", desc="Be around in case the switch upgrade goes wrong.")),
    ("openhouse", task("Open house: welcome kiosk", SUN, "12:00", 60, "Student Center SC 101", kind="DEPLOYMENT", planned=[("LG 34-inch ultrawide", "1408", 1), ("HDMI cable, 6 ft", "1408", 1)])),
    ("teardown", task("Open house: teardown", SUN, "15:00", 60, "Student Center SC 101", auto=False)),
]
for key, body in plan:
    r = step(f"Task {pretty(body['date'])} {body['startTime']} {body['title']}", lambda b=body: ad.post("/api/admin/tasks", b))
    if r:
        T[key] = r["result"]
        a = r["result"].get("assignee")
        print(f"         -> {r['result']['status']}{' to ' + a['name'] if a else ''}{'  (' + '; '.join(r['warnings']) + ')' if r.get('warnings') else ''}")
tid = lambda k: T[k]["id"]
who = lambda k: ad.get(f"/api/admin/tasks/{tid(k)}")["task"]
step("Give the Wi-Fi survey to Alister", lambda: ad.post(f"/api/admin/tasks/{tid('wifi')}/assign", {"studentId": ID["alister"]}))
r = step("Give the keyboard swap to Adam (no password yet: warned)", lambda: ad.post(f"/api/admin/tasks/{tid('keyboard')}/assign", {"studentId": ID["adam"]}))
if r and r.get("warnings"):
    print("         warnings:", "; ".join(r["warnings"]))
step("Take the keyboard swap back off Adam", lambda: ad.post(f"/api/admin/tasks/{tid('keyboard')}/assign", {"studentId": None}))
kiosk = dict(next(body for key, body in plan if key == "kiosk"))
kiosk["startTime"] = "15:30"
kiosk.pop("autoAssign")
step("Reschedule the kiosk reboot to 15:30", lambda: ad.put(f"/api/admin/tasks/{tid('kiosk')}", kiosk))
step("Cancel the smart board calibration", lambda: ad.post(f"/api/admin/tasks/{tid('smartboard')}/cancel"))

print("\n== Alister (Edit access) uses the student portal")
al = S["alister"]
step("Home, this week, next week", lambda: (al.get("/api/me/today"), al.get("/api/me/week"), al.get(f"/api/me/week?start={MON}")))
step("After logging in: back to the page I was on", lambda: al.put("/api/account/after-login", {"afterLogin": "LAST_PAGE"}))
step("Calendar feed link", lambda: al.get("/api/me/calendar"))
step("Claim 'Restock printer paper' (today)", lambda: al.post(f"/api/me/tasks/{tid('paper')}/claim"))
step("Claim 'Laptop reimage' (Mon)", lambda: al.post(f"/api/me/tasks/{tid('reimage')}/claim"))
step("Claim 'Tidy cables' (Thu)", lambda: al.post(f"/api/me/tasks/{tid('cables')}/claim"))
step("Claim 'Keyboard swap' (Thu 09:30, off shift)", lambda: al.post(f"/api/me/tasks/{tid('keyboard')}/claim"))
step("Give back 'Tidy cables' (opt out)", lambda: al.post(f"/api/me/tasks/{tid('cables')}/opt-out"))
lab = who("lab")
if lab["assignee"] and lab["assignee"]["id"] == ID["alister"]:
    step("Mark 'Lab reset' done", lambda: al.post(f"/api/me/tasks/{tid('lab')}/complete", {"notes": "All 24 PCs reset.", "used": {}}))
else:
    owner = next((s for k, s in S.items() if lab["assignee"] and ID[k] == lab["assignee"]["id"]), None)
    if owner:
        step(f"{lab['assignee']['name']} marks 'Lab reset' done", lambda: owner.post(f"/api/me/tasks/{tid('lab')}/complete", {"notes": "All 24 PCs reset.", "used": {}}))
step("Mark 'Restock printer paper' couldn't do", lambda: al.post(f"/api/me/tasks/{tid('paper')}/not-completed", {"notes": "Supply room was locked.", "used": {}}))
col = step("Who could take the reimage", lambda: al.get(f"/api/me/tasks/{tid('reimage')}/colleagues"))
free = [c for c in (col or []) if c.get("available")]
if free:
    step(f"Hand off the reimage to {free[0]['name']}", lambda: al.post(f"/api/me/tasks/{tid('reimage')}/hand-off", {"studentId": free[0]["id"]}))
t1 = step("Team: create 'Replace clicker batteries' (Tue 12:30)", lambda: al.post("/api/me/team/tasks", task("Replace clicker batteries", TUE, "12:30", 30, "Main Classroom MC 201", supplies=[("AAA batteries", 8)])))
t2 = step("Team: create 'Help desk cover, Friday' (Fri 12:00)", lambda: al.post("/api/me/team/tasks", task("Help desk cover, Friday", FRI, "12:00", 60, "Michael Schwartz Library LB 300", auto=False)))
if t1:
    e = task("Replace clicker batteries", TUE, "12:45", 30, "Main Classroom MC 201", supplies=[("AAA batteries", 12)])
    e.pop("autoAssign")
    step("Team: edit it (12:45, 12 batteries)", lambda: al.put(f"/api/me/team/tasks/{rid(t1)}", e))
if t2:
    step("Team: assign 'Help desk cover, Friday' to Oskar", lambda: al.post(f"/api/me/team/tasks/{rid(t2)}/assign", {"studentId": ID["oskar"]}))
t3 = step("Team: create a duplicate to cancel", lambda: al.post("/api/me/team/tasks", task("Duplicate request", THU, "16:00", 30, "Rhodes Tower 1408", auto=False)))
if t3:
    step("Team: cancel the duplicate", lambda: al.post(f"/api/me/team/tasks/{rid(t3)}/cancel"))

print("\n== Requests: time off and shift changes (the one 'Ask for a change' form)")
for key, body in [("hetvi", {"date": nxt(0), "reason": "Doctor's appointment"}), ("hetvi", {"date": nxt(2), "start": "09:00", "end": "11:00", "reason": "Midterm"}),
                  ("alister", {"date": nxt(1), "start": "13:00", "end": "15:00", "reason": "Group project"}), ("pratik", {"date": nxt(1), "reason": "Family event"}),
                  ("grace", {"date": nxt(2), "start": "13:00", "end": "15:00", "reason": "Exam"}), ("alex", {"date": WED, "reason": "Sick"}),
                  ("oskar", {"date": FRI, "start": "14:00", "end": "16:00", "reason": "Dentist"}), ("alister", {"date": nxt(7), "reason": "Trip"})]:
    step(f"{key} asks for time off {pretty(body['date'])}", lambda k=key, b=body: S[k].post("/api/me/time-off", b))
trip = next((t for t in al.get("/api/me/time-off") if t["reason"] == "Trip"), None)
if trip:
    step("Alister withdraws his Trip request", lambda: al.post(f"/api/me/time-off/{trip['id']}/withdraw"))
for key, body in [("alister", {"scope": "EVERY_WEEK", "date": nxt(3), "hours": hrs(("13:00", "17:00")), "note": "Lab moves to Thursday mornings"}),
                  ("alister", {"scope": "ONE_DAY", "date": nxt(8), "hours": hrs(("12:00", "18:00")), "note": "Can stay late"}),
                  ("alister", {"scope": "ONE_DAY", "date": nxt(0), "hours": [], "note": "Can't make it"}),
                  ("hetvi", {"scope": "ONE_DAY", "date": nxt(0), "hours": hrs(("10:00", "14:00")), "note": "Later start"}),
                  ("pratik", {"scope": "EVERY_WEEK", "date": nxt(8), "hours": hrs(("10:00", "16:00")), "note": "New class schedule"}),
                  ("grace", {"scope": "ONE_DAY", "date": nxt(7), "hours": [], "note": "Career fair"}),
                  ("alex", {"scope": "ONE_DAY", "date": nxt(5), "hours": hrs(("10:00", "13:00")), "note": "Free on Saturday"}),
                  ("oskar", {"scope": "EVERY_WEEK", "date": nxt(11), "hours": hrs(("09:00", "15:00")), "note": "Earlier Fridays"}),
                  ("oskar", {"scope": "ONE_DAY", "date": nxt(0), "hours": hrs(("09:00", "12:00")), "note": "Morning only"})]:
    step(f"{key} asks for different hours {body['scope']} {pretty(body['date'])}", lambda k=key, b=body: S[k].post("/api/me/schedule/changes", b))
mon = next((c for c in al.get("/api/me/schedule/changes") if c["date"] == nxt(0) and c["status"] == "PENDING"), None)
if mon:
    step("Alister withdraws the Monday change", lambda: al.post(f"/api/me/schedule/changes/{mon['id']}/withdraw"))

print("\n== Offers: 'I can do this' on someone else's task")
for key, task_key, note in [("alister", "webcam", "I set up the other hybrid room"), ("alister", "printer", "I know that printer"), ("hetvi", "toner", "I'm in B12 anyway"),
                            ("pratik", "conf", "I'm free Wednesday morning"), ("grace", "ethernet", "On my way past"), ("alex", "arm", "Did the last one"),
                            ("oskar", "drill", "I'm in early"), ("pratik", "wifi", "I have the analyser"),
                            # two more on weekend tasks nobody finishes below, so five are still waiting after
                            # the admin answers two and finishing a deployment closes the offers on it
                            ("grace", "standby", "Happy to do the Saturday"), ("hetvi", "openhouse", "I can come in Sunday")]:
    t = who(task_key)
    if t["status"] == "ASSIGNED" and t["assignee"]["id"] != ID[key]:
        step(f"{key} offers to take '{t['title']}' (now {t['assignee']['name']})", lambda k=key, tk=task_key, n=note: S[k].post(f"/api/me/team/tasks/{tid(tk)}/offer", {"note": n}))
    else:
        print(f"         ({task_key} is {t['status']}{', already theirs' if t.get('assignee') and t['assignee']['id'] == ID[key] else ''}: no offer)")

print("\n== Admin answers some requests (leaving at least five of each waiting)")
pend = ad.get("/api/admin/time-off")
a = next((t for t in pend if t["studentName"].startswith("Alex")), None)
if a:
    step("Approve Alex's sick day (his tasks move)", lambda: ad.post(f"/api/admin/time-off/{a['id']}/approve", {"note": "Feel better!"}))
o = next((t for t in pend if t["studentName"].startswith("Oskar")), None)
if o:
    step("Decline Oskar's dentist request", lambda: ad.post(f"/api/admin/time-off/{o['id']}/decline", {"note": "We need you for the handouts; can you move it?"}))
ch = [c for c in ad.get("/api/admin/schedule/changes") if c["status"] == "PENDING"]
ew = next((c for c in ch if c["studentName"].startswith("Alister") and c["scope"] == "EVERY_WEEK"), None)
if ew:
    step(f"Approve Alister's 'every Thursday from {pretty(nxt(3))}' (earlier Thursdays keep 12-17)", lambda: ad.post(f"/api/admin/schedule/changes/{ew['id']}/approve", {"note": "OK"}))
od = next((c for c in ch if c["studentName"].startswith("Oskar") and c["scope"] == "ONE_DAY"), None)
if od:
    step("Decline Oskar's Monday morning", lambda: ad.post(f"/api/admin/schedule/changes/{od['id']}/decline", {"note": "Not that week."}))
offers = ad.get("/api/admin/task-offers")
if offers:
    step(f"Accept {offers[0]['studentName']}'s offer for {offers[0]['taskTitle']}", lambda: ad.post(f"/api/admin/task-offers/{offers[0]['id']}/accept"))
    offers = ad.get("/api/admin/task-offers")
    if offers:
        step(f"Decline {offers[-1]['studentName']}'s offer for {offers[-1]['taskTitle']}", lambda: ad.post(f"/api/admin/task-offers/{offers[-1]['id']}/decline"))

print("\n== Deployments finished short (missing items), and a follow-up")


def finish_short(key):
    t = who(key)
    if t["status"] != "ASSIGNED":
        print(f"         ({key} is {t['status']}, skipped)")
        return
    owner = next((s for k, s in S.items() if ID[k] == t["assignee"]["id"]), None)
    used = {str(i["id"]): max(0, i["quantityPlanned"] - 1) for i in t["items"]}
    if owner:
        step(f"{t['assignee']['name']} finishes '{t['title']}' one short of each item", lambda: owner.post(f"/api/me/tasks/{tid(key)}/complete", {"notes": "Done, one of each was missing.", "used": used}))


for key in ["dock", "desk", "conf"]:
    finish_short(key)
projector = who("projector")
if projector["status"] == "ASSIGNED" and projector["assignee"]["id"] != ID["hetvi"]:
    step(f"Hetvi marks the projector bulb done for {projector['assignee']['name']} (View + mark done)", lambda: S["hetvi"].post(f"/api/me/team/tasks/{tid('projector')}/complete", {"notes": "Bulb swapped.", "used": {}}))
elif projector["status"] == "ASSIGNED":
    step("Hetvi marks her projector bulb done", lambda: S["hetvi"].post(f"/api/me/tasks/{tid('projector')}/complete", {"notes": "Bulb swapped.", "used": {}}))
bo = ad.get("/api/admin/tasks/backorders")
print(f"         missing items now: {len(bo)}")
if bo:
    t = bo[0]["task"]
    f = task(f"Follow-up: {t['title']}", nxt(0), "11:00", 30, t["location"], kind="DEPLOYMENT", parent=t["id"])
    f["items"] = [{"itemId": b["itemId"], "locationId": b["locationId"], "quantity": b["missing"]} for b in bo if b["task"]["id"] == t["id"] and "itemId" in b]
    step("Admin schedules a follow-up deployment", lambda: ad.post("/api/admin/tasks", f))

print("\nFailures:", failures or "none")
raise SystemExit(1 if failures else 0)
