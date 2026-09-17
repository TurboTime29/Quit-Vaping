import { useRouter } from "expo-router";
import { ArrowLeft, Trash2, Edit2, X, Check } from "lucide-react-native";
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../contexts/AppContext";
import type { HitReason } from "../types/app";

export default function History() {
  const { data, deleteHit, updateHit } = useApp();
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState<string>("");
  const [editReason, setEditReason] = useState<HitReason | undefined>(undefined);

  const isDark = data.theme === "dark";
  const bgColor = isDark ? "#000" : "#FFF";
  const textColor = isDark ? "#FFF" : "#000";
  const secondaryTextColor = isDark ? "#999" : "#666";
  const cardBgColor = isDark ? "#1A1A1A" : "#F5F5F5";

  const sortedHits = [...data.hits].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const groupedByDate = sortedHits.reduce((acc, hit) => {
    const hitDate = new Date(hit.timestamp);
    const year = hitDate.getFullYear();
    const month = String(hitDate.getMonth() + 1).padStart(2, '0');
    const day = String(hitDate.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(hit);
    return acc;
  }, {} as Record<string, typeof sortedHits>);

  const dates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: bgColor }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>History</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {dates.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: secondaryTextColor }]}>
              No history yet. Start tracking your journey!
            </Text>
          </View>
        ) : (
          dates.map((date) => {
            const hits = groupedByDate[date];
            const dateObj = new Date(date + 'T00:00:00');
            
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const isToday = date === todayStr;
            
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
            const isYesterday = date === yesterdayStr;

            let dateLabel = "";
            if (isToday) {
              dateLabel = "Today";
            } else if (isYesterday) {
              dateLabel = "Yesterday";
            } else {
              dateLabel = dateObj.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              });
            }

            return (
              <View key={date} style={styles.dateGroup}>
                <View style={styles.dateHeader}>
                  <Text style={[styles.dateLabel, { color: textColor }]}>
                    {dateLabel}
                  </Text>
                  <Text style={[styles.dateCount, { color: secondaryTextColor }]}>
                    {hits.length} {hits.length === 1 ? "hit" : "hits"}
                  </Text>
                </View>

                {hits.map((hit) => {
                  const hitDate = new Date(hit.timestamp);
                  const time = hitDate.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  const isEditing = editingId === hit.id;

                  const handleEdit = () => {
                    setEditingId(hit.id);
                    const hours = hitDate.getHours().toString().padStart(2, '0');
                    const minutes = hitDate.getMinutes().toString().padStart(2, '0');
                    setEditTime(`${hours}:${minutes}`);
                    setEditReason(hit.reason);
                  };

                  const handleSave = () => {
                    if (editTime) {
                      const [hours, minutes] = editTime.split(':');
                      const newDate = new Date(hit.timestamp);
                      newDate.setHours(parseInt(hours), parseInt(minutes));
                      updateHit(hit.id, { timestamp: newDate.toISOString(), reason: editReason });
                    }
                    setEditingId(null);
                  };

                  const handleDelete = () => {
                    Alert.alert(
                      "Delete Record",
                      "Are you sure you want to delete this record?",
                      [
                        { text: "Cancel", style: "cancel" },
                        { 
                          text: "Delete", 
                          style: "destructive",
                          onPress: () => deleteHit(hit.id)
                        },
                      ]
                    );
                  };

                  const handleCancel = () => {
                    setEditingId(null);
                  };

                  const reasons: HitReason[] = ["Stress", "Habit", "Focus", "Bored", "Other"];

                  return (
                    <View
                      key={hit.id}
                      style={[styles.hitCard, { backgroundColor: cardBgColor }]}
                    >
                      <View style={styles.hitDot} />
                      
                      <View style={styles.hitContent}>
                        {isEditing ? (
                          <View style={styles.editContainer}>
                            <TextInput
                              style={[styles.timeInput, { 
                                color: textColor,
                                backgroundColor: isDark ? "#000" : "#FFF",
                                borderColor: isDark ? "#333" : "#DDD",
                              }]}
                              value={editTime}
                              onChangeText={setEditTime}
                              placeholder="HH:MM"
                              placeholderTextColor={secondaryTextColor}
                              keyboardType="numbers-and-punctuation"
                            />
                            
                            <View style={styles.reasonPicker}>
                              {reasons.map((reason) => (
                                <TouchableOpacity
                                  key={reason}
                                  onPress={() => setEditReason(reason)}
                                  style={[styles.reasonChip, {
                                    backgroundColor: editReason === reason 
                                      ? (isDark ? "#333" : "#E0E0E0")
                                      : "transparent",
                                    borderColor: isDark ? "#333" : "#DDD",
                                  }]}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.reasonChipText, { 
                                    color: editReason === reason ? textColor : secondaryTextColor 
                                  }]}>
                                    {reason}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        ) : (
                          <View>
                            <Text style={[styles.hitTime, { color: textColor }]}>{time}</Text>
                            {hit.reason && (
                              <Text style={[styles.hitReason, { color: secondaryTextColor }]}>
                                {hit.reason}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>

                      <View style={styles.actions}>
                        {isEditing ? (
                          <>
                            <TouchableOpacity
                              onPress={handleSave}
                              style={styles.actionButton}
                              activeOpacity={0.7}
                            >
                              <Check size={20} color="#4CAF50" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleCancel}
                              style={styles.actionButton}
                              activeOpacity={0.7}
                            >
                              <X size={20} color={secondaryTextColor} />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity
                              onPress={handleEdit}
                              style={styles.actionButton}
                              activeOpacity={0.7}
                            >
                              <Edit2 size={18} color={secondaryTextColor} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleDelete}
                              style={styles.actionButton}
                              activeOpacity={0.7}
                            >
                              <Trash2 size={18} color="#FF6B6B" />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700" as const,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  dateGroup: {
    marginBottom: 32,
  },
  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 18,
    fontWeight: "700" as const,
  },
  dateCount: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  hitCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  hitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B6B",
    marginRight: 12,
    flexShrink: 0,
  },
  hitContent: {
    flex: 1,
  },
  hitTime: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  hitReason: {
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 12,
  },
  actionButton: {
    padding: 8,
  },
  editContainer: {
    gap: 8,
  },
  timeInput: {
    fontSize: 16,
    fontWeight: "600" as const,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasonPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  reasonChipText: {
    fontSize: 12,
    fontWeight: "500" as const,
  },
});
