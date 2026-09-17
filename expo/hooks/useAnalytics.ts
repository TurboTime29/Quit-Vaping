import { useMemo } from "react";
import { useApp } from "../contexts/AppContext";
import type { DailyStats, HourlyStats } from "../types/app";

export function useAnalytics() {
  const { data } = useApp();

  // Backfill hits are pre-quit historical data used only for chart visualisation.
  // All streak / avoidance stats should be based on real (non-backfill) hits only.
  const realHits = useMemo(() => data.hits.filter(h => !h.isBackfill), [data.hits]);

  const getLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDailyStats = useMemo((): DailyStats[] => {
    if (!data.userProfile) return [];

    const stats = new Map<string, { count: number; hourly: Map<number, number> }>();

    data.hits.forEach((hit) => {
      const date = new Date(hit.timestamp);
      const dateKey = getLocalDateKey(date);
      const hour = date.getHours();

      if (!stats.has(dateKey)) {
        stats.set(dateKey, { count: 0, hourly: new Map() });
      }

      const dayStat = stats.get(dateKey)!;
      dayStat.count += 1;
      dayStat.hourly.set(hour, (dayStat.hourly.get(hour) || 0) + 1);
    });

    const result: DailyStats[] = [];
    stats.forEach((stat, dateKey) => {
      const hourlyBreakdown: HourlyStats[] = [];
      for (let h = 0; h < 24; h++) {
        hourlyBreakdown.push({ hour: h, count: stat.hourly.get(h) || 0 });
      }

      result.push({
        date: dateKey,
        count: stat.count,
        hourlyBreakdown,
      });
    });

    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [data.hits, data.userProfile]);

  const dailyStatsMap = useMemo(
    () => new Map(getDailyStats.map((s) => [s.date, s])),
    [getDailyStats]
  );

  const last7DaysStats = useMemo((): DailyStats[] => {
    const today = new Date();
    const stats: DailyStats[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateKey = getLocalDateKey(date);

      stats.push(
        dailyStatsMap.get(dateKey) || {
          date: dateKey,
          count: 0,
          hourlyBreakdown: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 })),
        }
      );
    }

    return stats;
  }, [dailyStatsMap]);

  const todayStats = useMemo((): DailyStats => {
    const today = getLocalDateKey(new Date());
    return (
      dailyStatsMap.get(today) || {
        date: today,
        count: 0,
        hourlyBreakdown: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 })),
      }
    );
  }, [dailyStatsMap]);

  const dailyAverage = useMemo((): number => {
    if (!data.userProfile || getDailyStats.length === 0) return 0;

    const startDate = new Date(data.userProfile.journeyStartDate);
    startDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysPassed = Math.max(
      1,
      Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    return realHits.length / daysPassed;
  }, [realHits.length, data.userProfile, getDailyStats.length]);

  const totalHitsTaken = useMemo((): number => {
    return realHits.length;
  }, [realHits.length]);

  const totalHitsAvoided = useMemo((): number => {
    if (!data.userProfile) return 0;

    const startDate = new Date(data.userProfile.journeyStartDate);
    const now = new Date();
    const daysPassed = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    const expectedHits = data.userProfile.averagePuffsPerDay * daysPassed;
    const avoided = Math.max(0, expectedHits - realHits.length);

    return Math.floor(avoided);
  }, [data.userProfile, realHits.length]);

  const longestStreak = useMemo((): number => {
    if (realHits.length === 0) {
      if (data.userProfile) {
        const startDate = new Date(data.userProfile.journeyStartDate);
        const now = new Date();
        return now.getTime() - startDate.getTime();
      }
      return 0;
    }

    const sortedHits = [...realHits].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let maxStreak = 0;

    if (data.userProfile) {
      const startDate = new Date(data.userProfile.journeyStartDate);
      const firstHit = new Date(sortedHits[0].timestamp);
      maxStreak = firstHit.getTime() - startDate.getTime();
    }

    for (let i = 0; i < sortedHits.length - 1; i++) {
      const current = new Date(sortedHits[i].timestamp);
      const next = new Date(sortedHits[i + 1].timestamp);
      const streak = next.getTime() - current.getTime();
      maxStreak = Math.max(maxStreak, streak);
    }

    const lastHit = new Date(sortedHits[sortedHits.length - 1].timestamp);
    const now = new Date();
    const currentStreak = now.getTime() - lastHit.getTime();
    maxStreak = Math.max(maxStreak, currentStreak);

    return maxStreak;
  }, [realHits, data.userProfile]);

  return {
    last7DaysStats,
    todayStats,
    dailyAverage,
    totalHitsTaken,
    totalHitsAvoided,
    longestStreak,
    allDailyStats: getDailyStats,
  };
}
