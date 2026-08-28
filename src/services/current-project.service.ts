import type { GitHubClient } from "../clients/github.client";
import type {
  CurrentProject,
  GitHubRepo,
  ProjectActivity,
} from "../types/activity";

export type ProjectRepoMapping = Record<string, string>;

function toTimestamp(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export class CurrentProjectService {
  constructor(private readonly github: GitHubClient) {}

  selectMostRecent(
    projects: ProjectActivity[],
  ): ProjectActivity | null {
    if (projects.length === 0) {
      return null;
    }

    return [...projects].sort(
      (a, b) => toTimestamp(b.lastHeartbeatAt) - toTimestamp(a.lastHeartbeatAt),
    )[0]!;
  }

  async build(
    projects: ProjectActivity[],
    mapping: ProjectRepoMapping = {},
  ): Promise<CurrentProject | null> {
    const mostRecent = this.selectMostRecent(projects);
    if (!mostRecent) {
      return null;
    }

    const repoSlug = mapping[mostRecent.name];
    let repository: GitHubRepo | null = null;

    if (repoSlug) {
      const [owner, repo] = repoSlug.split("/");
      if (owner && repo) {
        try {
          repository = await this.github.getRepository(owner, repo);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `GitHub enrichment failed for project "${mostRecent.name}": ${message}`,
          );
          repository = null;
        }
      }
    }

    return {
      name: mostRecent.name,
      lastHeartbeatAt: mostRecent.lastHeartbeatAt,
      totalSeconds: mostRecent.totalSeconds,
      repository,
    };
  }
}