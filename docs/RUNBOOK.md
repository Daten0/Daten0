# Local Runbook

Step-by-step guide to run the system on your local machine.

## Prerequisites

- [Bun](https://bun.sh) 1.4.0 installed. Verify with `bun --version`.
- A [WakaTime](https://wakatime.com) account with at least one project tracked.
- (Optional) Local clones of your GitHub repos for tech stack detection.

## 1. Clone the repository

```bash
git clone https://github.com/<your-username>/Daten0.git
cd Daten0
```

If you already have it locally, just `cd` into the project folder.

## 2. Install dependencies

```bash
bun install
```

This reads `package.json` and `bun.lock` and installs the dev dependencies (`@types/bun`, `typescript`).

## 3. Get your WakaTime API key

1. Visit https://wakatime.com/api-key
2. Sign in if needed
3. Copy your secret API key (looks like `waka_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## 4. Configure environment variables

```bash
cp .env.example .env
```

Now edit `.env` in your editor. Set the following:

```bash
# Required
WAKATIME_API_KEY=waka_your_key_here

# Optional — GitHub token for higher rate limits (PAT with public_repo scope)
GITHUB_TOKEN=

# Optional — map WakaTime project names to GitHub repos for enrichment
CURRENT_PROJECT_MAPPING={"my-app":"<gh-username>/<repo>"}

# Optional — paths to your local repo clones for manifest detection
LOCAL_REPOS_PATHS=["/home/you/repos/repo1","/home/you/repos/repo2"]
```

> For details on each variable, see [SECRETS.md](SECRETS.md).

> The `.env` file is gitignored — it will never be committed.

## 5. Run the script

```bash
bun start
```

You should see three lines like:

```
✓ CODING_TIME updated
✓ CURRENT_PROJECT updated
✓ TECH_STACK updated
```

If any line shows `✗ ... failed:`, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 6. Verify the README

Open `README.md` and check the three dynamic sections. They are delimited by HTML comments:

```markdown
<!-- CODING_TIME:START -->
... generated content ...
<!-- CODING_TIME:END -->

<!-- CURRENT_PROJECT:START -->
... generated content ...
<!-- CURRENT_PROJECT:END -->

<!-- TECH_STACK:START -->
... generated content ...
<!-- TECH_STACK:END -->
```

If you have no recent WakaTime activity, you'll see a friendly placeholder like `No coding activity tracked in the last 7 days.` or `I'm currently between projects.`. This is normal.

## 7. Run tests (optional)

```bash
bun test        # 92 unit tests, all mocked
bun typecheck   # tsc --noEmit
```

The tests do not require the WakaTime API or any network access.

## 8. Customize the schedule (GitHub Actions only)

To change when the auto-update runs, see [DEPLOYMENT.md](DEPLOYMENT.md#6-optional-adjust-the-schedule).

## Common local-use patterns

### Dry-run to check env vars without committing

Just run `bun start` — it will overwrite `README.md` locally but won't push anything. Use `git diff README.md` to see what changed, then `git restore README.md` if you want to discard.

### Manually trigger the workflow from your machine

Use the GitHub CLI:

```bash
gh workflow run update-readme.yml
```

Then watch the run in the Actions tab.

### Update README after editing static content

If you manually change the parts of `README.md` outside the marker sections (your bio, social links, etc.), the next `bun start` run will preserve those changes. The script only touches the region between the markers.

## Next steps

- For GitHub Actions setup: [DEPLOYMENT.md](DEPLOYMENT.md)
- For how the system works internally: [ARCHITECTURE.md](ARCHITECTURE.md)
- For common issues: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
