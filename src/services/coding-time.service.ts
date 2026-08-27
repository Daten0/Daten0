import type {
  CodingActivity,
  CodingTimeSummary,
} from "../types/activity";

export class CodingTimeService {
  summarize(
    activity: CodingActivity,
    languageLimit = 5,
  ): CodingTimeSummary {
    const languages = [...activity.languages]
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, languageLimit);

    return {
      totalSeconds: activity.totalSeconds,
      text: activity.text,
      languages,
    };
  }
}