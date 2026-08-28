import { config } from "./config";
import { WakaTimeClient } from "./clients/wakatime.client";
import { GitHubClient } from "./clients/github.client";
import { ManifestReader } from "./clients/manifest-reader";
import { CodingTimeService } from "./services/coding-time.service";
import { CurrentProjectService } from "./services/current-project.service";
import { TechStackService } from "./services/tech-stack.service";
import { ReadmeRenderer } from "./renderers/readme.renderer";

const wakatime = new WakaTimeClient(
  config.wakatime.apiKey,
  config.wakatime.baseUrl,
);

const github = new GitHubClient(
  config.github.token,
  config.github.baseUrl,
);

const manifestReader = new ManifestReader();

const codingTimeService = new CodingTimeService();
const currentProjectService = new CurrentProjectService(github);
const techStackService = new TechStackService(github, manifestReader);
const renderer = new ReadmeRenderer();

const readmeFile = Bun.file("README.md");
const readme = await readmeFile.text();

const results: { section: string; ok: boolean; error?: string }[] = [];
let updatedReadme = readme;

try {
  const activity = await wakatime.getLast7DaysActivity();
  const summary = codingTimeService.summarize(activity);
  const markdown = renderer.renderCodingTime(summary);
  updatedReadme = renderer.replaceSection(
    updatedReadme,
    "CODING_TIME",
    markdown,
  );
  results.push({ section: "CODING_TIME", ok: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  results.push({ section: "CODING_TIME", ok: false, error: message });
}

try {
  const projects = await wakatime.getRecentProjectActivity();
  const current = await currentProjectService.build(
    projects,
    config.currentProject.mapping,
  );
  const markdown = renderer.renderCurrentProject(current);
  updatedReadme = renderer.replaceSection(
    updatedReadme,
    "CURRENT_PROJECT",
    markdown,
  );
  results.push({ section: "CURRENT_PROJECT", ok: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  results.push({ section: "CURRENT_PROJECT", ok: false, error: message });
}

try {
  const [activity, projects] = await Promise.all([
    wakatime.getLast7DaysActivity(),
    wakatime.getRecentProjectActivity(),
  ]);

  const stack = await techStackService.build({
    wakatimeLanguages: activity.languages,
    recentProjects: projects,
    mapping: config.currentProject.mapping,
    localRepoPaths: config.techStack.localRepoPaths,
  });

  const markdown = renderer.renderTechStack(stack);
  updatedReadme = renderer.replaceSection(
    updatedReadme,
    "TECH_STACK",
    markdown,
  );
  results.push({ section: "TECH_STACK", ok: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  results.push({ section: "TECH_STACK", ok: false, error: message });
}

if (updatedReadme !== readme) {
  await Bun.write("README.md", updatedReadme);
}

for (const result of results) {
  if (result.ok) {
    console.log(`✓ ${result.section} updated`);
  } else {
    console.error(`✗ ${result.section} failed: ${result.error}`);
  }
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  process.exit(1);
}