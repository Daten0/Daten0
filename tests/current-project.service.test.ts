import { describe, expect, test } from "bun:test";

import { GitHubClient } from "../src/clients/github.client";
import {
  CurrentProjectService,
  filterRecentProjects,
} from "../src/services/current-project.service";
import type { ProjectActivity } from "../src/types/activity";

function makeProject(
  name: string,
  lastHeartbeatAt: string,
): ProjectActivity {
  return {
    name,
    lastHeartbeatAt,
  };
}

describe("CurrentProjectService", () => {
  test("filterRecentProjects keeps only activity from the last seven days", () => {
    const now = Date.parse("2024-01-08T00:00:00.000Z");
    const projects = [
      makeProject("inside", "2024-01-01T00:00:00.000Z"),
      makeProject("too-old", "2023-12-31T23:59:59.999Z"),
      makeProject("future", "2024-01-08T00:00:00.001Z"),
    ];

    expect(filterRecentProjects(projects, now).map((project) => project.name))
      .toEqual(["inside"]);
  });

  test("selectMostRecent returns null for empty list", () => {
    const service = new CurrentProjectService(new GitHubClient());
    expect(service.selectMostRecent([])).toBeNull();
  });

  test("selectMostRecent picks the project with the latest heartbeat", () => {
    const service = new CurrentProjectService(new GitHubClient());
    const projects = [
      makeProject("older", "2024-01-01T10:00:00.000Z"),
      makeProject("newest", "2024-01-05T10:00:00.000Z"),
      makeProject("middle", "2024-01-03T10:00:00.000Z"),
    ];

    const result = service.selectMostRecent(projects);
    expect(result?.name).toBe("newest");
  });

  test("selectMostRecent does not mutate input order", () => {
    const service = new CurrentProjectService(new GitHubClient());
    const projects = [
      makeProject("first", "2024-01-05T10:00:00.000Z"),
      makeProject("second", "2024-01-01T10:00:00.000Z"),
    ];

    service.selectMostRecent(projects);
    expect(projects.map((p) => p.name)).toEqual(["first", "second"]);
  });

  test("handles malformed date strings without NaN ordering bugs", () => {
    const service = new CurrentProjectService(new GitHubClient());
    const projects = [
      makeProject("with-recent-date", "2024-01-05T10:00:00.000Z"),
      makeProject("with-bad-date", "not-a-date"),
    ];

    // Malformed dates sort as epoch zero (oldest), so a valid date always wins.
    const result = service.selectMostRecent(projects);
    expect(result?.name).toBe("with-recent-date");
  });

  test("selectMostRecent is deterministic when all dates are malformed", () => {
    const service = new CurrentProjectService(new GitHubClient());
    const projects = [
      makeProject("first", "garbage"),
      makeProject("second", "also-garbage"),
    ];

    const result = service.selectMostRecent(projects);
    // Both timestamps are 0; the comparator returns 0 and the stable sort
    // keeps the first element in place.
    expect(result?.name).toBe("first");
  });

  test("build returns null when no projects exist", async () => {
    const service = new CurrentProjectService(new GitHubClient());
    const result = await service.build([]);
    expect(result).toBeNull();
  });

  test("build does not publish an unmapped project", async () => {
    const service = new CurrentProjectService(new GitHubClient());
    const projects = [makeProject("my-app", "2024-01-05T10:00:00.000Z")];

    const result = await service.build(projects, {});

    expect(result).toBeNull();
  });

  test("build attaches GitHub repo when mapping matches and API succeeds", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          full_name: "me/my-app",
          html_url: "https://github.com/me/my-app",
          description: "My app",
          language: "TypeScript",
          stargazers_count: 3,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const service = new CurrentProjectService(new GitHubClient());
      const projects = [makeProject("my-app", "2024-01-05T10:00:00.000Z")];

      const result = await service.build(projects, { "my-app": "me/my-app" });

      expect(result?.name).toBe("my-app");
      expect(result?.repository).toEqual({
        fullName: "me/my-app",
        htmlUrl: "https://github.com/me/my-app",
        description: "My app",
        language: "TypeScript",
        starCount: 3,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("build gracefully returns null repository when GitHub lookup fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("not found", { status: 404 })) as unknown as typeof fetch;

    try {
      const service = new CurrentProjectService(new GitHubClient());
      const projects = [makeProject("my-app", "2024-01-05T10:00:00.000Z")];

      const result = await service.build(projects, { "my-app": "me/my-app" });

      expect(result?.name).toBe("my-app");
      expect(result?.repository).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("build returns null when mappings do not match activity", async () => {
    const service = new CurrentProjectService(new GitHubClient());
    const projects = [makeProject("my-app", "2024-01-05T10:00:00.000Z")];

    const result = await service.build(projects, {
      "different-project": "me/different-project",
    });

    expect(result).toBeNull();
  });

  test("build ignores malformed mapping entries", async () => {
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = (async () => {
      called++;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const service = new CurrentProjectService(new GitHubClient());
      const projects = [makeProject("my-app", "2024-01-05T10:00:00.000Z")];

      const result = await service.build(projects, { "my-app": "not-a-slug" });

      expect(called).toBe(0);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("build skips a newer unmapped project", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          full_name: "me/public-app",
          html_url: "https://github.com/me/public-app",
          description: null,
          language: "TypeScript",
          stargazers_count: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const service = new CurrentProjectService(new GitHubClient());
      const projects = [
        makeProject("private-client", "2024-01-06T10:00:00.000Z"),
        makeProject("public-app", "2024-01-05T10:00:00.000Z"),
      ];

      const result = await service.build(projects, {
        "public-app": "me/public-app",
      });

      expect(result?.name).toBe("public-app");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
