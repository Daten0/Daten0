import type { GitHubClient } from "../clients/github.client";
import type { ManifestReader } from "../clients/manifest-reader";
import type {
  LanguageActivity,
  TechStack,
  TechStackItem,
} from "../types/activity";
import {
  parseRepoSlug,
  type ProjectRepoMapping,
} from "./project-mapping";

export interface TechStackBuildInput {
  wakatimeLanguages: LanguageActivity[];
  recentProjects: { name: string }[];
  mapping: ProjectRepoMapping;
  localRepoPaths: string[];
  languageLimit?: number;
  frameworkLimit?: number;
}

export class TechStackService {
  constructor(
    private readonly github: GitHubClient,
    private readonly manifestReader: ManifestReader,
  ) {}

  async build(input: TechStackBuildInput): Promise<TechStack> {
    const languageLimit = input.languageLimit ?? 5;
    const frameworkLimit = input.frameworkLimit ?? 8;

    const wakatimeLanguageItems: TechStackItem[] = input.wakatimeLanguages.map(
      (lang) => ({ name: lang.name, source: "wakatime" as const }),
    );

    const githubLanguages = await this.collectGithubLanguages(
      input.recentProjects,
      input.mapping,
    );

    const manifestFrameworks = await this.collectManifestFrameworks(
      input.localRepoPaths,
    );

    const languages = mergeLimited(
      wakatimeLanguageItems,
      githubLanguages,
      languageLimit,
    );

    const frameworks = mergeUnique(manifestFrameworks).slice(
      0,
      frameworkLimit,
    );

    return {
      languages,
      frameworks,
      hasData: languages.length > 0 || frameworks.length > 0,
    };
  }

  private async collectGithubLanguages(
    projects: { name: string }[],
    mapping: ProjectRepoMapping,
  ): Promise<TechStackItem[]> {
    const collected: TechStackItem[] = [];
    const seen = new Set<string>();

    for (const project of projects) {
      const slug = parseRepoSlug(mapping[project.name]);
      if (!slug) continue;
      const [owner, repo] = slug;

      try {
        const languages = await this.github.getRepositoryLanguages(
          owner,
          repo,
        );
        for (const language of languages) {
          if (!seen.has(language)) {
            seen.add(language);
            collected.push({ name: language, source: "github" });
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.warn(
          `GitHub language fetch failed for "${owner}/${repo}": ${message}`,
        );
      }
    }

    return collected;
  }

  private async collectManifestFrameworks(
    localRepoPaths: string[],
  ): Promise<TechStackItem[]> {
    if (localRepoPaths.length === 0) {
      return [];
    }

    try {
      const names = await this.manifestReader.readFrameworks(localRepoPaths);
      return names.map((name) => ({ name, source: "manifest" }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.warn(`Manifest read failed: ${message}`);
      return [];
    }
  }
}

function mergeUnique(items: TechStackItem[]): TechStackItem[] {
  const seen = new Set<string>();
  const result: TechStackItem[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Merges WakaTime and GitHub language sources up to `limit` while ensuring
 * both sources are represented. A share of the limit is reserved for
 * GitHub-derived languages (otherwise they are silently dropped whenever
 * WakaTime already fills the limit). If one source under-fills its share,
 * the other tops up the remaining slots.
 */
function mergeLimited(
  wakatimeItems: TechStackItem[],
  githubItems: TechStackItem[],
  limit: number,
): TechStackItem[] {
  if (limit <= 0) return [];

  const githubShare = Math.min(
    githubItems.length,
    Math.max(1, Math.floor(limit / 2)),
  );
  const wakatimeShare = limit - githubShare;

  const result: TechStackItem[] = [];
  const seen = new Set<string>();
  const append = (items: TechStackItem[]) => {
    for (const item of items) {
      if (result.length === limit) return;
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  };

  append(wakatimeItems.slice(0, wakatimeShare));
  append(githubItems.slice(0, githubShare));

  if (result.length < limit) {
    append([
      ...wakatimeItems.slice(wakatimeShare),
      ...githubItems.slice(githubShare),
    ]);
  }

  return result;
}
