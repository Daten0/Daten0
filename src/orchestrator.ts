import type { WakaTimeClient } from "./clients/wakatime.client";
import type { GitHubClient } from "./clients/github.client";
import type { ManifestReader } from "./clients/manifest-reader";
import type { CodingTimeService } from "./services/coding-time.service";
import type { CurrentProjectService } from "./services/current-project.service";
import type { TechStackService } from "./services/tech-stack.service";
import type { ReadmeRenderer } from "./renderers/readme.renderer";
import type { ProjectRepoMapping } from "./services/current-project.service";

export interface SectionResult {
  section: string;
  ok: boolean;
  error?: string;
}

export interface OrchestratorDeps {
  wakatime: WakaTimeClient;
  currentProjectService: CurrentProjectService;
  techStackService: TechStackService;
  codingTimeService: CodingTimeService;
  renderer: ReadmeRenderer;
  mapping: ProjectRepoMapping;
  localRepoPaths: string[];
}

export interface OrchestratorOutput {
  updatedReadme: string;
  results: SectionResult[];
}

export async function runOrchestrator(
  readme: string,
  deps: OrchestratorDeps,
): Promise<OrchestratorOutput> {
  const results: SectionResult[] = [];
  let updatedReadme = readme;

  try {
    const activity = await deps.wakatime.getLast7DaysActivity();
    const summary = deps.codingTimeService.summarize(activity);
    const markdown = deps.renderer.renderCodingTime(summary);
    updatedReadme = deps.renderer.replaceSection(
      updatedReadme,
      "CODING_TIME",
      markdown,
    );
    results.push({ section: "CODING_TIME", ok: true });
  } catch (error) {
    results.push({
      section: "CODING_TIME",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const projects = await deps.wakatime.getRecentProjectActivity();
    const current = await deps.currentProjectService.build(
      projects,
      deps.mapping,
    );
    const markdown = deps.renderer.renderCurrentProject(current);
    updatedReadme = deps.renderer.replaceSection(
      updatedReadme,
      "CURRENT_PROJECT",
      markdown,
    );
    results.push({ section: "CURRENT_PROJECT", ok: true });
  } catch (error) {
    results.push({
      section: "CURRENT_PROJECT",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const [activity, projects] = await Promise.all([
      deps.wakatime.getLast7DaysActivity(),
      deps.wakatime.getRecentProjectActivity(),
    ]);

    const stack = await deps.techStackService.build({
      wakatimeLanguages: activity.languages,
      recentProjects: projects,
      mapping: deps.mapping,
      localRepoPaths: deps.localRepoPaths,
    });

    const markdown = deps.renderer.renderTechStack(stack);
    updatedReadme = deps.renderer.replaceSection(
      updatedReadme,
      "TECH_STACK",
      markdown,
    );
    results.push({ section: "TECH_STACK", ok: true });
  } catch (error) {
    results.push({
      section: "TECH_STACK",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { updatedReadme, results };
}
