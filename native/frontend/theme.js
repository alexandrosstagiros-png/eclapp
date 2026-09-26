(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('ecl.theme') || 'system'; } catch {}
  if (!['light', 'dark'].includes(preference)) preference = 'system';
  const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101820' : '#e8edf1';
})();
