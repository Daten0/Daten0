import { config } from "./config";
import { WakaTimeClient } from "./clients/wakatime.client";
import { GitHubClient } from "./clients/github.client";
import { ManifestReader } from "./clients/manifest-reader";
import { CodingTimeService } from "./services/coding-time.service";
import { CurrentProjectService } from "./services/current-project.service";
import { TechStackService } from "./services/tech-stack.service";
import { ReadmeRenderer } from "./renderers/readme.renderer";
import { runOrchestrator } from "./orchestrator";

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

const readme = await Bun.file("README.md").text();

const { updatedReadme, results } = await runOrchestrator(readme, {
  wakatime,
  currentProjectService,
  techStackService,
  codingTimeService,
  renderer,
  mapping: config.currentProject.mapping,
  localRepoPaths: config.techStack.localRepoPaths,
});

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
