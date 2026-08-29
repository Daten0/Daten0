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

export interface ProjectActivity {
  name: string;
  lastHeartbeatAt: string;
}

export interface GitHubRepo {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  starCount: number;
}

export interface CurrentProject {
  name: string;
  lastHeartbeatAt: string;
  repository: GitHubRepo | null;
}

export type TechStackSource = "wakatime" | "github" | "manifest";

export interface TechStackItem {
  name: string;
  source: TechStackSource;
}

export interface TechStack {
  languages: TechStackItem[];
  frameworks: TechStackItem[];
  hasData: boolean;
}
