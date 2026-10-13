#!/usr/bin/env node
/**
 * Fetch GitHub contribution data and write it to data/contributions.json.
 *
 * Two modes:
 *   1. Authenticated (GH_TOKEN set)  -> GitHub GraphQL API.
 *      Includes PRIVATE contributions (restrictedContributionsCount).
 *   2. Unauthenticated (no token)    -> public API fallback (public only).
 *
 * Usage:
 *   GH_TOKEN=ghp_xxx node scripts/fetch-contributions.mjs
 *   GH_LOGIN=biraysutcuoglu node scripts/fetch-contributions.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, '..', 'data', 'contributions.json');

const LOGIN = process.env.GH_LOGIN || 'biraysutcuoglu';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

// GitHub's contributionLevel enum -> 0..4
const LEVEL_MAP = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function fetchAuthenticated() {
  const now = new Date();
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 1);

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'contributions-fetcher',
    },
    body: JSON.stringify({
      query,
      variables: { login: LOGIN, from: from.toISOString(), to: now.toISOString() },
    }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const collection = json.data.user.contributionsCollection;
  const days = collection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({
      date: d.date,
      count: d.contributionCount,
      level: LEVEL_MAP[d.contributionLevel] ?? 0,
    }));

  const total = collection.contributionCalendar.totalContributions;
  const privateCount = collection.restrictedContributionsCount;

  return {
    login: LOGIN,
    generatedAt: new Date().toISOString(),
    source: 'graphql',
    total,
    publicTotal: total - privateCount,
    privateTotal: privateCount,
    breakdown: {
      commits: collection.totalCommitContributions,
      issues: collection.totalIssueContributions,
      pullRequests: collection.totalPullRequestContributions,
      reviews: collection.totalPullRequestReviewContributions,
    },
    days,
  };
}

async function fetchPublic() {
  const res = await fetch(
    `https://github-contributions-api.jogruber.de/v4/${LOGIN}?y=last`
  );
  if (!res.ok) throw new Error(`Public API failed: ${res.status}`);
  const json = await res.json();
  const days = (json.contributions || []).map((d) => ({
    date: d.date,
    count: d.count,
    level: d.level,
  }));
  const total = json.total?.lastYear ?? days.reduce((s, d) => s + d.count, 0);
  return {
    login: LOGIN,
    generatedAt: new Date().toISOString(),
    source: 'public-api',
    total,
    publicTotal: total,
    privateTotal: 0,
    breakdown: null,
    days,
  };
}

async function main() {
  const data = TOKEN ? await fetchAuthenticated() : await fetchPublic();
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(
    `Wrote ${OUT_FILE}\n  source=${data.source} total=${data.total} ` +
      `(public=${data.publicTotal}, private=${data.privateTotal}) days=${data.days.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
