// Runs before the app loads (a plain file, so the Content-Security-Policy allows it), so the page
// is drawn in the right theme and portal colours from the first frame instead of flashing.
// ThemeService takes over once the app has started.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('isandt.theme');
  } catch (e) {
    // storage blocked: follow the system setting
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-portal', location.pathname.indexOf('/admin') === 0 ? 'admin' : 'user');
})();
