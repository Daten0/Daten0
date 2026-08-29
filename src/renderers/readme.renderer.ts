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
    const startLastIndex = readme.lastIndexOf(startMarker);
    const endIndex = readme.indexOf(endMarker);
    const endLastIndex = readme.lastIndexOf(endMarker);

    if (startIndex === -1) {
      throw new Error(`Missing start marker: ${startMarker}`);
    }

    if (startIndex !== startLastIndex) {
      throw new Error(`Duplicate start marker for section: ${section}`);
    }

    if (endIndex === -1) {
      throw new Error(`Missing end marker: ${endMarker}`);
    }

    if (endIndex !== endLastIndex) {
      throw new Error(`Duplicate end marker for section: ${section}`);
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
          `- **${escapeMarkdownText(language.name)}** — ${language.percentage.toFixed(1)}%`,
      )
      .join("\n");

    return [
      `**Last 7 Days:** ${escapeMarkdownText(summary.text)}`,
      "",
      languages,
    ].join("\n");
  }

  renderCurrentProject(project: CurrentProject | null): string {
    if (!project) {
      return "- 🔭 I'm currently between projects.";
    }

    const label = project.repository
      ? `[**${escapeMarkdownText(project.name)}**](${project.repository.htmlUrl})`
      : `**${escapeMarkdownText(project.name)}**`;

    const description = project.repository?.description
      ? ` — ${escapeMarkdownText(project.repository.description)}`
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
  const normalizedName = normalizeExternalText(name);
  const color = colorFor(normalizedName);
  const label = encodeURIComponent(normalizedName);
  const alt = escapeHtmlAttribute(normalizedName);
  return `<img src="https://img.shields.io/badge/${label}-${color}?style=for-the-badge&logoColor=white" alt="${alt}" />`;
}

function escapeMarkdownText(value: string): string {
  return normalizeExternalText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]()])/g, "\\$1");
}

function normalizeExternalText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Escapes a value for use inside a double-quoted HTML attribute. */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
