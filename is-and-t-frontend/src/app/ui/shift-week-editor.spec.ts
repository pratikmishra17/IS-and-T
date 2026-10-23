import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TimeBlock } from '../services/schedule';
import { ShiftWeekEditor } from './shift-week-editor';

@Component({
  imports: [ShiftWeekEditor],
  template: `<app-shift-week-editor [(blocks)]="shifts" [classes]="classes" [limit]="20" />`,
})
class Host {
  readonly shifts = signal<TimeBlock[]>([]);
  readonly classes: TimeBlock[] = [{ day: 'TUESDAY', start: '10:00', end: '11:00' }];
}

describe('ShiftWeekEditor', () => {
  function setUp(shifts: TimeBlock[] = []) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.shifts.set(shifts);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const button = (text: string) => [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
    const click = (text: string) => {
      button(text).click();
      fixture.detectChanges();
    };
    return { fixture, page, button, click };
  }

  it('adds the same hours on the picked days from the Type tab, and shows them on the calendar', () => {
    const { fixture, page, click } = setUp();
    click('Type');
    click('Mon');
    click('Wed');
    click('Add'); // 9:00–12:00 by default

    expect(fixture.componentInstance.shifts()).toEqual([
      { day: 'MONDAY', start: '09:00', end: '12:00' },
      { day: 'WEDNESDAY', start: '09:00', end: '12:00' },
    ]);
    expect(page.textContent).toContain('6 h a week');
    click('Calendar');
    expect(page.querySelectorAll('[data-shift]').length).toBe(2);
  });

  it('lists every selected shift, not just the last one, and deletes them together', () => {
    const { fixture, page, click } = setUp([
      { day: 'MONDAY', start: '09:00', end: '12:00' },
      { day: 'WEDNESDAY', start: '09:00', end: '12:00' },
      { day: 'FRIDAY', start: '09:00', end: '12:00' },
    ]);
    const shifts = page.querySelectorAll<HTMLButtonElement>('[data-shift]');
    shifts[0].click();
    shifts[2].click();
    fixture.detectChanges();

    expect(page.textContent).toContain('2 shifts selected');
    expect(page.querySelectorAll('ul input[type="time"]').length).toBe(4); // start and end for each

    click('Delete selected');
    expect(fixture.componentInstance.shifts()).toEqual([{ day: 'WEDNESDAY', start: '09:00', end: '12:00' }]);
  });

  it('marks a shift that overlaps a class, and deletes a shift from the keyboard', () => {
    const { fixture, page } = setUp([{ day: 'TUESDAY', start: '09:00', end: '12:00' }]);

    const shift = page.querySelector<HTMLButtonElement>('[data-shift]')!;
    expect(shift.classList).toContain('clash');
    expect(shift.getAttribute('aria-label')).toContain('overlaps a class');

    shift.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.shifts()).toEqual([]);
  });

  it('refuses a time range that ends before it starts', () => {
    const { fixture, page, click } = setUp();
    click('Type');
    click('Fri');
    const end = page.querySelector<HTMLInputElement>('#quick-end')!;
    end.value = '08:00';
    end.dispatchEvent(new Event('change'));
    click('Add');

    expect(fixture.componentInstance.shifts()).toEqual([]);
    expect(page.textContent).toContain('A shift has to end after it starts.');
  });
});
