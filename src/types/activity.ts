export interface LanguageActivity {
  name: string;
  totalSeconds: number;
  percentage: number;
}

export interface CodingActivity {
  totalSeconds: number;
  text: string;
  languages: LanguageActivity[];
}

export interface CodingTimeSummary {
  totalSeconds: number;
  text: string;
  languages: LanguageActivity[];
}

export interface CodingProject {
  name: string;
  repository?: string;
  lastHeartbeatAt?: string;
}