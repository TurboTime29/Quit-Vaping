import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  useWindowDimensions,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../contexts/AppContext";
import { useAnalytics } from "../hooks/useAnalytics";
import type { DailyStats, HitReason } from "../types/app";

export default function Home() {
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = windowWidth - 48;
  const cardWidth = containerWidth - 20;
  const cardGap = 16;
  const horizontalPadding = (containerWidth - cardWidth) / 2 - cardGap / 2;
  const { data, recordHit } = useApp();
  const { last7DaysStats, todayStats, totalHitsTaken, totalHitsAvoided, longestStreak, allDailyStats } =
    useAnalytics();
  const router = useRouter();

  const [timeSinceLastHit, setTimeSinceLastHit] = useState<string>("0:00:00:00");
  const [currentStreakMs, setCurrentStreakMs] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<DailyStats | null>(null);
  const [showReasonButtons, setShowReasonButtons] = useState<boolean>(false);
  const [reasonTimeframe, setReasonTimeframe] = useState<"All Time" | "Today" | "Yesterday" | "Last 7 Days">("All Time");
  const [minuteTimestamp, setMinuteTimestamp] = useState<number>(() => {
    const now = new Date();
    return now.getTime() - (now.getSeconds() * 1000 + now.getMilliseconds());
  });
  const hourlyScrollRef = useRef<ScrollView>(null);
  
  // 1. INFINITE SCROLL STATE AND LOGIC CONSTANTS
  const DATA_LENGTH = 3; 
  const CENTER_OFFSET = DATA_LENGTH; // 3 (index of the start of the center set of cards)
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState<number>(0); // State for indicator (0, 1, 2)
  const carouselRef = useRef<FlatList>(null);

  const logoHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [yesterdayMode, setYesterdayMode] = useState<"sameTime" | "total" | "hitsAvoidedToday">("sameTime");

  const isDark = data.theme === "dark";
  const bgColor = isDark ? "#000" : "#FFF";
  const textColor = isDark ? "#FFF" : "#000";
  const secondaryTextColor = isDark ? "#999" : "#666";
  const cardBgColor = isDark ? "#1A1A1A" : "#F5F5F5";
  const borderColor = isDark ? "#2A2A2A" : "#E5E5E5";

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();

      // Only update the minute-level timestamp when the minute actually changes,
      // preventing the expensive sameTimeYesterdayHits memo from running every second.
      const rounded = now.getTime() - (now.getSeconds() * 1000 + now.getMilliseconds());
      setMinuteTimestamp(prev => (prev === rounded ? prev : rounded));

      if (data.lastHitTime) {
        const last = new Date(data.lastHitTime);
        const diff = now.getTime() - last.getTime();

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setTimeSinceLastHit(`${String(days).padStart(2, "0")}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
        setCurrentStreakMs(diff);
      } else if (data.userProfile) {
        const start = new Date(data.userProfile.journeyStartDate);
        const diff = now.getTime() - start.getTime();
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setTimeSinceLastHit(`${String(days).padStart(2, "0")}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
        setCurrentStreakMs(diff);
      } else {
        setTimeSinceLastHit("00:00:00:00");
        setCurrentStreakMs(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [data.lastHitTime, data.userProfile]);

  const handleVaped = useCallback(() => {
    setShowReasonButtons(true);
  }, []);

  const handleReasonSelect = useCallback((reason: HitReason) => {
    recordHit(reason);
    setShowReasonButtons(false);
  }, [recordHit]);

  const maxCount = Math.max(...last7DaysStats.map((s) => s.count), 1);

  const formatHour = useCallback((hour: number): string => {
    if (hour === 0) return "12AM";
    if (hour < 12) return `${hour}AM`;
    if (hour === 12) return "12PM";
    return `${hour - 12}PM`;
  }, []);

  useEffect(() => {
    if (selectedDay && hourlyScrollRef.current) {
      const currentHour = new Date().getHours();
      const scrollToX = currentHour * 36;
      setTimeout(() => {
        hourlyScrollRef.current?.scrollTo({ x: scrollToX, animated: true });
      }, 100);
    }
  }, [selectedDay]);

  const renderDayChart = useCallback(() => {
    if (selectedDay) {
      const maxHourlyCount = Math.max(...selectedDay.hourlyBreakdown.map((h) => h.count), 1);
      
      return (
        <View>
          <View style={styles.chartHeader}>
            <TouchableOpacity
              onPress={() => setSelectedDay(null)}
              style={styles.backButton}
            >
              <Text style={[styles.backButtonText, { color: textColor }]}>← Back</Text>
            </TouchableOpacity>
            <Text style={[styles.chartTitle, { color: textColor }]}>
              {new Date(selectedDay.date).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.hourlyChart}>
            <ScrollView ref={hourlyScrollRef} horizontal showsHorizontalScrollIndicator={false}>
              {selectedDay.hourlyBreakdown.map((hour) => {
                const currentHour = new Date().getHours();
                const isCurrentHour = hour.hour === currentHour && selectedDay.date === new Date().toISOString().split("T")[0];
                
                return (
                  <View key={hour.hour} style={styles.hourlyBar}>
                    <View style={styles.hourlyBarContainer}>
                      <View
                        style={[
                          styles.hourlyBarFill,
                          {
                            height: `${(hour.count / maxHourlyCount) * 100}%`,
                            backgroundColor: isCurrentHour ? "#FF6B6B" : secondaryTextColor,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.hourlyLabel, { color: textColor, fontWeight: isCurrentHour ? ("700" as const) : ("400" as const) }]}>
                      {hour.count}
                    </Text>
                    <Text style={[styles.hourlyLabel, { color: isCurrentHour ? textColor : secondaryTextColor, fontWeight: isCurrentHour ? ("700" as const) : ("400" as const) }]}>
                      {formatHour(hour.hour)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.weekChart}>
        {last7DaysStats.map((day) => {
          const [year, month, dayOfMonth] = day.date.split('-').map(Number);
          const date = new Date(year, month - 1, dayOfMonth);
          const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
          const now = new Date();
          const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const isToday = day.date === todayKey;

          return (
            <TouchableOpacity
              key={day.date}
              style={styles.dayBar}
              onPress={() => setSelectedDay(day)}
              activeOpacity={0.7}
            >
              <View style={styles.dayBarContainer}>
                <View
                  style={[
                    styles.dayBarFill,
                    {
                      height: `${(day.count / maxCount) * 100}%`,
                      backgroundColor: isToday ? "#FF6B6B" : secondaryTextColor,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.dayCount, { color: textColor }]}>{day.count}</Text>
              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: isToday ? textColor : secondaryTextColor,
                    fontWeight: isToday ? ("700" as const) : ("400" as const),
                  },
                ]}
              >
                {isToday ? "Today" : dayName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, [last7DaysStats, maxCount, selectedDay, textColor, secondaryTextColor, formatHour, hourlyScrollRef]);

  const timeParts = timeSinceLastHit.split(":");

  const reasonStats = useMemo(() => {
    const reasons: HitReason[] = ["Stress", "Habit", "Focus", "Bored", "Other"];
    
    let filteredHits = data.hits;
    const now = new Date();
    
    if (reasonTimeframe === "Today") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filteredHits = data.hits.filter(hit => new Date(hit.timestamp) >= todayStart);
    } else if (reasonTimeframe === "Yesterday") {
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filteredHits = data.hits.filter(hit => {
        const hitDate = new Date(hit.timestamp);
        return hitDate >= yesterdayStart && hitDate < todayStart;
      });
    } else if (reasonTimeframe === "Last 7 Days") {
      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      filteredHits = data.hits.filter(hit => new Date(hit.timestamp) >= sevenDaysAgo);
    }
    
    const totalWithReasons = filteredHits.filter(hit => hit.reason).length;
    
    if (totalWithReasons === 0) {
      return reasons.map(reason => ({ reason, percentage: 0, count: 0 }));
    }

    return reasons.map(reason => {
      const count = filteredHits.filter(hit => hit.reason === reason).length;
      const percentage = (count / totalWithReasons) * 100;
      return { reason, percentage, count };
    });
  }, [data.hits, reasonTimeframe]);

  const formatStreak = useCallback((milliseconds: number): string => {
    const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
    const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }, []);

  const { sameTimeYesterdayHits, totalYesterdayHits, hitsAvoidedToday } = useMemo(() => {
    const now = new Date(minuteTimestamp);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayDateKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    const yesterdayStats = allDailyStats.find(stat => stat.date === yesterdayDateKey);
    
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    let sameTimeCount = 0;
    let totalCount = 0;
    
    if (yesterdayStats) {
      for (let hour = 0; hour < 24; hour++) {
        if (hour < currentHour) {
          sameTimeCount += yesterdayStats.hourlyBreakdown[hour].count;
        } else if (hour === currentHour) {
          const hitsInThisHour = data.hits.filter(hit => {
            const hitDate = new Date(hit.timestamp);
            const hitDateKey = `${hitDate.getFullYear()}-${String(hitDate.getMonth() + 1).padStart(2, '0')}-${String(hitDate.getDate()).padStart(2, '0')}`;
            return hitDateKey === yesterdayDateKey && 
                   hitDate.getHours() === hour && 
                   hitDate.getMinutes() <= currentMinute;
          });
          sameTimeCount += hitsInThisHour.length;
          break;
        }
      }
      
      totalCount = yesterdayStats.hourlyBreakdown.reduce((sum, hour) => sum + hour.count, 0);
    }
    
    const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const journeyStartDate = data.userProfile?.journeyStartDate;
    let startTime: Date;
    
    if (journeyStartDate) {
      const journeyStart = new Date(journeyStartDate);
      const journeyDateKey = `${journeyStart.getFullYear()}-${String(journeyStart.getMonth() + 1).padStart(2, '0')}-${String(journeyStart.getDate()).padStart(2, '0')}`;
      
      if (todayDateKey === journeyDateKey) {
        startTime = journeyStart;
      } else {
        startTime = new Date(now);
        startTime.setHours(0, 0, 0, 0);
      }
    } else {
      startTime = new Date(now);
      startTime.setHours(0, 0, 0, 0);
    }
    
    const elapsedMs = now.getTime() - startTime.getTime();
    const dayProgressFraction = elapsedMs / (24 * 60 * 60 * 1000);
    
    const preJourneyAverage = data.userProfile?.averagePuffsPerDay || 0;
    const expectedHitsSoFar = preJourneyAverage * dayProgressFraction;
    const actualHitsToday = todayStats.count;
    const avoidedToday = Math.max(0, Math.floor(expectedHitsSoFar - actualHitsToday));
    
    return { sameTimeYesterdayHits: sameTimeCount, totalYesterdayHits: totalCount, hitsAvoidedToday: avoidedToday };
  }, [data.hits, allDailyStats, minuteTimestamp, todayStats.count, data.userProfile?.journeyStartDate, data.userProfile?.averagePuffsPerDay]);

  // 2. SCROLL TO THE CENTER INDEX ON MOUNT
  useEffect(() => {
    if (carouselRef.current) {
        carouselRef.current.scrollToIndex({
            index: CENTER_OFFSET,
            animated: false,
        });
        setCurrentCarouselIndex(0);
    }
  }, [CENTER_OFFSET]);

  // 3. DEFINE THE 3 CARDS AND DUPLICATE THEM FOR INFINITE SCROLL
  const CAROUSEL_ITEMS = useMemo(() => [
    {
      id: 'reasons',
      render: () => (
        <View style={styles.carouselCardContent}>
          <View style={styles.reasonStatsHeader}>
            <Text style={[styles.reasonStatsTitle, { color: secondaryTextColor }]}>
              REASONS
            </Text>
            <TouchableOpacity
              onPress={() => {
                const timeframes: ("All Time" | "Today" | "Yesterday" | "Last 7 Days")[] = ["All Time", "Last 7 Days", "Yesterday", "Today"];
                const currentIndex = timeframes.indexOf(reasonTimeframe);
                const nextIndex = (currentIndex + 1) % timeframes.length;
                setReasonTimeframe(timeframes[nextIndex]);
              }}
              style={styles.timeframeButton}
              activeOpacity={0.7}
            >
              <Text style={[styles.timeframeButtonText, { color: textColor }]}>
                {reasonTimeframe}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.reasonStatsList}>
            {reasonStats.filter(stat => stat.count > 0).map((stat, index) => {
              const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#9B59B6'];
              const barColor = colors[index % colors.length];
              
              return (
                <View key={stat.reason} style={styles.reasonStatRow}>
                  <View style={styles.reasonStatHeader}>
                    <Text style={[styles.reasonStatLabel, { color: textColor }]}>
                      {stat.reason}
                    </Text>
                    <View style={styles.reasonStatValues}>
                      <Text style={[styles.reasonStatPercentage, { color: textColor }]}>
                        {stat.percentage.toFixed(0)}%
                      </Text>
                      <Text style={[styles.reasonStatCount, { color: secondaryTextColor }]}>
                        ({stat.count})
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.reasonProgressBar, { backgroundColor: borderColor }]}>
                    <View 
                      style={[
                        styles.reasonProgressFill,
                        { 
                          width: `${stat.percentage}%`,
                          backgroundColor: barColor
                        }
                      ]} 
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )
    },
    {
      id: 'last7days',
      render: () => (
        <View style={styles.carouselCardContent}>
          <Text style={[styles.chartCardTitle, { color: secondaryTextColor }]}>
            {selectedDay ? "HOURLY BREAKDOWN" : "LAST 7 DAYS"}
          </Text>
          {renderDayChart()}
        </View>
      )
    },
    {
      id: 'combined',
      render: () => (
        <View style={styles.carouselCardContent}>
          <View style={styles.combinedStatRow}>
            <TouchableOpacity 
              style={styles.combinedStatItem}
              onPress={() => router.push("/history")}
              activeOpacity={0.7}
            >
              <Text style={[styles.statLabel, { color: secondaryTextColor }]}>
                TOTAL HITS TAKEN
              </Text>
              <Text style={[styles.statValue, { color: textColor }]}>
                {totalHitsTaken}
              </Text>
            </TouchableOpacity>
            <View style={styles.combinedStatItem}>
              <Text style={[styles.statLabel, { color: secondaryTextColor }]}>
                TOTAL HITS AVOIDED
              </Text>
              <Text style={[styles.statValue, { color: totalHitsAvoided < totalHitsTaken ? "#FF6B6B" : totalHitsAvoided === totalHitsTaken ? textColor : "#4CAF50" }]}>
                {totalHitsAvoided}
              </Text>
            </View>
          </View>
          <View style={styles.combinedStreakSection}>
            <Text style={[styles.statLabel, { color: secondaryTextColor }]}>
              LONGEST STREAK
            </Text>
            <Text style={[styles.streakValue, { color: textColor }]}>
              {formatStreak(currentStreakMs >= longestStreak ? currentStreakMs : longestStreak)}
            </Text>
          </View>
        </View>
      )
    }
  ], [
    reasonStats,
    renderDayChart,
    reasonTimeframe,
    textColor,
    secondaryTextColor,
    borderColor,
    router,
    currentStreakMs,
    longestStreak,
    totalHitsTaken,
    totalHitsAvoided,
    formatStreak,
    selectedDay,
  ]);

  const infiniteData = useMemo(() => {
    // We create three copies of the original data with unique keys.
    const firstCopy = CAROUSEL_ITEMS.map((item, index) => ({ ...item, id: `${item.id}-${index + 1}-1` }));
    const centerCopy = CAROUSEL_ITEMS.map((item, index) => ({ ...item, id: `${item.id}-${index + 1}-2` }));
    const lastCopy = CAROUSEL_ITEMS.map((item, index) => ({ ...item, id: `${item.id}-${index + 1}-3` }));
    return [...firstCopy, ...centerCopy, ...lastCopy];
  }, [CAROUSEL_ITEMS]);


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={["top"]}>
      <View>
        <View style={styles.header}>
          <Pressable 
            onPressIn={() => {
              logoHoldTimerRef.current = setTimeout(() => {
                router.push("/settings");
              }, 3000);
            }}
            onPressOut={() => {
              if (logoHoldTimerRef.current) {
                clearTimeout(logoHoldTimerRef.current);
                logoHoldTimerRef.current = null;
              }
            }}
          >
            <Text style={[styles.logo, { color: textColor }]}>Quit.</Text>
            <Text style={[styles.tagline, { color: secondaryTextColor }]}>
              Do The Thing
            </Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <Text style={[styles.timerLabel, { color: secondaryTextColor }]}>
            TIME SINCE LAST HIT
          </Text>

          <View style={styles.timerContainer}>
            <View style={styles.timerSegment}>
              <Text style={[styles.timerValue, { color: textColor }]}>
                {timeParts[0]}
              </Text>
              <Text style={[styles.timerUnit, { color: secondaryTextColor }]}>DD</Text>
            </View>
            <Text style={[styles.timerSeparator, { color: textColor }]}>:</Text>
            <View style={styles.timerSegment}>
              <Text style={[styles.timerValue, { color: textColor }]}>
                {timeParts[1]}
              </Text>
              <Text style={[styles.timerUnit, { color: secondaryTextColor }]}>HH</Text>
            </View>
            <Text style={[styles.timerSeparator, { color: textColor }]}>:</Text>
            <View style={styles.timerSegment}>
              <Text style={[styles.timerValue, { color: textColor }]}>
                {timeParts[2]}
              </Text>
              <Text style={[styles.timerUnit, { color: secondaryTextColor }]}>MM</Text>
            </View>
            <Text style={[styles.timerSeparator, { color: textColor }]}>:</Text>
            <View style={styles.timerSegment}>
              <Text style={[styles.timerValue, { color: textColor }]}>
                {timeParts[3]}
              </Text>
              <Text style={[styles.timerUnit, { color: secondaryTextColor }]}>SS</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.vapedButton}
            onPress={handleVaped}
            activeOpacity={0.8}
          >
            <Text style={styles.vapedButtonText}>I Vaped</Text>
          </TouchableOpacity>

          {showReasonButtons && (
            <View style={styles.reasonContainer}>
              <Text style={[styles.reasonTitle, { color: secondaryTextColor }]}>
                Why did you vape?
              </Text>
              <View style={styles.reasonButtons}>
                {(["Stress", "Habit", "Focus", "Bored", "Other"] as HitReason[]).map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonButton, { backgroundColor: cardBgColor, borderColor }]}
                    onPress={() => handleReasonSelect(reason)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reasonButtonText, { color: textColor }]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: cardBgColor }]}>
              <TouchableOpacity
                onPress={() => {
                  setYesterdayMode(current => {
                    if (current === "sameTime") return "total";
                    if (current === "total") return "hitsAvoidedToday";
                    return "sameTime";
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statLabel, { color: secondaryTextColor }]}>
                  {yesterdayMode === "sameTime" ? "SAME TIME YESTERDAY" : 
                   yesterdayMode === "total" ? "TOTAL HITS YESTERDAY" : 
                   "HITS AVOIDED TODAY"}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.statValue, { color: yesterdayMode === "hitsAvoidedToday" 
                ? (hitsAvoidedToday < todayStats.count ? "#FF6B6B" : hitsAvoidedToday === todayStats.count ? textColor : "#4CAF50")
                : textColor }]}>
                {yesterdayMode === "sameTime" ? sameTimeYesterdayHits : 
                 yesterdayMode === "total" ? totalYesterdayHits : 
                 hitsAvoidedToday}
              </Text>
              <Text style={[styles.statUnit, { color: secondaryTextColor }]}>HITS</Text>
            </View>
            <TouchableOpacity 
              style={[styles.statCard, { backgroundColor: cardBgColor }]}
              onPress={() => router.push("/history")}
              activeOpacity={0.7}
            >
              <Text style={[styles.statLabel, { color: secondaryTextColor }]}>TODAY</Text>
              <Text style={[styles.statValue, { color: textColor }]}>
                {todayStats.count}
              </Text>
              <Text style={[styles.statUnit, { color: secondaryTextColor }]}>HITS</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.carouselCardContainer, { backgroundColor: cardBgColor }]}>
            <FlatList
              ref={carouselRef}
              data={infiniteData} // 1. Use the new 9-item array
              renderItem={({ item }) => (
                <View style={[styles.carouselItem, { width: cardWidth, marginHorizontal: cardGap / 2 }]}>
                  {item.render()}
                </View>
              )}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}

              // Allows scrollToIndex to work efficiently
              getItemLayout={(_, index) => ({
                length: cardWidth + cardGap,
                offset: (cardWidth + cardGap) * index,
                index,
              })}

              snapToInterval={cardWidth + cardGap}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: horizontalPadding }}
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              windowSize={5}
              removeClippedSubviews={true}
              
              // 3. LOGIC TO LOOP SCROLL
              onMomentumScrollEnd={(event) => {
                const contentOffset = event.nativeEvent.contentOffset.x;
                let newIndex = Math.round(contentOffset / (cardWidth + cardGap));
                let nextIndex = newIndex;

                if (newIndex < CENTER_OFFSET) {
                  // Scrolled to the first block (indices 0, 1, 2) -> jump to center block (3, 4, 5)
                  nextIndex = newIndex + DATA_LENGTH; 
                  carouselRef.current?.scrollToIndex({
                    index: nextIndex,
                    animated: false, // Must be false for seamless jump
                  });
                }
                else if (newIndex >= CENTER_OFFSET + DATA_LENGTH) {
                  // Scrolled to the last block (indices 6, 7, 8) -> jump to center block (3, 4, 5)
                  nextIndex = newIndex - DATA_LENGTH; 
                  carouselRef.current?.scrollToIndex({
                    index: nextIndex,
                    animated: false, // Must be false for seamless jump
                  });
                }
                
                // Update the state for the indicators (always 0, 1, or 2)
                const indicatorIndex = nextIndex % DATA_LENGTH;
                setCurrentCarouselIndex(indicatorIndex);
              }}
            />
          </View>

          <View style={styles.carouselIndicators}>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  {
                    backgroundColor: currentCarouselIndex === index ? textColor : secondaryTextColor,
                    opacity: currentCarouselIndex === index ? 1 : 0.3,
                  }
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  logo: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  tagline: {
    fontSize: 13,
    marginTop: 2,
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  timerLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 24,
  },
  timerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },
  timerSegment: {
    alignItems: "center",
    width: 70,
  },
  timerValue: {
    fontSize: 48,
    fontWeight: "700" as const,
    lineHeight: 56,
    fontVariant: ["tabular-nums"] as const,
    textAlign: "center" as const,
  },
  timerUnit: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ["tabular-nums"] as const,
  },
  timerSeparator: {
    fontSize: 48,
    fontWeight: "700" as const,
    marginHorizontal: 0,
    lineHeight: 56,
    fontVariant: ["tabular-nums"] as const,
    paddingBottom: 12,
  },
  vapedButton: {
    backgroundColor: "#FF6B6B",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    marginBottom: 32,
  },
  vapedButtonText: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFF",
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statValue: {
    fontSize: 42,
    fontWeight: "700" as const,
    marginBottom: 4,
  },
  statUnit: {
    fontSize: 14,
  },
  chartCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  chartCardTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 1,
    marginBottom: 20,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  weekChart: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  dayBar: {
    flex: 1,
    alignItems: "center",
  },
  dayBarContainer: {
    width: "100%",
    height: 120,
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  dayBarFill: {
    width: "100%",
    borderRadius: 8,
    minHeight: 4,
  },
  dayCount: {
    fontSize: 14,
    fontWeight: "600" as const,
    marginBottom: 4,
  },
  dayLabel: {
    fontSize: 12,
  },
  hourlyChart: {
    height: 180,
  },
  hourlyBar: {
    width: 28,
    marginRight: 8,
    alignItems: "center",
  },
  hourlyBarContainer: {
    width: "100%",
    height: 100,
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  hourlyBarFill: {
    width: "100%",
    borderRadius: 4,
    minHeight: 2,
  },
  hourlyLabel: {
    fontSize: 8,
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
  },
  bottomButton: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 2,
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  fullWidthCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    alignItems: "center",
  },
  streakValue: {
    fontSize: 48,
    fontWeight: "700" as const,
    marginTop: 8,
  },
  combinedStatsCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  combinedStatRow: {
    flexDirection: "row" as const,
    gap: 16,
    marginBottom: 20,
  },
  combinedStatItem: {
    flex: 1,
    alignItems: "center" as const,
  },
  combinedStreakSection: {
    alignItems: "center" as const,
  },
  reasonContainer: {
    marginBottom: 32,
  },
  reasonTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
    marginBottom: 16,
    textAlign: "center" as const,
  },
  reasonButtons: {
    gap: 12,
  },
  reasonButton: {
    borderRadius: 16,
    padding: 16,
    alignItems: "center" as const,
    borderWidth: 2,
  },
  reasonButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  carouselItem: {
    paddingHorizontal: 0,
  },
  carouselCardContainer: {
    borderRadius: 20,
    height: 265,
    marginBottom: 16,
  },
  carouselCardContent: {
    flex: 1,
    padding: 20,
  },
  carouselIndicators: {
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 16,
    marginBottom: 24,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reasonStatsHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 20,
  },
  reasonStatsTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 1,
  },
  timeframeButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  timeframeButtonText: {
    fontSize: 12,
    fontWeight: "400" as const,
  },
  reasonStatsList: {
    gap: 12,
  },
  reasonStatRow: {
    gap: 6,
  },
  reasonStatHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  reasonStatLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  reasonStatValues: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    gap: 4,
  },
  reasonStatPercentage: {
    fontSize: 15,
    fontWeight: "700" as const,
  },
  reasonStatCount: {
    fontSize: 11,
  },
  reasonProgressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  reasonProgressFill: {
    height: "100%" as const,
    borderRadius: 4,
  },

});
