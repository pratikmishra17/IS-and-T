import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TimeBlock } from '../services/schedule';
import { TimeBlocksEditor } from './time-blocks-editor';

@Component({
  imports: [TimeBlocksEditor],
  template: `<app-time-blocks-editor [(blocks)]="blocks" [weekdaysOnly]="true" />`,
})
class Host {
  readonly blocks = signal<TimeBlock[]>([]);
}

describe('TimeBlocksEditor', () => {
  it('shows each saved row on its own day, not the first day of the list', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.blocks.set([
      { day: 'WEDNESDAY', start: '09:00', end: '11:30' },
      { day: 'THURSDAY', start: '12:00', end: '17:00' },
    ]);
    fixture.detectChanges();

    const days = [...(fixture.nativeElement as HTMLElement).querySelectorAll('select')].map((select) => select.value);
    expect(days).toEqual(['WEDNESDAY', 'THURSDAY']);
  });

  it('changes a row’s day when another one is picked', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.blocks.set([{ day: 'MONDAY', start: '09:00', end: '12:00' }]);
    fixture.detectChanges();

    const select: HTMLSelectElement = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    select.value = 'FRIDAY';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.blocks()).toEqual([{ day: 'FRIDAY', start: '09:00', end: '12:00' }]);
    expect(select.value).toBe('FRIDAY');
  });
});
