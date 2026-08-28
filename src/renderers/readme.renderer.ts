import type {
  CodingTimeSummary,
  CurrentProject,
  TechStack,
} from "../types/activity";

export type ReadmeSection =
  | "CURRENT_PROJECT"
  | "TECH_STACK"
  | "CODING_TIME";

export class ReadmeRenderer {
  replaceSection(
    readme: string,
    section: ReadmeSection,
    content: string,
  ): string {
    const startMarker = `<!-- ${section}:START -->`;
    const endMarker = `<!-- ${section}:END -->`;

    const startIndex = readme.indexOf(startMarker);
    const endIndex = readme.indexOf(endMarker);

    if (startIndex === -1) {
      throw new Error(`Missing start marker: ${startMarker}`);
    }

    if (endIndex === -1) {
      throw new Error(`Missing end marker: ${endMarker}`);
    }

    if (endIndex <= startIndex) {
      throw new Error(`Invalid marker order for section: ${section}`);
    }

    const before = readme.slice(
      0,
      startIndex + startMarker.length,
    );

    const after = readme.slice(endIndex);

    return `${before}\n${content.trim()}\n${after}`;
  }

  renderCodingTime(summary: CodingTimeSummary): string {
    if (summary.totalSeconds === 0) {
      return "No coding activity tracked in the last 7 days.";
    }

    const languages = summary.languages
      .map(
        (language) =>
          `- **${language.name}** — ${language.percentage.toFixed(1)}%`,
      )
      .join("\n");

    return [
      `**Last 7 Days:** ${summary.text}`,
      "",
      languages,
    ].join("\n");
  }

  renderCurrentProject(project: CurrentProject | null): string {
    if (!project) {
      return "- 🔭 I'm currently between projects.";
    }

    const label = project.repository
      ? `[**${project.name}**](${project.repository.htmlUrl})`
      : `**${project.name}**`;

    const description = project.repository?.description
      ? ` — ${project.repository.description}`
      : "";

    return `- 🔭 I'm currently working on ${label}${description}`;
  }

  renderTechStack(stack: TechStack): string {
    if (!stack.hasData) {
      return "_Recently Used technologies will appear here once activity is tracked._";
    }

    const lines: string[] = [];

    if (stack.languages.length > 0) {
      lines.push("**Languages (Recently Used)**");
      lines.push("");
      lines.push(stack.languages.map((l) => badge(l.name)).join(" "));
      lines.push("");
    }

    if (stack.frameworks.length > 0) {
      lines.push("**Frameworks & Tools (Recently Used)**");
      lines.push("");
      lines.push(stack.frameworks.map((f) => badge(f.name)).join(" "));
    }

    return lines.join("\n").trim();
  }
}

function badge(name: string): string {
  const color = colorFor(name);
  const label = encodeURIComponent(name);
  return `<img src="https://img.shields.io/badge/${label}-${color}?style=for-the-badge&logoColor=white" alt="${name}" />`;
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const palette = [
    "00ADD8",
    "FF6B6B",
    "4ECDC4",
    "FFD93D",
    "6BCB77",
    "4D96FF",
    "C780FA",
    "FF9F45",
    "2EC4B6",
    "E71D36",
  ];
  return palette[hash % palette.length]!;
}