import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the login page by default', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Welcome back.');
  });

  it('validates login and completes the preview logout flow', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const submit = () => page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    submit();
    await fixture.whenStable();
    expect(page.querySelector('#login-email-error')).toBeTruthy();
    expect(page.querySelector('#login-password-error')).toBeTruthy();
    expect(page.querySelector('app-logout')).toBeNull();

    for (const [id, value] of [['login-email', 'demo@example.com'], ['login-password', 'sample-password']]) {
      const input = page.querySelector<HTMLInputElement>('#' + id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    submit();
    await fixture.whenStable();
    expect(page.querySelector('h1')?.textContent).toContain('Ready to leave?');
    expect(page.querySelector('input[type="password"]')).toBeNull();

    page.querySelector<HTMLButtonElement>('app-logout button')!.click();
    await fixture.whenStable();
    expect(page.querySelector('h1')?.textContent).toContain('See you soon.');
    page.querySelector<HTMLButtonElement>('app-logout button')!.click();
    await fixture.whenStable();
    expect(page.querySelector('h1')?.textContent).toContain('Welcome back.');
    expect(page.querySelector<HTMLInputElement>('#login-password')!.value).toBe('');
  });

});
