# github-portfolio

Personal portfolio site (static, no build step).

## Local preview

```bash
python3 -m http.server 8123
# open http://localhost:8123/index.html
```

## GitHub contributions

The contribution grid on the home page reads `data/contributions.json`.

- **Public contributions only** — the file is generated from a public API.
- **Including private contributions** — the included GitHub Actions workflow
  (`.github/workflows/contributions.yml`) regenerates the file daily using the
  repository's `GITHUB_TOKEN`, which can read your own private contributions.

### How it works

1. `.github/workflows/contributions.yml` runs on a schedule (and on demand).
2. It runs `scripts/fetch-contributions.mjs`, which:
   - uses the **GitHub GraphQL API** when `GH_TOKEN` is set (includes private
     contributions via `restrictedContributionsCount`), or
   - falls back to a **public API** when no token is present.
3. The result is committed to `data/contributions.json`.
4. `script.js` loads that file (falling back to the public API if missing).

### Manual regeneration

```bash
# public only
node scripts/fetch-contributions.mjs

# including private contributions (needs a token with `read:user` scope)
GH_TOKEN=ghp_xxxxxxxx node scripts/fetch-contributions.mjs
```

> **Note:** Never commit a token. The workflow uses the built-in
> `secrets.GITHUB_TOKEN`, so no secret needs to be configured manually.
