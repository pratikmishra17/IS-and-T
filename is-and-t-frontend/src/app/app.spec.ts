import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { Auth, User } from './services/auth';
import { addDays, mondayOf } from './ui/month-picker';

const admin: User = {
  id: 1,
  email: 'admin@example.com',
  firstName: 'Ada',
  lastName: 'Admin',
  studentId: null,
  role: 'ADMIN',
  status: 'ACTIVE',
  passwordSet: true,
  createdAt: '2026-10-21T12:00:00Z',
};

const student: User = { ...admin, id: 1, email: 'sam@example.com', firstName: 'Sam', role: 'STUDENT', studentId: '2001' };

// The test browser (jsdom) has no <dialog> methods; side panels and dialogs call them.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

describe('App routing', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    // Pages remember tabs and filters in browser storage: start every test from a clean slate.
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Logs in through the real Auth service, answering its HTTP call with a fake backend response. */
  async function logInAs(user: User, mustChangePassword = false): Promise<void> {
    const login = TestBed.inject(Auth).login(user.email, 'password', user.role);
    http.expectOne('/api/auth/login').flush({ user, idleTimeoutSeconds: 1800, expiresAt: null, mustChangePassword });
    await login;
  }

  function heading(harness: RouterTestingHarness): string | undefined {
    return harness.routeNativeElement?.querySelector('h1')?.textContent ?? undefined;
  }

  it('sends visitors who are not logged in to the user login page', async () => {
    const harness = await RouterTestingHarness.create('/home');

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(heading(harness)).toContain('Welcome back.');
  });

  it('shows a student their day: what’s next, today’s timeline and the week’s hours', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/home');
    const today = new Date().toLocaleDateString('en-CA');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/today').flush({
      date: today, holiday: null, dayOff: false, shifts: [{ start: '00:00', end: '23:59', extra: false }],
      tasks: [{
        id: 9, type: 'FIX', title: 'Printer offline', description: null, date: today, startTime: '23:30', endTime: '23:59', durationMinutes: 29,
        location: 'BU 201', employee: { name: 'Pat', email: null, phone: null }, supplies: [], status: 'ASSIGNED',
        assignee: { id: 1, name: 'Sam Admin' }, claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null, items: [],
      }],
      upForGrabsToday: 2, weekHours: 12, weeklyHourLimit: 20, semesterName: 'Fall 2026', request: null,
    });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = harness.routeNativeElement!.textContent!;

    expect(text).toContain(', Sam.');
    expect(text).toContain('Next up');
    expect(text).toContain('Printer offline');
    expect(text).toContain('of 20');
    expect(text).toContain('2 tasks need someone');
  });

  it('sends visitors to the admin portal to the admin login page', async () => {
    const harness = await RouterTestingHarness.create('/admin');

    expect(TestBed.inject(Router).url).toBe('/admin/login');
    expect(harness.routeNativeElement?.textContent).toContain('Admin portal');
  });

  it('opens the admin dashboard for the admin, flagging people without a password', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin');
    http.expectOne('/api/admin/students').flush([{ ...student, passwordSet: false }]);
    http.expectOne('/api/admin/admins').flush([admin]);
    http.expectOne('/api/admin/semesters').flush([]);
    http.expectOne('/api/admin/holidays').flush([]);
    http.expectOne('/api/admin/inventory/items').flush([]);
    http.expectOne('/api/admin/schedule/week').flush({ start: '2026-10-19', days: [], students: [], weeklyHourLimit: null, semesterName: null });
    http.expectOne((request) => request.url === '/api/admin/tasks').flush([]);
    http.expectOne('/api/admin/time-off/count').flush({ pending: 1 });
    http.expectOne('/api/admin/schedule/changes').flush([{ id: 3 }]);
    http.expectOne('/api/admin/task-offers').flush([]);
    http.expectOne('/api/admin/schedule/requests').flush([]);
    http.expectOne('/api/admin/tasks/backorders').flush([]);
    // On a quiet weekend the shift and task cards load Monday instead
    await new Promise((resolve) => setTimeout(resolve));
    http.match((request) => request.url === '/api/admin/schedule/week')
      .forEach((request) => request.flush({ start: '2026-10-19', days: [], students: [], weeklyHourLimit: null, semesterName: null }));
    http.match((request) => request.url === '/api/admin/tasks').forEach((request) => request.flush([]));
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(heading(harness)).toContain('Welcome back, Ada.');
    expect(harness.routeNativeElement?.textContent).toContain('Sam Admin');
    expect(harness.routeNativeElement?.textContent).toContain('Resend link');
    expect(harness.routeNativeElement?.textContent).toContain('No semester covers today');
    expect(harness.routeNativeElement?.textContent).toContain('1 time-off request to answer');
    expect(harness.routeNativeElement?.textContent).toContain('1 shift change to answer'); // every kind of request, not just time off
  });

  it('shows the stock of each item per room and flags low stock', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/inventory');
    http.expectOne('/api/admin/inventory/items').flush([{
      id: 1, categoryId: 1, categoryName: 'Monitors', name: 'Dell P2422H', manufacturer: 'Dell', model: 'P2422H',
      trackingType: 'COUNT', lowStockThreshold: 5, attributes: { Size: '24 in' }, archived: false,
      onHand: 3, reserved: 0, available: 3, lowStock: true, stock: [{ locationId: 1, label: 'RT 1408', quantity: 3 }],
    }]);
    http.expectOne('/api/admin/inventory/categories').flush([{ id: 1, name: 'Monitors', itemCount: 1 }]);
    http.expectOne('/api/admin/inventory/locations').flush([{ id: 1, building: 'RT', room: '1408', description: null, label: 'RT 1408', unitsStored: 3 }]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const row = harness.routeNativeElement!.querySelector('tbody tr')!;

    expect(row.textContent).toContain('RT 1408: 3');
    expect(row.textContent).toContain('Size: 24 in');
    expect(row.textContent).toContain('Low (≤ 5)');
  });

  it('lets a student enter class times and preferred hours for a semester', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/schedule');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/week').flush({ start: '2026-10-19', days: [], hours: 0, weeklyHourLimit: 20, semesterName: 'Fall 2026' });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/schedule/semesters').flush([{ id: 5, name: 'Fall 2026', type: 'FALL', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true }]);
    await harness.fixture.whenStable();
    http.expectOne((request) => request.url === '/api/me/schedule' && request.params.get('semesterId') === '5').flush({
      studentId: 1, studentName: 'Sam Student', semester: { id: 5, name: 'Fall 2026', type: 'FALL', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true },
      classes: [{ day: 'TUESDAY', start: '10:00', end: '11:15' }], preferred: [], shifts: [], weeklyHours: 0, request: null, exceptions: [],
    });
    http.expectOne((request) => request.url === '/api/me/schedule/hours').flush([]);
    // The page loads in steps (week, semesters, then that semester's schedule): let them all finish.
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(); // "My hours"
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(page.textContent).toContain('Not submitted yet');
    expect(page.querySelector<HTMLInputElement>('#class-start-0')!.value).toBe('10:00');
    expect(page.querySelector<HTMLButtonElement>('button.submit-button')!.disabled).toBe(true); // nothing to submit yet
  });

  it('lets a student complete, hand off or opt out of their task, and claim unassigned ones', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/tasks');
    const task = {
      id: 9, type: 'DEPLOYMENT', title: 'New hire setup', description: null, date: '2026-10-21', startTime: '10:00', endTime: '10:30',
      durationMinutes: 30, location: 'RT 1408', employee: { name: 'Pat Employee', email: null, phone: '216-555-0100' }, supplies: [{ name: 'Webcam', quantity: 1 }],
      status: 'ASSIGNED', assignee: { id: 1, name: 'Sam Admin' }, claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null,
      items: [{ id: 3, itemId: 1, itemName: 'Dell P2422H', locationId: 1, locationLabel: 'RT 1408', quantityPlanned: 2, quantityUsed: null, status: 'RESERVED' }],
    };
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/tasks').flush({
      upcoming: [task], available: [{ ...task, id: 10, title: 'Fix printer', status: 'UNASSIGNED', assignee: null, items: [] }],
      availableDuringMyShifts: [10], recent: [],
    });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    expect(page.textContent).not.toContain('2 × Dell P2422H'); // details start folded
    [...page.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Details')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = page.textContent!;

    expect(text).toContain('New hire setup');
    expect(text).toContain('2 × Dell P2422H');
    expect(text).toContain('Call 216-555-0100');
    expect(text).toContain('Couldn’t complete');
    expect(text).toContain('Claim this task');
  });

  /**
   * Opens the Planner with one student's week and two tasks (one theirs, one unassigned). `counts`
   * fills what the tab numbers count (nothing waiting, no tasks today, unless given).
   */
  async function openPlanner(url = '/admin/planner', counts: { today?: object[]; requests?: object[]; timeOff?: object[]; backorders?: object[]; changes?: object[]; offers?: object[] } = {}): Promise<RouterTestingHarness> {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create(url);
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const task = (id: number, title: string, status: string, assignee: { id: number; name: string } | null) => ({
      id, type: 'FIX', title, description: null, date: days[0], startTime: '11:00', endTime: '11:30', durationMinutes: 30,
      location: 'BU 201', employee: { name: 'Pat', email: null, phone: null }, supplies: [], status, assignee,
      claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null, items: [],
    });
    http.expectOne((request) => request.url === '/api/admin/schedule/week').flush({
      start: days[0], weeklyHourLimit: 20, semesterName: 'Fall 2026',
      days: days.map((date) => ({ date, holiday: date === '2026-10-23' ? 'Fall Break' : null })),
      students: [{
        studentId: 1, name: 'Sam Student', hours: 22, overLimit: true,
        days: days.map((date) => ({
          date, cancelled: date === '2026-10-20', timeOff: date === '2026-10-22' ? [{ start: '10:00', end: '11:00' }] : [],
          shifts: date === days[0] ? [{ start: '09:00', end: '13:00', extra: false }, { start: '15:00', end: '17:00', extra: true }] : [],
        })),
      }],
    });
    // Two task lists are asked for: the week on screen, and today (for the Task list tab's number)
    const weekTasks = [task(9, 'Printer offline', 'UNASSIGNED', null), task(10, 'Dock setup', 'ASSIGNED', { id: 1, name: 'Sam Student' })];
    http.match((request) => request.method === 'GET' && request.url === '/api/admin/tasks').forEach((request) =>
      request.flush(request.request.params.get('from') === request.request.params.get('to') ? counts.today ?? [] : weekTasks));
    http.expectOne('/api/admin/schedule/requests').flush(counts.requests ?? []);
    http.expectOne('/api/admin/time-off').flush(counts.timeOff ?? []);
    http.expectOne('/api/admin/tasks/backorders').flush(counts.backorders ?? []);
    http.expectOne('/api/admin/schedule/changes').flush(counts.changes ?? []);
    http.expectOne('/api/admin/task-offers').flush(counts.offers ?? []);
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness;
  }

  it('shows one day as a timeline: shifts as bars, tasks on top, unassigned ones first', async () => {
    const harness = await openPlanner('/admin/planner?view=day&date=2026-10-19');
    const page = harness.fixture.nativeElement as HTMLElement;
    const text = page.textContent!;

    expect(text).toContain('Monday, October 19, 2026');
    const timeline = page.querySelector('app-day-timeline')!;
    const rows = timeline.querySelectorAll('.day-track');
    expect(rows[0].textContent).toContain('Printer offline'); // the unassigned row
    expect(rows[1].textContent).toContain('Dock setup'); // Sam's row
    expect(rows[1].textContent).toContain('09:00–13:00');
    expect(rows[1].textContent).toContain('Extra shift 15:00–17:00');

    // Clicking an empty spot in Sam's row starts a task for Sam on that day
    const track = rows[1] as HTMLElement;
    Object.defineProperty(track, 'clientWidth', { value: 1200 });
    track.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 50, width: 1200, height: 50, x: 0, y: 0, toJSON: () => ({}) });
    // A press and release without dragging, halfway across 7 AM–7 PM: a 30-minute task at 1 PM
    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 600, button: 0 }));
    track.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 600 }));
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/admin/settings').flush({ digestTime: '08:00', defaultTaskDuration: 30, admins: [] });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/admin/inventory/items').flush([]);
    http.expectOne('/api/admin/inventory/locations').flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne((r) => r.url === '/api/admin/tasks/availability').flush([{ id: 1, name: 'Sam Student', eligible: true, note: null }]);
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(page.querySelector<HTMLInputElement>('#task-date')!.value).toBe('2026-10-19');
    expect(page.querySelector<HTMLInputElement>('#task-start')!.value).toBe('13:00');
    expect(page.querySelector<HTMLInputElement>('#task-duration')!.value).toBe('30');
    expect(page.querySelector<HTMLSelectElement>('#task-who')!.selectedOptions[0].textContent?.trim()).toBe('Sam Student ✓');
  });

  it('gives a task to someone when it is dragged onto their row, and keeps tasks below the shift strip', async () => {
    const harness = await openPlanner('/admin/planner?view=day&date=2026-10-19');
    const timeline = harness.fixture.nativeElement.querySelector('app-day-timeline') as HTMLElement;
    const tracks = timeline.querySelectorAll<HTMLElement>('.day-track');

    // Sam's task sits under the shift strip, not on top of it
    const samsTask = tracks[1].querySelector<HTMLElement>('[data-task="10"]')!;
    expect(samsTask.style.top).toBe('2.125rem');
    expect(tracks[1].querySelector('.day-shift')!.textContent).toContain('Shift 09:00–13:00');

    // Drag the unassigned "Printer offline" onto Sam's row
    const task = tracks[0].querySelector<HTMLElement>('[data-task="9"]')!;
    expect(task.getAttribute('draggable')).toBe('true');
    task.dispatchEvent(new Event('dragstart', { bubbles: true }));
    harness.detectChanges();
    const samsRow = tracks[1].parentElement!;
    expect(samsRow.classList).toContain('drop-ready');
    expect(tracks[0].parentElement!.classList).not.toContain('drop-ready'); // it's already unassigned
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    tracks[1].dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true); // the browser is told a drop is allowed here
    tracks[1].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));

    const assign = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/tasks/9/assign');
    expect(assign.request.body).toEqual({ studentId: 1 });
  });

  it('remembers the Planner view after going to another page and back', async () => {
    const harness = await openPlanner('/admin/planner?view=day&date=2026-10-19');
    await harness.navigateByUrl('/admin/users');
    http.match(() => true).forEach((request) => request.flush([]));
    await harness.navigateByUrl('/admin/planner'); // the sidebar link: no view in the address
    await new Promise((resolve) => setTimeout(resolve));

    expect(TestBed.inject(Router).url).toBe('/admin/planner?view=day&date=2026-10-19');
  });

  it('shows how many are left on the Task list, Student requests (time off included) and missing items tabs', async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const todays = (id: number, status: string) => ({ id, date: today, status });
    const harness = await openPlanner('/admin/planner', {
      today: [todays(20, 'UNASSIGNED'), todays(21, 'ASSIGNED'), todays(22, 'COMPLETED'), todays(23, 'CANCELLED')],
      requests: [{ id: 1 }],
      changes: [{ id: 3 }],
      timeOff: [{ id: 4, date: today, affectedTasks: [] }],
      backorders: [{ plannedItemId: 5 }],
    });
    const tab = (name: string) => [...harness.routeNativeElement!.querySelectorAll('[role="tab"]')].find((t) => t.textContent!.includes(name))!;

    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe('Shifts & tasks');
    expect(tab('Task list').textContent).toContain('2 tasks left to do today'); // the done and cancelled ones don't count
    expect(tab('Student requests').textContent).toContain('3 student requests waiting for you'); // hours + a shift change + time off
    expect(tab('Missing items').textContent).toContain('1 missing item for tasks');
    expect(tab('Student requests').querySelector('.badge')!.className).toContain('bg-amber-100'); // waiting: amber
    expect(tab('Task list').querySelector('.badge')!.className).toContain('bg-slate-200/70'); // just today's tasks: grey
    expect(harness.routeNativeElement!.textContent).not.toContain('Time-off requests'); // time off is under Student requests now
  });

  it('sends the old Tasks and Schedules pages to the Planner', async () => {
    await logInAs(admin);
    await RouterTestingHarness.create('/admin/tasks');
    expect(TestBed.inject(Router).url).toBe('/admin/planner?view=list');
  });

  it('shows everyone’s shifts and tasks for the week on the Planner', async () => {
    const harness = await openPlanner();
    const page = harness.routeNativeElement!;
    const text = page.textContent!;

    expect(text).toContain('09:00–13:00');
    expect(text).toContain('15:00–17:00');
    expect(text).toContain('Day off');
    expect(text).toContain('Fall Break');
    expect(text).toContain('Off 10:00–11:00');
    expect(text).toContain('1 task needs someone');
    expect(page.querySelector('th span.text-rose-800')?.textContent).toContain('22');
    // The unassigned task is in the Unassigned row, Sam's task in Sam's row
    const rows = page.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Printer offline');
    expect(rows[1].textContent).toContain('Dock setup');
  });

  it('opens a student’s weekly shift editor from the Schedule button next to their name', async () => {
    const harness = await openPlanner();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[aria-label="Edit Sam Student’s schedule"]')!.click();
    const semester = { id: 3, name: 'Fall 2026', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true };
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/admin/semesters').flush([semester]);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne((request) => request.url === '/api/admin/schedule/students/1').flush({
      studentId: 1, studentName: 'Sam Student', semester, classes: [], preferred: [],
      shifts: [{ day: 'MONDAY', start: '09:00', end: '13:00' }], weeklyHours: 4, request: null, exceptions: [],
    });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const panel = harness.fixture.nativeElement as HTMLElement;

    expect(panel.querySelector('app-shift-week-editor [role="tab"][aria-selected="true"]')?.textContent).toContain('Calendar');
    expect(panel.querySelectorAll('[data-shift]').length).toBe(1);
  });

  it('lists a student’s time off and shift changes together, and asks for time off with the one change form', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/schedule');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/week').flush({ start: '2026-10-19', days: [], hours: 0, weeklyHourLimit: null, semesterName: null });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/schedule/semesters').flush([]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click(); // "My requests"
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    http.expectOne('/api/me/time-off').flush([{ id: 3, studentId: 1, studentName: 'Sam', date: '2026-10-20', start: null, end: null,
      reason: null, status: 'APPROVED', submittedAt: '2026-10-15T12:00:00Z', reviewedAt: null, reviewNote: 'Good luck!', affectedTasks: [] }]);
    http.expectOne('/api/me/schedule/changes').flush([{ id: 7, studentId: 1, studentName: 'Sam', scope: 'ONE_DAY', date: '2026-10-22', day: 'THURSDAY',
      hours: [{ start: '12:00', end: '16:00' }], currentHours: [{ start: '09:00', end: '12:00' }], note: null, status: 'PENDING',
      submittedAt: '2026-10-16T12:00:00Z', reviewNote: null }]);
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(page.textContent).toContain('Time off · Tue, Oct 20');
    expect(page.textContent).toContain('Good luck!');
    expect(page.textContent).toContain('Different hours · Thu, Oct 22 only');
    expect(page.textContent).toContain('12:00–16:00 (now 09:00–12:00)');

    // Ask for a change: time off for one of that day's shifts
    [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ask for a change')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    const today = new Date().toLocaleDateString('en-CA');
    http.expectOne((r) => r.url === '/api/me/week' && r.params.get('start') === today).flush({ start: today, hours: 0, weeklyHourLimit: null, semesterName: null,
      days: [{ date: today, holiday: null, dayOff: false, timeOff: [], tasks: [], shifts: [{ start: '09:00', end: '12:00', extra: false }, { start: '14:00', end: '17:00', extra: false }] }] });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const panel = document.querySelector('app-change-request')!;
    expect(panel.textContent).toContain('You work 09:00–12:00, 14:00–17:00 that day now.');
    panel.querySelector<HTMLInputElement>('input[name="off-kind"][data-option="shift"]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const select = panel.querySelector<HTMLSelectElement>('#off-shift')!;
    select.value = '14:00-17:00';
    select.dispatchEvent(new Event('change'));
    panel.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await new Promise((resolve) => setTimeout(resolve));

    const sent = http.expectOne((r) => r.method === 'POST' && r.url === '/api/me/time-off');
    expect(sent.request.body).toEqual({ date: today, start: '14:00', end: '17:00', reason: '' });
  });

  it('groups consecutive holiday days into one row on the calendar page', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/calendar');
    http.expectOne('/api/admin/semesters').flush([]);
    http.expectOne('/api/admin/holidays').flush([
      { id: 1, date: '2099-03-15', name: 'Spring Break', source: 'MANUAL' },
      { id: 2, date: '2099-03-16', name: 'Spring Break', source: 'MANUAL' },
      { id: 3, date: '2099-03-17', name: 'Spring Break', source: 'MANUAL' },
      { id: 4, date: '2099-11-26', name: 'Thanksgiving', source: 'ICS_IMPORT' },
    ]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const rows = harness.routeNativeElement!.querySelectorAll('[aria-labelledby="holidays-title"] li');

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('3 days');
    expect(rows[1].textContent).toContain('Imported');
  });

  it('lists, searches and filters users in the admin portal', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/users');
    http.expectOne('/api/admin/students').flush([student, { ...student, id: 2, firstName: 'Rita', email: 'rita@example.com', studentId: '2002' }]);
    http.expectOne('/api/admin/admins').flush([admin]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    expect(page.querySelectorAll('tbody tr').length).toBe(2);

    const search = page.querySelector<HTMLInputElement>('#user-search')!;
    search.value = '2002';
    search.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(page.querySelectorAll('tbody tr').length).toBe(1);
    expect(page.querySelector('tbody')?.textContent).toContain('Rita');
  });

  it('keeps students out of the admin portal', async () => {
    await logInAs(student);
    await RouterTestingHarness.create('/admin');

    expect(TestBed.inject(Router).url).toBe('/home');
  });

  it('checks with the backend before opening a page, and sends an ended session to the login page', async () => {
    await logInAs(student);
    TestBed.inject(Auth).lastContact = 0; // the backend hasn't answered for a while
    const harness = RouterTestingHarness.create('/tasks');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/auth/me').flush(null, { status: 204, statusText: 'No Content' }); // e.g. the server restarted
    await harness;

    expect(TestBed.inject(Router).url).toBe('/login?ended=ended');
    expect((await harness).routeNativeElement?.textContent).toContain('Your session has ended.');
  });

  it('only opens the account page until a temporary password is replaced', async () => {
    await logInAs(admin, true);
    const harness = await RouterTestingHarness.create('/admin/users');

    expect(TestBed.inject(Router).url).toBe('/admin/account');
    expect(harness.routeNativeElement?.textContent).toContain('Choose a new password to continue.');
  });

  it('explains on the login page why someone was signed out', async () => {
    const harness = await RouterTestingHarness.create('/login?ended=idle');

    expect(harness.routeNativeElement?.textContent).toContain('no activity for a while');
  });

  it('logs out from the account menu and goes straight to the login page', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/account');
    const page: HTMLElement = harness.fixture.nativeElement;

    page.querySelector<HTMLButtonElement>('button[aria-label^="Account menu"]')!.click();
    harness.detectChanges();
    const logout = [...page.querySelectorAll('button')].find((button) => button.textContent?.includes('Log out'))!;
    logout.click();
    http.expectOne('/api/auth/logout').flush(null);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/auth/me').flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Auth).isLoggedIn()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('keeps admins out of the student portal', async () => {
    await logInAs(admin);
    await RouterTestingHarness.create('/home');
    await new Promise((resolve) => setTimeout(resolve));
    http.match(() => true).forEach((request) => request.flush([])); // the admin dashboard's data

    expect(TestBed.inject(Router).url).toBe('/admin');
  });

  it('sends the portal with the login, and points to the other portal when refused', async () => {
    const harness = await RouterTestingHarness.create('/login');
    const page = harness.routeNativeElement!;
    const auth = TestBed.inject(Auth);
    const login = auth.login('ada@example.com', 'secret', 'STUDENT');
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body.portal).toBe('STUDENT');
    request.flush({ detail: 'This is the student portal. Admins log in at the admin portal.' }, { status: 403, statusText: 'Forbidden' });
    await expect(login).rejects.toBeTruthy();
    expect(auth.isLoggedIn()).toBe(false);
    expect(page).toBeTruthy();
  });

  it('keeps each login page’s typed email to itself, but carries it over to the other portal when sent there', async () => {
    const harness = await RouterTestingHarness.create('/login');
    const emailBox = () => harness.routeNativeElement!.querySelector<HTMLInputElement>('#login-email')!;
    const typeInto = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    typeInto(emailBox(), 'ada@example.com');
    await harness.navigateByUrl('/admin/login');
    await harness.fixture.whenStable();
    expect(emailBox().value).toBe(''); // a student's email doesn't turn up on the admin login

    await harness.navigateByUrl('/login');
    await harness.fixture.whenStable();
    expect(emailBox().value).toBe('ada@example.com');

    // Wrong portal: the link to the other one takes the email along
    typeInto(harness.routeNativeElement!.querySelector<HTMLInputElement>('#login-password')!, 'secret');
    harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/auth/login').flush({ detail: 'This is the student portal.' }, { status: 403, statusText: 'Forbidden' });
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    [...harness.routeNativeElement!.querySelectorAll('a')].find((a) => a.textContent?.includes('admin portal'))!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin/login');
    expect(emailBox().value).toBe('ada@example.com');
  });

  it('creates a task with just a title and location, picking and typing things to bring, left unassigned', async () => {
    const harness = await openPlanner('/admin/planner?view=list');
    const page = harness.fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    const button = (text: string) => [...page.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text))!;
    const type = async (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };

    button('+ New task').click();
    await settle();
    http.expectOne('/api/admin/settings').flush({ digestTime: '08:00', defaultTaskDuration: 30, admins: [] });
    await settle();
    http.expectOne('/api/admin/inventory/items').flush([]); // no inventory at all: still fine
    http.expectOne('/api/admin/inventory/locations').flush([]);
    await settle();
    http.expectOne((r) => r.url === '/api/admin/tasks/availability').flush([
      { id: 1, name: 'Sam Admin', eligible: false, note: 'not working that day' },
    ]);
    await settle();
    await settle();

    await type(page.querySelector<HTMLInputElement>('#task-title')!, 'New hire setup');
    await type(page.querySelector<HTMLInputElement>('#task-location')!, 'Rhodes Tower 1408');
    button('Dual Monitors').click(); // the plain one, listed first: on the list with 1
    button('Mouse').click();
    button('Webcam').click();
    await settle();
    button('Mouse').click(); // clicking again takes it off
    await settle();
    const qty = page.querySelectorAll<HTMLInputElement>('input[aria-label="How many"]')[0]; // how many is set in the list
    qty.value = '2';
    qty.dispatchEvent(new Event('input'));
    await settle();
    button('+ Type something else').click();
    await settle();
    await type(page.querySelectorAll<HTMLInputElement>('input[aria-label="Thing to bring"]')[2], 'Docking station');
    expect(page.textContent).not.toContain('Department');

    // "Who does it": leave it unassigned
    const who = page.querySelector<HTMLSelectElement>('#task-who')!;
    // Everyone can be chosen; someone who isn't free says why
    expect([...who.options].map((o) => o.textContent?.trim())).toContain('Sam Admin: not working that day');
    who.value = 'none';
    who.dispatchEvent(new Event('change'));
    await settle();

    button('Create task').click();
    await settle();
    const request = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/tasks');
    expect(request.request.body).toEqual(expect.objectContaining({
      title: 'New hire setup', location: 'Rhodes Tower 1408', employeeName: '', items: [], autoAssign: false,
      supplies: [{ name: 'Dual Monitors', quantity: 2 }, { name: 'Webcam', quantity: 1 }, { name: 'Docking station', quantity: 1 }],
    }));
  });

  it('shows the activity log by day, with who did what and why something failed', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/activity');
    const now = new Date().toISOString();
    const first = http.expectOne((r) => r.url === '/api/admin/activity');
    expect(first.request.params.get('who')).toBe('all');
    first.flush({
      total: 2, more: false, items: [
        { id: 2, at: now, who: 'Ada Admin', email: 'ada@csuohio.edu', role: 'ADMIN', action: 'Assigned a task', target: 'Printer offline → Sam Lee',
          succeeded: true, status: 200, reason: null, method: 'POST', path: '/api/admin/tasks/9/assign', ipAddress: '10.0.0.1' },
        { id: 1, at: now, who: null, email: null, role: null, action: 'Logged in', target: 'guess@csuohio.edu',
          succeeded: false, status: 401, reason: 'Wrong email or password.', method: 'POST', path: '/api/auth/login', ipAddress: '10.0.0.2' },
      ],
    });
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;

    expect(page.querySelector('h2')!.textContent).toContain('Today');
    const [assigned, login] = [...page.querySelectorAll('[data-activity]')].map((row) => row.textContent!.replace(/\s+/g, ' '));
    expect(assigned).toContain('Ada Admin');
    expect(assigned).toContain('Assigned a task · Printer offline → Sam Lee');
    expect(login).toContain('Not logged in');
    expect(login).toContain('Didn’t work: Wrong email or password.');

    // Filtering asks the server again
    const who = page.querySelector<HTMLSelectElement>('#activity-who')!;
    who.value = 'students';
    who.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const filtered = http.expectOne((r) => r.url === '/api/admin/activity');
    expect(filtered.request.params.get('who')).toBe('students');
    filtered.flush({ total: 0, more: false, items: [] });
  });

  /** Opens the student Team page with this access: Sam (you) and Rita, and one of Rita's tasks on Wednesday. */
  async function openTeam(access: 'VIEW' | 'COMPLETE' | 'EDIT'): Promise<{ harness: RouterTestingHarness; days: string[] }> {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/team');
    const monday = mondayOf(new Date().toLocaleDateString('en-CA'));
    const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
    http.expectOne('/api/me/team/access').flush({ studentId: 1, name: 'Sam Admin', access });
    http.expectOne('/api/me/schedule/semesters').flush([{ id: 1, name: 'Fall 2026', type: 'FALL', startDate: '2026-08-24', endDate: '2026-12-18', weeklyHourLimit: 20, current: true }]);
    await new Promise((resolve) => setTimeout(resolve));
    const person = (studentId: number, name: string, shiftDay: number) => ({
      studentId, name, hours: 3, overLimit: false,
      days: days.map((date, i) => ({ date, cancelled: false, timeOff: [], shifts: i === shiftDay ? [{ start: '09:00', end: '12:00', extra: false }] : [] })),
    });
    http.expectOne((r) => r.url === '/api/me/team/week').flush({
      start: monday, weeklyHourLimit: 20, semesterName: 'Fall 2026', days: days.map((date) => ({ date, holiday: null })),
      students: [person(1, 'Sam Admin', 3), person(2, 'Rita Diaz', 2)],
    });
    http.expectOne((r) => r.url === '/api/me/team/tasks').flush([{
      id: 9, type: 'FIX', title: 'Printer offline', description: null, date: days[2], startTime: '10:00', endTime: '10:30', durationMinutes: 30,
      location: 'BU 201', employee: { name: 'Pat', email: null, phone: null }, supplies: [], status: 'ASSIGNED',
      assignee: { id: 2, name: 'Rita Diaz' }, claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null, items: [],
    }]);
    http.expectOne('/api/me/team/offers').flush([]);
    http.expectOne('/api/me/schedule/changes').flush([]);
    http.expectOne('/api/me/time-off').flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, days };
  }

  async function settle(harness: RouterTestingHarness): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('shows a student everyone’s week, and asks for a change when they drag across their own day', async () => {
    const { harness, days } = await openTeam('VIEW');
    const page = harness.routeNativeElement!;
    const text = page.textContent!;

    expect(text).toContain('Rita Diaz');
    expect(text).toContain('Printer offline');
    expect(text).toContain('View only');
    expect([...page.querySelectorAll('button')].some((b) => b.textContent?.includes('New task'))).toBe(false); // planning needs edit access
    expect(page.querySelector('button[aria-label="Edit Rita Diaz’s schedule"]')).toBeNull();

    // Drag (here: press and release) halfway across your own Thursday: 13:00, for 30 minutes
    const myRow = [...page.querySelectorAll('tbody tr')].find((row) => row.textContent!.includes('You'))!;
    const thursday = myRow.querySelectorAll('td')[3].querySelector<HTMLElement>('.week-track')!;
    thursday.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 30, width: 1200, height: 30, x: 0, y: 0, toJSON: () => ({}) });
    thursday.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 600, button: 0 }));
    thursday.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 600 }));
    await settle(harness);
    // The form checks what you work that day
    http.expectOne((r) => r.url === '/api/me/week' && r.params.get('start') === days[3]).flush({ start: days[0], hours: 0, weeklyHourLimit: 20, semesterName: 'Fall 2026',
      days: [{ date: days[3], holiday: null, dayOff: false, timeOff: [], tasks: [], shifts: [{ start: '09:00', end: '12:00', extra: false }] }] });
    await settle(harness);

    // The form starts with what you work that day now (09:00–12:00) plus the time picked
    expect(page.querySelector<HTMLInputElement>('#change-date')!.value).toBe(days[3]);
    const starts = [...page.querySelectorAll<HTMLInputElement>('input[aria-label^="Start"]')].map((input) => input.value);
    expect(starts).toEqual(['09:00', '13:00']);
    page.querySelector<HTMLInputElement>('input[name="kind"][data-option="week"]')!.click();
    await settle(harness);
    page.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(harness);

    const sent = http.expectOne((r) => r.method === 'POST' && r.url === '/api/me/schedule/changes');
    expect(sent.request.body).toEqual({
      scope: 'EVERY_WEEK', date: days[3], note: '', hours: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '13:30' }],
    });
  });

  it('lets a student offer to take someone else’s task', async () => {
    const { harness } = await openTeam('VIEW');
    const page = harness.routeNativeElement!;
    page.querySelector<HTMLButtonElement>('[data-task="9"]')!.click();
    await settle(harness);
    http.expectOne('/api/me/team/tasks/9').flush({ task: { id: 9, title: 'Printer offline', date: '2026-10-28', startTime: '10:00', endTime: '10:30',
      location: 'BU 201', employee: { name: 'Pat', email: null, phone: null }, supplies: [], status: 'ASSIGNED', assignee: { id: 2, name: 'Rita Diaz' } }, history: [] });
    await settle(harness);

    expect(page.textContent).toContain('It’s Rita Diaz’s now, so an admin decides.');
    expect(page.textContent).not.toContain('Mark done'); // someone else's task, and view-only access
    const note = page.querySelector<HTMLInputElement>('#offer-note')!;
    note.value = 'I’m on shift then';
    note.dispatchEvent(new Event('input'));
    [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Offer to take it')!.click();
    await settle(harness);

    const offer = http.expectOne((r) => r.method === 'POST' && r.url === '/api/me/team/tasks/9/offer');
    expect(offer.request.body).toEqual({ note: 'I’m on shift then' });
  });

  it('lets an admin choose what a student may do with tasks', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/users');
    http.expectOne('/api/admin/students').flush([{ ...student, id: 5, taskAccess: 'VIEW' }]);
    http.expectOne('/api/admin/admins').flush([admin]);
    await settle(harness);

    const select = harness.routeNativeElement!.querySelector<HTMLSelectElement>('#access-5')!;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['View only', 'View + mark done', 'Edit tasks']);
    select.value = 'EDIT';
    select.dispatchEvent(new Event('change'));
    await settle(harness);

    const saved = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/admin/students/5/task-access');
    expect(saved.request.body).toEqual({ access: 'EDIT' });
  });

  it('lets an admin approve a student’s shift change from Student requests', async () => {
    const harness = await openPlanner('/admin/planner?view=requests', {
      changes: [{ id: 3, studentId: 1, studentName: 'Sam Student', scope: 'ONE_DAY', date: '2026-10-29', day: 'THURSDAY',
        hours: [{ start: '13:00', end: '15:00' }], currentHours: [{ start: '09:00', end: '12:00' }], note: 'Exam that morning',
        status: 'PENDING', submittedAt: '2026-10-28T12:00:00Z', reviewedAt: null, reviewNote: null }],
    });
    const change = harness.routeNativeElement!.querySelector('[data-change="3"]')!;

    expect(change.textContent).toContain('Thursday, Oct 29 only');
    expect(change.textContent).toMatch(/Now:\s*09:00–12:00\s*→\s*13:00–15:00/);
    [...change.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Approve')!.click();
    await settle(harness);

    http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/schedule/changes/3/approve');
  });

  it('logs out straight away from /logout and says so on the login page', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/logout');
    http.expectOne('/api/auth/logout').flush(null);
    await new Promise((resolve) => setTimeout(resolve));
    http.match('/api/auth/me').forEach((request) => request.flush(null, { status: 204, statusText: 'No Content' }));
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/login?ended=out');
    expect(harness.routeNativeElement!.textContent).toContain('You’re logged out.');
  });

  it('has no self-registration page', async () => {
    await RouterTestingHarness.create('/register');

    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('confirms on the login page after a password was set', async () => {
    const harness = await RouterTestingHarness.create('/login?passwordSet=true');

    expect(harness.routeNativeElement?.textContent).toContain('Password saved.');
  });

  it('says straight away when a set-password link was already used, and sends a new one on request', async () => {
    const harness = await RouterTestingHarness.create('/set-password?token=old-link');
    http.expectOne('/api/auth/password-link/check').flush({ state: 'USED' });
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();

    expect(heading(harness)).toContain('Link already used.');
    expect(harness.routeNativeElement!.querySelector('#new-password')).toBeNull(); // no password form for a dead link
    [...harness.routeNativeElement!.querySelectorAll('button')].find((b) => b.textContent?.includes('Send me a new one'))!.click();
    const renew = http.expectOne('/api/auth/password-link/renew');
    expect(renew.request.body).toEqual({ token: 'old-link' });
    renew.flush(null);
    await new Promise((resolve) => setTimeout(resolve));
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('A new link is on its way');
  });

  it('shows a clear message when the set-password link has no token', async () => {
    const harness = await RouterTestingHarness.create('/set-password');

    expect(heading(harness)).toContain('Link missing.');
  });
});
