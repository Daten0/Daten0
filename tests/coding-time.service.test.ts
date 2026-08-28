import { describe, expect, test } from "bun:test";

import { CodingTimeService } from "../src/services/coding-time.service";
import type { CodingActivity } from "../src/types/activity";

describe("CodingTimeService", () => {
  const service = new CodingTimeService();

  test("sorts languages by totalSeconds descending", () => {
    const activity: CodingActivity = {
      totalSeconds: 6000,
      text: "1 hr 40 mins",
      languages: [
        { name: "Python", totalSeconds: 600, percentage: 10 },
        { name: "TypeScript", totalSeconds: 3000, percentage: 50 },
        { name: "Go", totalSeconds: 1500, percentage: 25 },
        { name: "Rust", totalSeconds: 900, percentage: 15 },
      ],
    };

    const summary = service.summarize(activity);

    expect(summary.languages.map((l) => l.name)).toEqual([
      "TypeScript",
      "Go",
      "Rust",
      "Python",
    ]);
  });

  test("limits languages to top 5 by default", () => {
    const activity: CodingActivity = {
      totalSeconds: 1000,
      text: "16 mins 40 secs",
      languages: [
        { name: "A", totalSeconds: 100, percentage: 10 },
        { name: "B", totalSeconds: 100, percentage: 10 },
        { name: "C", totalSeconds: 100, percentage: 10 },
        { name: "D", totalSeconds: 100, percentage: 10 },
        { name: "E", totalSeconds: 100, percentage: 10 },
        { name: "F", totalSeconds: 100, percentage: 10 },
        { name: "G", totalSeconds: 100, percentage: 10 },
      ],
    };

    const summary = service.summarize(activity);

    expect(summary.languages).toHaveLength(5);
  });

  test("respects a custom languageLimit", () => {
    const activity: CodingActivity = {
      totalSeconds: 500,
      text: "8 mins 20 secs",
      languages: [
        { name: "A", totalSeconds: 100, percentage: 20 },
        { name: "B", totalSeconds: 100, percentage: 20 },
        { name: "C", totalSeconds: 100, percentage: 20 },
        { name: "D", totalSeconds: 100, percentage: 20 },
        { name: "E", totalSeconds: 100, percentage: 20 },
      ],
    };

    const summary = service.summarize(activity, 2);

    expect(summary.languages).toHaveLength(2);
  });

  test("preserves totalSeconds and human-readable text", () => {
    const activity: CodingActivity = {
      totalSeconds: 7200,
      text: "2 hrs 0 mins",
      languages: [{ name: "Go", totalSeconds: 7200, percentage: 100 }],
    };

    const summary = service.summarize(activity);

    expect(summary.totalSeconds).toBe(7200);
    expect(summary.text).toBe("2 hrs 0 mins");
  });

  test("does not mutate the input activity", () => {
    const activity: CodingActivity = {
      totalSeconds: 1000,
      text: "16 mins 40 secs",
      languages: [
        { name: "Python", totalSeconds: 200, percentage: 20 },
        { name: "TypeScript", totalSeconds: 800, percentage: 80 },
      ],
    };

    const originalOrder = activity.languages.map((l) => l.name);

    service.summarize(activity);

    expect(activity.languages.map((l) => l.name)).toEqual(originalOrder);
  });

  test("handles empty languages array", () => {
    const activity: CodingActivity = {
      totalSeconds: 0,
      text: "0 secs",
      languages: [],
    };

    const summary = service.summarize(activity);

    expect(summary.languages).toEqual([]);
    expect(summary.totalSeconds).toBe(0);
  });
});
