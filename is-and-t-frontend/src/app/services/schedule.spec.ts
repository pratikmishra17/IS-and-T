import { addOnDays, mergeShifts, overlaps } from './schedule';

describe('weekly shift helpers', () => {
  it('joins shifts that overlap or touch on the same day, and sorts by day then time', () => {
    expect(mergeShifts([
      { day: 'WEDNESDAY', start: '09:00', end: '10:00' },
      { day: 'MONDAY', start: '11:00', end: '13:00' },
      { day: 'MONDAY', start: '09:00', end: '12:00' },
      { day: 'MONDAY', start: '13:00', end: '14:00' },
    ])).toEqual([
      { day: 'MONDAY', start: '09:00', end: '14:00' },
      { day: 'WEDNESDAY', start: '09:00', end: '10:00' },
    ]);
  });

  it('drops shifts that end before they start', () => {
    expect(mergeShifts([{ day: 'FRIDAY', start: '12:00', end: '09:00' }])).toEqual([]);
  });

  it('adds the same hours on several days at once', () => {
    const shifts = addOnDays([{ day: 'MONDAY', start: '08:00', end: '09:30' }], ['MONDAY', 'FRIDAY'], '09:00', '12:00');
    expect(shifts).toEqual([
      { day: 'MONDAY', start: '08:00', end: '12:00' },
      { day: 'FRIDAY', start: '09:00', end: '12:00' },
    ]);
  });

  it('knows when a shift overlaps a class', () => {
    expect(overlaps({ day: 'TUESDAY', start: '10:00', end: '12:00' }, { day: 'TUESDAY', start: '11:30', end: '13:00' })).toBe(true);
    expect(overlaps({ day: 'TUESDAY', start: '10:00', end: '12:00' }, { day: 'TUESDAY', start: '12:00', end: '13:00' })).toBe(false);
    expect(overlaps({ day: 'TUESDAY', start: '10:00', end: '12:00' }, { day: 'MONDAY', start: '10:00', end: '12:00' })).toBe(false);
  });
});
