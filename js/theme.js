/* Light/dark "study mode" — head-loaded classic script.
   Sets data-theme synchronously (no flash), then injects a toggle.
   Theme is a device preference (its own key; never part of synced state). */
(function () {
  var KEY = 'leitfaden_theme';
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function systemDark() { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } }
  function resolve() { var s = saved(); return s === 'dark' || s === 'light' ? s : (systemDark() ? 'dark' : 'light'); }
  function apply(t) { document.documentElement.setAttribute('data-theme', t); }

  // 1) apply immediately, before first paint
  apply(resolve());

  // 2) inject the toggle once the body exists
  function mount() {
    if (document.querySelector('.theme-toggle')) return;
    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle light / dark study mode');
    btn.setAttribute('title', 'Toggle light / dark');
    btn.innerHTML =
      '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // 3) follow the OS only while the user hasn't chosen explicitly
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!saved()) apply(e.matches ? 'dark' : 'light');
    });
  } catch (e) {}
})();
