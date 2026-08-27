import type {
  CodingActivity,
  LanguageActivity,
} from "../types/activity";

interface WakaTimeLanguage {
  name: string;
  total_seconds: number;
  percent: number;
}

interface WakaTimeStats {
  data: {
    total_seconds: number;
    human_readable_total: string;
    languages: WakaTimeLanguage[];
  };
}

export class WakaTimeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://wakatime.com/api/v1",
  ) {}

  async getLast7DaysActivity(): Promise<CodingActivity> {
    const response = await fetch(
      `${this.baseUrl}/users/current/stats/last_7_days`,
      {
        headers: {
          Authorization: `Basic ${btoa(this.apiKey)}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `WakaTime request failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as WakaTimeStats;

    const languages: LanguageActivity[] = body.data.languages.map(
      (language) => ({
        name: language.name,
        totalSeconds: language.total_seconds,
        percentage: language.percent,
      }),
    );

    return {
      totalSeconds: body.data.total_seconds,
      text: body.data.human_readable_total,
      languages,
    };
  }
}