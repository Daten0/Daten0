# Deployment Guide

Step-by-step guide to enable the automatic README updates via GitHub Actions.

## Prerequisites

- A GitHub account
- The repository pushed to GitHub under `<your-username>/Daten0`
- A WakaTime API key (see [RUNBOOK.md](RUNBOOK.md#3-get-your-wakatime-api-key))

## 1. Push the repository to GitHub

If you haven't already:

```bash
git remote add origin https://github.com/<your-username>/Daten0.git
git push -u origin main
```

## 2. Set up the required secret

The `Update README` workflow needs your WakaTime API key.

1. Open `https://github.com/<your-username>/Daten0/settings/secrets/actions`
2. Click **New repository secret**
3. **Name:** `WAKATIME_API_KEY`
4. **Value:** paste your key from https://wakatime.com/api-key
5. Click **Add secret**

## 3. (Optional) Set up additional secrets

These are optional but unlock richer data.

### `GITHUB_TOKEN` — for enriched current project

Without this, `GitHubClient` makes anonymous API requests (60/hour limit). With a personal access token, the limit jumps to 5,000/hour.

1. Create a PAT at https://github.com/settings/tokens (scopes: `public_repo` is enough)
2. Add a new secret named `GITHUB_TOKEN` with the token value

> Note: this is different from the workflow's auto-injected `secrets.GITHUB_TOKEN`. They serve different purposes. See [SECRETS.md](SECRETS.md#note) for the full explanation.

### `CURRENT_PROJECT_MAPPING` — link WakaTime projects to GitHub repos

Maps your WakaTime project names to GitHub `owner/repo` slugs. Used by the `CURRENT_PROJECT` section to render a link and description.

1. Add a new secret named `CURRENT_PROJECT_MAPPING`
2. **Value:** valid JSON object, e.g.

   ```json
   {"my-app":"<gh-username>/<my-app>","api":"<gh-username>/<api-server>"}
   ```

3. Validate the JSON before saving (use https://jsonlint.com)

### `LOCAL_REPOS_PATHS` — local manifest reading

> **Heads up:** GitHub-hosted runners do **not** have access to your local filesystem. This secret is only useful if you self-host the workflow on a machine that has your repos cloned. On GitHub-hosted runners, leave it empty.

If you do self-host:

1. Add a new secret named `LOCAL_REPOS_PATHS`
2. **Value:** JSON array of absolute paths, e.g.

   ```json
   ["/home/runner/repos/repo1","/home/runner/repos/repo2"]
   ```

## 4. Verify the workflows

1. Go to the **Actions** tab: `https://github.com/<your-username>/Daten0/actions`
2. You should see two workflows listed: **Test** and **Update README**
3. Click **Update README** → **Run workflow** → **Run workflow** (manual trigger)
4. Watch the run complete
5. Once it finishes, check `README.md` on the `main` branch — it should have been updated and committed by `github-actions[bot]`

If the run failed, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 5. Wait for the schedule

By default, the `Update README` workflow runs every 6 hours at minute 0:

- 00:00 UTC
- 06:00 UTC
- 12:00 UTC
- 18:00 UTC

You can also trigger it manually at any time from the Actions tab.

## 6. (Optional) Adjust the schedule

Edit `.github/workflows/update-readme.yml` and change the `cron` value:

```yaml
on:
  schedule:
    - cron: "0 */6 * * *"  # ← change this
```

| Cron | Meaning |
|------|---------|
| `0 */6 * * *` | Every 6 hours (default) |
| `0 0 * * *` | Daily at 00:00 UTC |
| `0 */12 * * *` | Every 12 hours |
| `0 9 * * 1` | Every Monday at 09:00 UTC |
| `*/30 * * * *` | Every 30 minutes (high API usage) |

> **Note:** GitHub Actions cron is UTC, not your local timezone. After editing, commit and push — the new schedule takes effect on the next run.

## 7. Rotate the WakaTime key (periodically)

See [SECRETS.md](SECRETS.md#rotating-the-wakatime-api-key) for rotation steps.

## What's next

- For local development: [RUNBOOK.md](RUNBOOK.md)
- For how the system works: [ARCHITECTURE.md](ARCHITECTURE.md)
- For common issues: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
