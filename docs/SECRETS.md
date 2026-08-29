# Secrets Setup

This project uses GitHub Actions to automatically refresh the dynamic sections of `README.md`. The workflows read their inputs from repository secrets and variables.

## Required secrets

| Secret | Purpose | How to obtain |
|--------|---------|---------------|
| `WAKATIME_API_KEY` | Used to call the WakaTime API for coding time and recent projects. | https://wakatime.com/api-key — copy the secret key. |

Without `WAKATIME_API_KEY`, the `Update README` workflow will fail at the script step. The `Test` workflow does not require it.

## Optional secrets

| Secret | Purpose | Default behavior |
|--------|---------|------------------|
| `GITHUB_TOKEN` | Used by the application (`GitHubClient`) to call the GitHub API with a higher rate limit when enriching the current project with repository metadata. | Anonymous requests (60 req/hour per IP). The `Update README` workflow will still work; the tech stack section will fall back to WakaTime-only data. |
| `CURRENT_PROJECT_MAPPING` | JSON object allowlisting public WakaTime project names and mapping them to GitHub `owner/repo` slugs. Example: `{"my-app":"me/my-app"}`. | Empty — no WakaTime project names are published. |
| `LOCAL_REPOS_PATHS` | JSON array of absolute paths to local clones of your repositories. Example: `["/home/user/repos/repo1","/home/user/repos/repo2"]`. These are read by `ManifestReader` to detect frameworks and tools. | Empty — only WakaTime + GitHub languages contribute to the tech stack. |

> **Note:** There are two distinct `GITHUB_TOKEN` values in this project:
> 1. The **workflow-level** token (`${{ secrets.GITHUB_TOKEN }}`), automatically provided by GitHub Actions. This is what the workflow uses to checkout the repository and push the updated `README.md` back. You never need to configure it.
> 2. The **optional user-defined** `GITHUB_TOKEN` repository secret, set under *Settings → Secrets and variables → Actions*. This is read by the application script (`src/index.ts`) via the `GitHubClient` to enrich repository data. It is **not** required for the workflow to run.
>
> If you set both (the user-defined one will be used by the script for API calls), they do not conflict — they serve different purposes.

## Setting secrets

1. Open your repository on GitHub.
2. Go to **Settings → Secrets and variables → Actions**.
3. Click **New repository secret**.
4. Enter the name exactly as it appears above (e.g. `WAKATIME_API_KEY`).
5. Paste the value and save.

For multi-value secrets (`CURRENT_PROJECT_MAPPING`, `LOCAL_REPOS_PATHS`), the value must be valid JSON. Use a JSON linter to verify before saving.

Only add projects to `CURRENT_PROJECT_MAPPING` when their names are safe to publish. Unmapped WakaTime projects are deliberately excluded from the public README.

## Rotating the WakaTime API key

The `WAKATIME_API_KEY` is a long-lived secret. If it is ever exposed (e.g. accidentally committed or leaked in logs):

1. Revoke it at https://wakatime.com/api-key (click *Regenerate*).
2. Update the value in this repository's secrets.
3. Verify the old key is no longer valid by running a workflow.

The WakaTime key grants read-only access to your coding activity, so the blast radius of a leak is limited — but rotation is still recommended as a hygiene practice.

## Local development

Copy `.env.example` to `.env` and fill in the values you want to test locally. The `.env` file is gitignored.

```bash
cp .env.example .env
# edit .env
bun start
```

## Workflow behavior on failure

The `Update README` workflow follows the partial-fail design of `src/index.ts`:

- If the WakaTime API call fails, the script still attempts the other sections.
- The commit step uses `git diff --quiet README.md` — it only commits when the file actually changed.
- The job exits with code 1 if any section failed, so you get a visible signal in the Actions tab even when the README is partially updated.
