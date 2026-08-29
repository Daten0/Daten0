import type { GitHubClient } from "../clients/github.client";
import type {
  CurrentProject,
  GitHubRepo,
  ProjectActivity,
} from "../types/activity";
import {
  parseRepoSlug,
  type ProjectRepoMapping,
} from "./project-mapping";

export type { ProjectRepoMapping } from "./project-mapping";
const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toTimestamp(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function filterRecentProjects(
  projects: ProjectActivity[],
  nowMs = Date.now(),
): ProjectActivity[] {
  const cutoff = nowMs - ACTIVITY_WINDOW_MS;
  return projects.filter((project) => {
    const timestamp = toTimestamp(project.lastHeartbeatAt);
    return timestamp >= cutoff && timestamp <= nowMs;
  });
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
    const publishableProjects = projects.filter((project) =>
      parseRepoSlug(mapping[project.name]) !== null,
    );
    const mostRecent = this.selectMostRecent(publishableProjects);
    if (!mostRecent) {
      return null;
    }

    const repoSlug = parseRepoSlug(mapping[mostRecent.name])!;
    let repository: GitHubRepo | null = null;

    const [owner, repo] = repoSlug;
    try {
      repository = await this.github.getRepository(owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `GitHub enrichment failed for mapped project: ${message}`,
      );
    }

    return {
      name: mostRecent.name,
      lastHeartbeatAt: mostRecent.lastHeartbeatAt,
      repository,
    };
  }
}
