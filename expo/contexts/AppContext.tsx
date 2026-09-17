import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppData, Hit, HitReason, ThemeMode, UserProfile } from "../types/app";

const STORAGE_KEY = "quit_app_data";

function getInitialData(): AppData {
  return {
    userProfile: null,
    hits: [],
    theme: "dark",
    lastHitTime: null,
    hasBackfilled: false,
  };
}

function generateBackfillHits(quitDate: Date, averagePuffsPerDay: number): import("../types/app").Hit[] {
  const hits: import("../types/app").Hit[] = [];
  const DAYS = 30;

  for (let d = DAYS; d >= 1; d--) {
    const dayStart = new Date(quitDate);
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);

    // ~10% of hits in sleep window (12am–8am), rest in waking hours (8am–midnight)
    const sleepHits = Math.max(1, Math.round(averagePuffsPerDay * 0.1));
    const wakeHits = Math.max(0, averagePuffsPerDay - sleepHits);

    // Sleep window hits — weighted heavily towards 6–8am (waking up)
    for (let i = 0; i < sleepHits; i++) {
      const isWakeUp = Math.random() < 0.7;
      const hour = isWakeUp ? 6 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3);
      const ts = new Date(dayStart);
      ts.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
      hits.push({ id: `backfill-${ts.getTime()}-${Math.random()}`, timestamp: ts.toISOString(), isBackfill: true });
    }

    // Waking hours hits — spread across 8am–midnight
    for (let i = 0; i < wakeHits; i++) {
      const hour = 8 + Math.floor(Math.random() * 16); // 8am–11pm
      const ts = new Date(dayStart);
      ts.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
      hits.push({ id: `backfill-${ts.getTime()}-${Math.random()}`, timestamp: ts.toISOString(), isBackfill: true });
    }
  }

  return hits;
}

export const [AppProvider, useApp] = createContextHook(() => {
  const [data, setData] = useState<AppData>(getInitialData());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (!stored || typeof stored !== 'string') {
        setData(getInitialData());
        setIsLoading(false);
        return;
      }

      const trimmedData = stored.trim();

      if (!trimmedData || trimmedData.length === 0) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setData(getInitialData());
        setIsLoading(false);
        return;
      }
      
      if (trimmedData[0] !== '{' && trimmedData[0] !== '[') {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setData(getInitialData());
        setIsLoading(false);
        return;
      }
      
      try {
        const parsed = JSON.parse(trimmedData) as AppData;

        if (parsed && typeof parsed === 'object') {
          let hits = Array.isArray(parsed.hits) ? parsed.hits : [];

          if (parsed.userProfile?.journeyStartDate) {
            const journeyStartTime = new Date(parsed.userProfile.journeyStartDate).getTime();
            // Keep backfill hits regardless of date; only drop non-backfill pre-journey hits
            hits = hits.filter(hit => hit.isBackfill || new Date(hit.timestamp).getTime() >= journeyStartTime);
          }

          const validatedData: AppData = {
            userProfile: parsed.userProfile || null,
            hits,
            theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'dark',
            lastHitTime: parsed.lastHitTime || null,
            hasBackfilled: parsed.hasBackfilled || false,
          };
          
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validatedData));
          setData(validatedData);
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
          setData(getInitialData());
        }
      } catch {
        try {
          await AsyncStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore removal error
        }
        setData(getInitialData());
      }
    } catch {
      // ignore load error, fall through to finally
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveData = useCallback(async (newData: AppData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      setData(newData);
    } catch (error) {
      console.error("Error saving data:", error);
    }
  }, []);

  const setUserProfile = useCallback(
    (profile: UserProfile) => {
      const newData = { ...data, userProfile: profile };
      saveData(newData);
    },
    [data, saveData]
  );

  const updateUserProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      if (!data.userProfile) return;
      
      let newData = {
        ...data,
        userProfile: { ...data.userProfile, ...updates },
      };
      
      if (updates.journeyStartDate) {
        const journeyStartTime = new Date(updates.journeyStartDate).getTime();
        const filteredHits = data.hits.filter(hit => hit.isBackfill || new Date(hit.timestamp).getTime() >= journeyStartTime);
        
        newData = {
          ...newData,
          hits: filteredHits,
          lastHitTime: filteredHits.length > 0 
            ? filteredHits.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp
            : null,
        };
      }
      
      saveData(newData);
    },
    [data, saveData]
  );

  const recordHit = useCallback((reason?: HitReason) => {
    const now = new Date().toISOString();
    const newHit: Hit = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: now,
      reason,
    };
    const newData = {
      ...data,
      hits: [...data.hits, newHit],
      lastHitTime: now,
    };
    saveData(newData);
  }, [data, saveData]);

  const deleteHit = useCallback((hitId: string) => {
    const newData = {
      ...data,
      hits: data.hits.filter(hit => hit.id !== hitId),
    };
    saveData(newData);
  }, [data, saveData]);

  const updateHit = useCallback((hitId: string, updates: { timestamp?: string; reason?: HitReason }) => {
    const newData = {
      ...data,
      hits: data.hits.map(hit => 
        hit.id === hitId ? { ...hit, ...updates } : hit
      ),
    };
    saveData(newData);
  }, [data, saveData]);

  const toggleTheme = useCallback(() => {
    const newTheme: ThemeMode = data.theme === "light" ? "dark" : "light";
    const newData = { ...data, theme: newTheme };
    saveData(newData);
  }, [data, saveData]);

  const backfillHistory = useCallback(() => {
    if (!data.userProfile) return;
    const quitDate = new Date(data.userProfile.journeyStartDate);
    const backfillHits = generateBackfillHits(quitDate, data.userProfile.averagePuffsPerDay);
    // Remove any existing backfill hits before adding new ones
    const nonBackfillHits = data.hits.filter(h => !h.isBackfill);
    const newData = { ...data, hits: [...backfillHits, ...nonBackfillHits], hasBackfilled: true };
    saveData(newData);
  }, [data, saveData]);

  return useMemo(
    () => ({
      data,
      isLoading,
      setUserProfile,
      updateUserProfile,
      recordHit,
      deleteHit,
      updateHit,
      toggleTheme,
      backfillHistory,
    }),
    [data, isLoading, setUserProfile, updateUserProfile, recordHit, deleteHit, updateHit, toggleTheme, backfillHistory]
  );
});
