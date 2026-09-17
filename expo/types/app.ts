export interface UserProfile {
  averagePuffsPerDay: number;
  journeyStartDate: string;
}

export type HitReason = "Stress" | "Habit" | "Focus" | "Bored" | "Other";

export interface Hit {
  id: string;
  timestamp: string;
  reason?: HitReason;
  isBackfill?: boolean;
}

export interface DailyStats {
  date: string;
  count: number;
  hourlyBreakdown: HourlyStats[];
}

export interface HourlyStats {
  hour: number;
  count: number;
}

export type ThemeMode = "light" | "dark";

export interface AppData {
  userProfile: UserProfile | null;
  hits: Hit[];
  theme: ThemeMode;
  lastHitTime: string | null;
  hasBackfilled?: boolean;
}
