# Architecture

How the system works under the hood. This is for future maintainers (or for me, when I forget).

## High-level flow

```
[WakaTime API] ──┐
[GitHub API]   ──┼──> [Services] ──> [Renderer] ──> [README.md]
[Local FS]     ──┘
```

The script (`src/index.ts`) is the orchestrator. It calls clients, passes data through services, hands the result to the renderer, and writes the output.

## Module structure

```
src/
├── clients/                 # External API and file system access
│   ├── wakatime.client.ts   # Fetches WakaTime stats and project activity
│   ├── github.client.ts     # Fetches repo metadata and language lists
│   └── manifest-reader.ts   # Reads package.json, Cargo.toml, etc. from local paths
├── services/                # Business logic
│   ├── coding-time.service.ts     # Sorts + limits language stats
│   ├── current-project.service.ts # Selects most recent project + GitHub enrichment
│   ├── project-mapping.ts         # Validates GitHub owner/repo mappings
│   └── tech-stack.service.ts      # Aggregates languages from WakaTime + GitHub, tools from manifests
├── renderers/               # Data → Markdown
│   └── readme.renderer.ts   # Three render methods + section replacement
├── types/                   # Shared TypeScript types
│   └── activity.ts
├── config.ts                # Reads and validates environment variables
└── index.ts                 # Orchestration: calls services, handles partial failures
```

## Architectural rules (from AGENTS.md)

The project follows three strict boundaries:

1. **Clients** only do HTTP and file system access. No business logic.
2. **Services** only do data transformation and combination. No HTTP, no Markdown.
3. **Renderers** only convert data structures to Markdown strings. No API calls.

This makes the system easy to test (no real APIs needed) and easy to reason about (each layer has one job).

## Data flow per section

### CODING_TIME

1. `WakaTimeClient.getLast7DaysActivity()` → fetches `stats/last_7_days`, retries responses that are still calculating, and rejects incomplete statistics
2. `CodingTimeService.summarize(activity)` → sorts languages by `totalSeconds` descending, keeps top 5
3. `ReadmeRenderer.renderCodingTime(summary)` → builds Markdown like:

   ```markdown
   **Last 7 Days:** 1 hr 0 mins

   - **TypeScript** — 50.0%
   - **Rust** — 30.0%
   - **Python** — 20.0%
   ```

4. `ReadmeRenderer.replaceSection(readme, "CODING_TIME", markdown)` → injects between markers

### CURRENT_PROJECT

1. `WakaTimeClient.getRecentProjectActivity()` → fetches the `projects` endpoint, which supplies real `last_heartbeat_at` timestamps
2. `CurrentProjectService.build(projects, mapping)` → considers only explicitly mapped projects, picks the mapped project with the most recent heartbeat, and enriches it via `GitHubClient.getRepository(owner, repo)`
3. `ReadmeRenderer.renderCurrentProject(project)` → builds Markdown like:

   ```markdown
   - 🔭 I'm currently working on [**my-app**](https://github.com/you/my-app) — A cool project
   ```

4. Replaces `<!-- CURRENT_PROJECT:START/END -->` region

### TECH_STACK

This section combines three data sources:

1. **WakaTime languages** — same `stats/last_7_days` response (memoized, so no extra API call)
2. **GitHub repo languages** — for each mapped project, `GitHubClient.getRepositoryLanguages(owner, repo)` returns the list of languages GitHub detected
3. **Local manifest tools** — `ManifestReader.readFrameworks(paths)` reads `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `Dockerfile`, `compose.yaml` from each path

4. `TechStackService.build(...)` aggregates, deduplicates, and limits:
   - Top 5 languages
   - Top 8 frameworks/tools

5. `ReadmeRenderer.renderTechStack(stack)` builds Markdown with Shields.io badges:

   ```markdown
   **Languages (Recently Used)**

   ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge)
   ![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge)

   **Frameworks & Tools (Recently Used)**

   ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge)
   ![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge)
   ```

6. Replaces `<!-- TECH_STACK:START/END -->` region

## Memoization

WakaTime statistics and projects are fetched from separate endpoints and cached independently:

```ts
private statsCache: Promise<WakaTimeStats> | null = null;
private projectsCache: Promise<WakaTimeProjects> | null = null;
```

The first call to each endpoint hits the WakaTime API; subsequent calls return the corresponding cached promise. If a request fails, its cache is cleared so a later section can retry. Stats responses that are stale or still calculating receive bounded retries before the section fails safely.

## Partial-fail design

`src/index.ts` wraps each section in its own `try/catch`:

```ts
try {
  // CODING_TIME
} catch (error) {
  results.push({ section: "CODING_TIME", ok: false, error: message });
}

try {
  // CURRENT_PROJECT
} catch (error) {
  // same
}

try {
  // TECH_STACK
} catch (error) {
  // same
}
```

The README is only written if at least one section produced a change. The exit code reflects whether any section failed.

This means a WakaTime outage won't prevent the TECH_STACK section from updating (which can run on GitHub + manifest data alone), and vice versa.

## Marker-based section replacement

`ReadmeRenderer.replaceSection(readme, section, content)` is the only thing that mutates `README.md`. It:

1. Locates `<!-- SECTION_NAME:START -->` and `<!-- SECTION_NAME:END -->` markers
2. Throws if either marker is missing or out of order
3. Slices out the old content between them
4. Injects the new content (trimmed of whitespace)

Anything **outside** the markers — your bio, social links, header GIF, etc. — is never touched. This is enforced by tests (`tests/readme.renderer.test.ts`).

## Configuration

All environment variables are loaded in `src/config.ts`:

| Variable | Required | Validation |
|----------|----------|------------|
| `WAKATIME_API_KEY` | Yes | Non-empty string |
| `GITHUB_TOKEN` | No | Non-empty string or null |
| `CURRENT_PROJECT_MAPPING` | No | Valid JSON object of string→string |
| `LOCAL_REPOS_PATHS` | No | Valid JSON array of strings |

Malformed values throw at startup with a clear error message, so failures happen before any API call.

## Testing

92 unit tests across 7 files, all running offline. The tests use `bun:test`'s `mock()` to stub `globalThis.fetch` — no real network calls.

Coverage:
- `tests/wakatime.client.test.ts` — success, HTTP errors, invalid JSON, schema validation, memoization
- `tests/github.client.test.ts` — repo metadata, languages, auth header, schema validation
- `tests/manifest-reader.test.ts` — every supported manifest format
- `tests/coding-time.service.test.ts` — sorting, limits, immutability
- `tests/current-project.service.test.ts` — selection, enrichment, graceful failure
- `tests/tech-stack.service.test.ts` — aggregation, dedup, limits
- `tests/readme.renderer.test.ts` — section replacement, all three render methods, empty data

## CI/CD

- `.github/workflows/test.yml` — runs `bun typecheck` + `bun test` on every push to `main` and every PR
- `.github/workflows/update-readme.yml` — runs every 6 hours + manual trigger, calls the script, commits if README changed
- `.github/dependabot.yml` — weekly PRs for outdated actions and `package.json` dependencies
