/* ── Theme toggle ── */
(function() {
  const html = document.documentElement;
  const btn  = document.getElementById('theme-toggle');
  const icon = btn?.querySelector('span');

  // Restore saved theme
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    html.classList.add('light');
    if (icon) icon.textContent = '🌙';
  } else {
    if (icon) icon.textContent = '☀️';
  }

  if (btn) {
    btn.addEventListener('click', () => {
      html.classList.toggle('light');
      const isLight = html.classList.contains('light');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      if (icon) icon.textContent = isLight ? '🌙' : '☀️';
    });
  }
})();

/* ── GitHub contributions ── */
(function() {
  const USER = 'biraysutcuoglu';
  const grid = document.getElementById('gh-grid');
  const countEl = document.getElementById('gh-count');
  if (!grid) return;

  // Prefer the pre-generated file (includes private contributions when the
  // GitHub Actions workflow ran with a token). Fall back to the public API.
  const SOURCES = [
    'data/contributions.json',
    `https://github-contributions-api.jogruber.de/v4/${USER}?y=last`,
  ];

  function normalize(data) {
    // Generated file shape
    if (Array.isArray(data.days)) {
      return { total: data.total, days: data.days };
    }
    // Public API shape
    if (Array.isArray(data.contributions)) {
      const days = data.contributions.map((d) => ({
        date: d.date,
        count: d.count,
        level: d.level,
      }));
      return { total: data.total?.lastYear, days };
    }
    throw new Error('unrecognized data shape');
  }

  async function load() {
    for (const url of SOURCES) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) continue;
        const data = normalize(await res.json());
        if (data.days.length) return data;
      } catch {
        /* try next source */
      }
    }
    throw new Error('all sources failed');
  }

  load()
    .then(({ total, days }) => {
      if (countEl) {
        const n = total ?? days.reduce((s, d) => s + d.count, 0);
        countEl.textContent = n.toLocaleString();
      }

      // Pad the start so the first column begins on a Sunday.
      const first = new Date(days[0].date + 'T00:00:00');
      const pad = first.getDay(); // 0 = Sunday
      const cells = [];
      for (let i = 0; i < pad; i++) cells.push(null);
      days.forEach((d) => cells.push(d));

      grid.innerHTML = cells
        .map((d) => {
          if (!d) return '<span class="cell" style="visibility:hidden"></span>';
          const label = `${d.count} contribution${d.count === 1 ? '' : 's'} on ${d.date}`;
          return `<span class="cell" data-level="${d.level}" title="${label}"></span>`;
        })
        .join('');
    })
    .catch(() => {
      if (countEl) countEl.textContent = '—';
      grid.innerHTML = '<span style="color:var(--text-dim);font-size:0.85rem">' +
        'Couldn\'t load contributions.</span>';
    });
})();