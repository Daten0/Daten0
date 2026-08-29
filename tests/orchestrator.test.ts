import { describe, expect, test } from "bun:test";

import { runOrchestrator } from "../src/orchestrator";
import { WakaTimeClient } from "../src/clients/wakatime.client";
import { GitHubClient } from "../src/clients/github.client";
import { ManifestReader } from "../src/clients/manifest-reader";
import { CodingTimeService } from "../src/services/coding-time.service";
import { CurrentProjectService } from "../src/services/current-project.service";
import { TechStackService } from "../src/services/tech-stack.service";
import { ReadmeRenderer } from "../src/renderers/readme.renderer";

const SAMPLE_README = `# Profile

Before

<!-- CODING_TIME:START -->
Last 7 Days: 5 hrs 12 mins

- TypeScript — 50.0%
- Rust — 30.0%
<!-- CODING_TIME:END -->

Middle

<!-- CURRENT_PROJECT:START -->
- 🔭 I'm currently working on **my-old-project**
<!-- CURRENT_PROJECT:END -->

Middle 2

<!-- TECH_STACK:START -->
**Languages (Recently Used)**
![TypeScript](https://img.shields.io/badge/TypeScript-000000)
<!-- TECH_STACK:END -->

After
`;

function makeThrowingWakatime(): WakaTimeClient {
  const client = new WakaTimeClient("test-key");
  client.getLast7DaysActivity = async () => {
    throw new Error("WakaTime request failed: 503 Service Unavailable");
  };
  client.getRecentProjectActivity = async () => {
    throw new Error("WakaTime request failed: 503 Service Unavailable");
  };
  return client;
}

function makeSuccessWakatime(): WakaTimeClient {
  const client = new WakaTimeClient("test-key");
  client.getLast7DaysActivity = async () => ({
    totalSeconds: 3600,
    text: "1 hr 0 mins",
    languages: [
      { name: "TypeScript", totalSeconds: 3600, percentage: 100 },
    ],
  });
  client.getRecentProjectActivity = async () => [];
  return client;
}

function makeDeps(
  wakatime: WakaTimeClient,
  options: { localRepoPaths?: string[]; mapping?: Record<string, string> } = {},
) {
  const github = new GitHubClient();
  const manifestReader = new ManifestReader();
  return {
    wakatime,
    codingTimeService: new CodingTimeService(),
    currentProjectService: new CurrentProjectService(github),
    techStackService: new TechStackService(github, manifestReader),
    renderer: new ReadmeRenderer(),
    mapping: options.mapping ?? {},
    localRepoPaths: options.localRepoPaths ?? [],
  };
}

