import type { CodingTimeSummary } from "../types/activity";

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
}

