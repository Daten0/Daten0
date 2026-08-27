import { config } from "./config";
import { WakaTimeClient } from "./clients/wakatime.client";
import { CodingTimeService } from "./services/coding-time.service";
import { ReadmeRenderer } from "./renderers/readme.renderer";

const wakatime = new WakaTimeClient(
  config.wakatime.apiKey,
  config.wakatime.baseUrl,
);

const codingTimeService = new CodingTimeService();
const renderer = new ReadmeRenderer();

const activity = await wakatime.getLast7DaysActivity();

const summary = codingTimeService.summarize(activity);

const codingTimeMarkdown =
  renderer.renderCodingTime(summary);

const readmeFile = Bun.file("README.md");
const readme = await readmeFile.text();

const updatedReadme = renderer.replaceSection(
  readme,
  "CODING_TIME",
  codingTimeMarkdown,
);

await Bun.write("README.md", updatedReadme);

console.log("✓ Coding activity updated");