# Troubleshooting

Common issues and how to fix them.

## Local: "Missing required environment variable: WAKATIME_API_KEY"

The `.env` file is missing the WakaTime key.

**Fix:**

1. Confirm `.env` exists in the project root
2. Open it and set `WAKATIME_API_KEY=<your-key>`
3. Get a key at https://wakatime.com/api-key if you don't have one

## Local: "Invalid CURRENT_PROJECT_MAPPING: ..."

The JSON is malformed.

**Fix:**

1. Validate your JSON at https://jsonlint.com
2. Correct format:

   ```json
   {"my-app":"<gh-username>/<my-app>"}
   ```

3. Ensure you use double quotes, not single quotes
4. Ensure there are no trailing commas

## Local: "Invalid LOCAL_REPOS_PATHS: ..."

The JSON is malformed or contains non-strings.

**Fix:**

1. Validate the JSON at https://jsonlint.com
2. Correct format:

   ```json
   ["/home/you/repos/repo1","/home/you/repos/repo2"]
   ```

3. Every entry must be a string (paths in quotes)
4. Every path must be absolute (start with `/`)

## Local: Section didn't update but script exited 0

You may have edited the markers in `README.md`.

**Fix:**

The dynamic sections must be delimited by exact markers. Check `README.md` for:

```markdown
<!-- CODING_TIME:START -->
... content ...
<!-- CODING_TIME:END -->
```

Whitespace around the markers is fine. The exact text must match (case-sensitive).

## Local: "WakaTime request failed: 401 Unauthorized"

Your API key is invalid or revoked.

**Fix:**

1. Get a fresh key at https://wakatime.com/api-key
2. Update `WAKATIME_API_KEY` in `.env`
3. Run `bun start` again

## Local: "WakaTime request failed: 429 Too Many Requests"

You're hitting WakaTime's rate limit. Wait a few minutes and retry.

## Local: No frameworks shown in TECH_STACK

The manifest reader found nothing in your local paths.

**Fix:**

1. Confirm `LOCAL_REPOS_PATHS` in `.env` points to real directories
2. Verify those directories contain a supported manifest:
   - `package.json`
   - `Cargo.toml`
   - `pyproject.toml`
   - `go.mod`
   - `Dockerfile`
   - `compose.yaml` or `docker-compose.yml`
3. The reader looks for these at the top level of each path — subdirectories are not scanned

## GitHub Actions: workflow doesn't appear in the Actions tab

The workflow files haven't been pushed to `main`.

**Fix:**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflows"
git push
```

## GitHub Actions: "Missing required environment variable: WAKATIME_API_KEY"

The secret isn't set in repository settings.

**Fix:**

1. Open `https://github.com/<your-username>/Daten0/settings/secrets/actions`
2. Confirm `WAKATIME_API_KEY` is listed
3. If missing, add it (see [DEPLOYMENT.md](DEPLOYMENT.md#2-set-up-the-required-secret))
4. Re-run the workflow

## GitHub Actions: workflow doesn't trigger on schedule

GitHub disables scheduled workflows on repositories with no activity for 60 days.

**Fix:**

1. Push a commit to `main` (any change) to "wake up" the workflow
2. Or trigger it manually from the Actions tab
3. The next scheduled run will then resume

## GitHub Actions: `bun install --frozen-lockfile` fails

`bun.lock` is missing or out of sync with `package.json`.

**Fix:**

```bash
bun install
git add bun.lock
git commit -m "chore: update bun.lock"
git push
```

## GitHub Actions: `LOCAL_REPOS_PATHS` secret is set but no frameworks appear

Expected behavior. GitHub-hosted runners don't have your local filesystem.

**Fix:**

- For the GitHub Actions use case, you don't have local repo clones. The TECH_STACK section will fall back to WakaTime + GitHub data.
- If you really want manifest-based detection in CI, you need to either:
  1. Self-host the workflow runner on a machine that has your repos
  2. Or change the design to fetch manifests via the GitHub API instead of local FS

## GitHub Actions: I see `✗ CODING_TIME failed` in the logs

The WakaTime API request failed for this run. The script still attempted the other two sections, so your README may have partial updates.

**Fix:**

1. Check the full error message in the Actions log
2. Common causes:
   - Invalid API key → regenerate at https://wakatime.com/api-key
   - Rate limit → wait and re-run
   - WakaTime API outage → no action needed, will recover automatically
3. Manually re-run the workflow from the Actions tab once the issue is resolved

## Badges in TECH_STACK look broken

The Shields.io URLs include the badge name. If a name has special characters, the URL may break.

**Fix:**

This is a known limitation of simple badge generators. For now, keep tech names simple (alphanumeric, no special characters). If a name looks broken, manually edit the generated `README.md` after `bun start` to fix the URL, or skip the entry by editing the manifest.

## Tests fail with "Cannot find name 'RequestInfo'" or similar

The test file uses a DOM type that Bun's TypeScript config doesn't include.

**Fix:**

This shouldn't happen in the current codebase (the tests use `string | URL` instead). If you see it after editing, make sure you're not adding raw `fetch` mock types from `lib.dom.d.ts`.

## I want to revert the last auto-update commit

The bot creates commits with messages like `chore: update dynamic README sections`.

**Fix:**

```bash
git revert <commit-sha>
git push
```

Or, more aggressively, reset to a previous state:

```bash
git reset --hard <previous-sha>
git push --force  # use with caution
```

## Need more help?

Check the [ARCHITECTURE.md](ARCHITECTURE.md) to understand how the pieces fit together, then look at the relevant test file for usage examples.
