import type { GitHubClient } from "../clients/github.client";
import type { ManifestReader } from "../clients/manifest-reader";
import type {
  LanguageActivity,
  TechStack,
  TechStackItem,
} from "../types/activity";

export type ProjectRepoMapping = Record<string, string>;

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

    const wakatimeLanguageItems: TechStackItem[] = input.wakatimeLanguages
      .slice(0, languageLimit)
      .map((lang) => ({ name: lang.name, source: "wakatime" as const }));

    const githubLanguages = await this.collectGithubLanguages(
      input.recentProjects,
      input.mapping,
    );

    const manifestFrameworks = await this.collectManifestFrameworks(
      input.localRepoPaths,
    );

    const languages = mergeUnique([
      ...wakatimeLanguageItems,
      ...githubLanguages,
    ]).slice(0, languageLimit);

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
      const slug = mapping[project.name];
      if (!slug) continue;
      const [owner, repo] = slug.split("/");
      if (!owner || !repo) continue;

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
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    result.push(item);
  }
  return result;
}