describe("orchestrator failure handling", () => {
  test("all APIs down: updatedReadme is byte-identical to readme", async () => {
    const deps = makeDeps(makeThrowingWakatime());

    const { updatedReadme, results } = await runOrchestrator(
      SAMPLE_README,
      deps,
    );

    expect(updatedReadme).toBe(SAMPLE_README);
    expect(results.filter((r) => r.ok)).toHaveLength(0);
    expect(results.filter((r) => !r.ok)).toHaveLength(3);
  });

  test("WakaTime down: all three sections fail (TECH_STACK depends on it)", async () => {
    const deps = makeDeps(makeThrowingWakatime());

    const { results } = await runOrchestrator(SAMPLE_README, deps);

    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/WakaTime request failed/);
    }
  });

  test("only first WakaTime call fails: CODING_TIME fails but later sections succeed", async () => {
    let codingTimeCallCount = 0;
    const wakatime = new WakaTimeClient("test-key");
    wakatime.getLast7DaysActivity = async () => {
      codingTimeCallCount++;
      if (codingTimeCallCount === 1) {
        throw new Error("WakaTime request failed: 500");
      }
      return {
        totalSeconds: 1000,
        text: "16 mins 40 secs",
        languages: [],
      };
    };
    wakatime.getRecentProjectActivity = async () => [];
    const deps = makeDeps(wakatime);

    const { updatedReadme, results } = await runOrchestrator(
      SAMPLE_README,
      deps,
    );

    expect(results.find((r) => r.section === "CODING_TIME")?.ok).toBe(false);
    expect(results.find((r) => r.section === "CURRENT_PROJECT")?.ok).toBe(true);
    expect(results.find((r) => r.section === "TECH_STACK")?.ok).toBe(true);

    expect(updatedReadme).toContain("Last 7 Days: 5 hrs 12 mins");
    expect(updatedReadme).toContain("TypeScript — 50.0%");
  });

  test("failed section does not inject error text into the README", async () => {
    const deps = makeDeps(makeThrowingWakatime());

    const { updatedReadme } = await runOrchestrator(SAMPLE_README, deps);

    expect(updatedReadme).not.toMatch(/failed/i);
    expect(updatedReadme).not.toMatch(/error/i);
    expect(updatedReadme).not.toMatch(/503/);
  });

  test("results array reports all three sections even when one fails", async () => {
    const deps = makeDeps(makeThrowingWakatime());

    const { results } = await runOrchestrator(SAMPLE_README, deps);

    expect(results.map((r) => r.section)).toEqual([
      "CODING_TIME",
      "CURRENT_PROJECT",
      "TECH_STACK",
    ]);
    expect(results.every((r) => r.error !== undefined)).toBe(true);
  });

  test("successful run produces a different updatedReadme", async () => {
    const deps = makeDeps(makeSuccessWakatime());

    const { updatedReadme, results } = await runOrchestrator(
      SAMPLE_README,
      deps,
    );

    expect(updatedReadme).not.toBe(SAMPLE_README);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  test("uses one injected clock to filter projects for both sections", async () => {
    const wakatime = makeSuccessWakatime();
    wakatime.getRecentProjectActivity = async () => [
      { name: "recent", lastHeartbeatAt: "2024-01-07T00:00:00.000Z" },
      { name: "stale", lastHeartbeatAt: "2023-12-31T23:59:59.999Z" },
      { name: "future", lastHeartbeatAt: "2024-01-08T00:00:00.001Z" },
    ];
    const deps = makeDeps(wakatime);
    const received: string[][] = [];

    deps.currentProjectService.build = async (projects) => {
      received.push(projects.map((project) => project.name));
      return null;
    };
    deps.techStackService.build = async (input) => {
      received.push(input.recentProjects.map((project) => project.name));
      return { languages: [], frameworks: [], hasData: false };
    };

    await runOrchestrator(SAMPLE_README, {
      ...deps,
      now: () => Date.parse("2024-01-08T00:00:00.000Z"),
    });

    expect(received).toEqual([["recent"], ["recent"]]);
  });

  test("first-ever run when all APIs down: markers remain, no content injected", async () => {
    const emptyReadme = `# Profile

<!-- CODING_TIME:START -->
<!-- CODING_TIME:END -->

<!-- CURRENT_PROJECT:START -->
<!-- CURRENT_PROJECT:END -->

<!-- TECH_STACK:START -->
<!-- TECH_STACK:END -->
`;
    const deps = makeDeps(makeThrowingWakatime());

    const { updatedReadme } = await runOrchestrator(emptyReadme, deps);

    expect(updatedReadme).toBe(emptyReadme);
  });

  test("missing marker: section fails without corrupting the README", async () => {
    const readmeMissingMarker = `# Profile

Before

<!-- CODING_TIME:START -->
Last 7 Days: 5 hrs 12 mins
<!-- CODING_TIME:END -->

Middle

<!-- TECH_STACK:START -->
**Languages (Recently Used)**
![TypeScript](https://img.shields.io/badge/TypeScript-000000)
<!-- TECH_STACK:END -->

After
`;
    const deps = makeDeps(makeSuccessWakatime());

    const { updatedReadme, results } = await runOrchestrator(
      readmeMissingMarker,
      deps,
    );

    const currentProjectResult = results.find(
      (r) => r.section === "CURRENT_PROJECT",
    );
    expect(currentProjectResult?.ok).toBe(false);
    expect(currentProjectResult?.error).toMatch(/Missing start marker/);

    // The failing section never gets content injected, while the other two
    // sections still update (no full-file bail-out).
    expect(updatedReadme).toContain("**Last 7 Days:** 1 hr 0 mins");
    expect(updatedReadme).toContain("img.shields.io");
    expect(updatedReadme).not.toContain("I'm currently working on");
  });

  test("duplicate marker: section fails without corrupting the README", async () => {
    const duplicatedReadme = `# Profile

<!-- CODING_TIME:START -->
Last 7 Days: 5 hrs 12 mins
<!-- CODING_TIME:END -->
<!-- CODING_TIME:START -->
duplicate block
<!-- CODING_TIME:END -->
`;
    const deps = makeDeps(makeSuccessWakatime());

    const { updatedReadme, results } = await runOrchestrator(
      duplicatedReadme,
      deps,
    );

    const codingTimeResult = results.find((r) => r.section === "CODING_TIME");
    expect(codingTimeResult?.ok).toBe(false);
    expect(codingTimeResult?.error).toMatch(/Duplicate start marker/);
    expect(updatedReadme).toBe(duplicatedReadme);
  });
});
