import { describe, expect, test } from "bun:test";

import { GitHubClient } from "../src/clients/github.client";
import { TechStackService } from "../src/services/tech-stack.service";
import { ManifestReader, type FileSystem } from "../src/clients/manifest-reader";
import type { LanguageActivity } from "../src/types/activity";

class MockGitHubClient extends GitHubClient {
  private readonly languagesMap: Record<string, string[]>;

  constructor(languagesMap: Record<string, string[]> = {}) {
    super(null);
    this.languagesMap = languagesMap;
  }

  override async getRepositoryLanguages(owner: string, repo: string): Promise<string[]> {
    const key = `${owner}/${repo}`;
    return this.languagesMap[key] ?? [];
  }
}

class MemoryFs implements FileSystem {
  constructor(private readonly files: Record<string, string>) {}

  async exists(path: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.files, path);
  }

  async readText(path: string): Promise<string> {
    const content = this.files[path];
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  }
}

function makeWakatimeLanguages(
  names: string[],
): LanguageActivity[] {
  return names.map((name, i) => ({
    name,
    totalSeconds: 1000 - i * 100,
    percentage: 50 - i * 10,
  }));
}

describe("TechStackService", () => {
  test("returns empty when no input data", async () => {
    const github = new MockGitHubClient();
    const manifestReader = new ManifestReader(new MemoryFs({}));
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: [],
      recentProjects: [],
      mapping: {},
      localRepoPaths: [],
    });

    expect(result).toEqual({ languages: [], frameworks: [], hasData: false });
  });

  test("includes WakaTime languages up to limit", async () => {
    const github = new MockGitHubClient();
    const manifestReader = new ManifestReader(new MemoryFs({}));
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: makeWakatimeLanguages(["TypeScript", "Rust", "Go", "Python", "Java", "C++"]),
      recentProjects: [],
      mapping: {},
      localRepoPaths: [],
      languageLimit: 3,
    });

    expect(result.languages).toHaveLength(3);
    expect(result.languages.map((l) => l.name)).toEqual(["TypeScript", "Rust", "Go"]);
    expect(result.languages.every((l) => l.source === "wakatime")).toBe(true);
  });

  test("adds GitHub languages from mapped projects", async () => {
    const github = new MockGitHubClient({
      "owner/repo-a": ["Go", "Dockerfile"],
      "owner/repo-b": ["Python", "YAML"],
    });
    const manifestReader = new ManifestReader(new MemoryFs({}));
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: makeWakatimeLanguages(["TypeScript"]),
      recentProjects: [
        { name: "project-a" },
        { name: "project-b" },
        { name: "unmapped-project" },
      ],
      mapping: {
        "project-a": "owner/repo-a",
        "project-b": "owner/repo-b",
      },
      localRepoPaths: [],
    });

    const langNames = result.languages.map((l) => l.name).sort();
    expect(langNames).toContain("TypeScript");
    expect(langNames).toContain("Go");
    expect(langNames).toContain("Dockerfile");
    expect(langNames).toContain("Python");
    expect(langNames).toContain("YAML");
  });

  test("deduplicates languages across WakaTime and GitHub", async () => {
    const github = new MockGitHubClient({
      "owner/repo-a": ["TypeScript", "React"],
    });
    const manifestReader = new ManifestReader(new MemoryFs({}));
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: makeWakatimeLanguages(["TypeScript", "Rust"]),
      recentProjects: [{ name: "project-a" }],
      mapping: { "project-a": "owner/repo-a" },
      localRepoPaths: [],
    });

    const names = result.languages.map((l) => l.name);
    const tsCount = names.filter((n) => n === "TypeScript").length;
    expect(tsCount).toBe(1);
  });

  test("adds manifest frameworks from local repo paths", async () => {
    const github = new MockGitHubClient();
    const fs = new MemoryFs({
      "/local/repo1/package.json": JSON.stringify({
        dependencies: { react: "^18", express: "^4" },
      }),
      "/local/repo2/package.json": JSON.stringify({
        dependencies: { vue: "^3", express: "^4" },
      }),
    });
    const manifestReader = new ManifestReader(fs);
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: [],
      recentProjects: [],
      mapping: {},
      localRepoPaths: ["/local/repo1", "/local/repo2"],
      frameworkLimit: 10,
    });

    expect(result.frameworks.map((f) => f.name)).toEqual([
      "express",
      "react",
      "vue",
    ]);
    expect(result.frameworks.every((f) => f.source === "manifest")).toBe(true);
  });

  test("respects frameworkLimit", async () => {
    const github = new MockGitHubClient();
    const fs = new MemoryFs({
      "/local/repo/package.json": JSON.stringify({
        dependencies: {
          a: "1", b: "2", c: "3", d: "4", e: "5", f: "6",
        },
      }),
    });
    const manifestReader = new ManifestReader(fs);
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: [],
      recentProjects: [],
      mapping: {},
      localRepoPaths: ["/local/repo"],
      frameworkLimit: 3,
    });

    expect(result.frameworks).toHaveLength(3);
  });

  test("gracefully handles GitHub fetch failures", async () => {
    const github = new MockGitHubClient();
    github.getRepositoryLanguages = async () => {
      throw new Error("network error");
    };
    const manifestReader = new ManifestReader(new MemoryFs({}));
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: makeWakatimeLanguages(["TypeScript"]),
      recentProjects: [{ name: "project-a" }],
      mapping: { "project-a": "owner/bad-repo" },
      localRepoPaths: [],
    });

    expect(result.languages.map((l) => l.name)).toEqual(["TypeScript"]);
  });

  test("gracefully handles manifest read failures", async () => {
    const github = new MockGitHubClient();
    const fs = new MemoryFs({});
    fs.exists = async () => true;
    fs.readText = async () => { throw new Error("permission denied"); };
    const manifestReader = new ManifestReader(fs);
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: makeWakatimeLanguages(["TypeScript"]),
      recentProjects: [],
      mapping: {},
      localRepoPaths: ["/unreadable"],
    });

    expect(result.languages.map((l) => l.name)).toEqual(["TypeScript"]);
    expect(result.frameworks).toEqual([]);
  });

  test("deduplicates frameworks across multiple repos", async () => {
    const github = new MockGitHubClient();
    const fs = new MemoryFs({
      "/repo-a/package.json": JSON.stringify({ dependencies: { react: "^18", express: "^4" } }),
      "/repo-b/package.json": JSON.stringify({ dependencies: { react: "^18", vue: "^3" } }),
    });
    const manifestReader = new ManifestReader(fs);
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: [],
      recentProjects: [],
      mapping: {},
      localRepoPaths: ["/repo-a", "/repo-b"],
    });

    expect(result.frameworks.map((f) => f.name)).toEqual(["express", "react", "vue"]);
  });

  test("hasData is false when both arrays empty", async () => {
    const github = new MockGitHubClient();
    const manifestReader = new ManifestReader(new MemoryFs({}));
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: [],
      recentProjects: [],
      mapping: {},
      localRepoPaths: [],
    });

    expect(result.hasData).toBe(false);
  });

  test("hasData is true when either array has items", async () => {
    const github = new MockGitHubClient();
    const manifestReader = new ManifestReader(new MemoryFs({}));
    const service = new TechStackService(github, manifestReader);

    const result = await service.build({
      wakatimeLanguages: makeWakatimeLanguages(["TypeScript"]),
      recentProjects: [],
      mapping: {},
      localRepoPaths: [],
    });

    expect(result.hasData).toBe(true);
  });
});