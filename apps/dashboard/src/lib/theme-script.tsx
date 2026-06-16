export function ThemeScript({ nonce }: { nonce?: string }) {
  const script = `
    (function() {
      try {
        var stored = localStorage.getItem('gal-theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme;
        if (stored === 'dark' || stored === 'light') {
          theme = stored;
        } else {
          // 'system' (default) or no value stored — follow OS preference
          theme = prefersDark ? 'dark' : 'light';
        }
        document.documentElement.classList.add(theme);
        var style = localStorage.getItem('gal-style-mode');
        document.documentElement.classList.add('theme-' + (style === 'vivid' ? 'vivid' : 'subtle'));
      } catch (e) {}
    })();
  `
  return <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: script }} />
}
