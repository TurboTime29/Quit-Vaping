import { useRouter } from "expo-router";
import { ArrowLeft, Sun, Moon } from "lucide-react-native";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../contexts/AppContext";

export default function Settings() {
  const { data, updateUserProfile, toggleTheme, backfillHistory } = useApp();
  const router = useRouter();

  const handleBackfill = () => {
    if (data.hasBackfilled) {
      Alert.alert(
        "Already Backfilled",
        "You've already backfilled your history. Would you like to redo it? This will replace the existing backfill data.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Redo", style: "destructive", onPress: () => { backfillHistory(); Alert.alert("Done", "History backfilled successfully."); } },
        ]
      );
      return;
    }
    Alert.alert(
      "Backfill History",
      `This will generate 30 days of vaping history before your quit date based on your average of ${data.userProfile?.averagePuffsPerDay} hits/day. This won't affect your streak or stats.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Backfill", onPress: () => { backfillHistory(); Alert.alert("Done", "History backfilled successfully."); } },
      ]
    );
  };

  const [averagePuffs, setAveragePuffs] = useState<string>(
    data.userProfile?.averagePuffsPerDay.toString() || ""
  );
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isEditingDate, setIsEditingDate] = useState<boolean>(false);
  const [journeyDate, setJourneyDate] = useState<string>(
    data.userProfile?.journeyStartDate
      ? new Date(data.userProfile.journeyStartDate).toISOString().split("T")[0]
      : ""
  );
  const [journeyTime, setJourneyTime] = useState<string>(
    data.userProfile?.journeyStartDate
      ? new Date(data.userProfile.journeyStartDate).toTimeString().substring(0, 5)
      : ""
  );

  const isDark = data.theme === "dark";
  const bgColor = isDark ? "#000" : "#FFF";
  const textColor = isDark ? "#FFF" : "#000";
  const secondaryTextColor = isDark ? "#999" : "#666";
  const cardBgColor = isDark ? "#1A1A1A" : "#F5F5F5";
  const borderColor = isDark ? "#2A2A2A" : "#E5E5E5";

  const handleSave = () => {
    const puffs = parseInt(averagePuffs, 10);

    if (!averagePuffs || isNaN(puffs) || puffs <= 0) {
      Alert.alert("Error", "Please enter a valid number of puffs");
      return;
    }

    console.log('[Settings] Saving averagePuffsPerDay:', puffs);
    updateUserProfile({ averagePuffsPerDay: puffs });
    setIsEditing(false);
    Alert.alert("Success", "Settings updated successfully");
  };

  const handleCancel = () => {
    setAveragePuffs(data.userProfile?.averagePuffsPerDay.toString() || "");
    setIsEditing(false);
  };

  const handleSaveDate = () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const timePattern = /^\d{2}:\d{2}$/;

    if (!journeyDate || !datePattern.test(journeyDate)) {
      Alert.alert("Error", "Please enter a valid date in YYYY-MM-DD format");
      return;
    }

    if (!journeyTime || !timePattern.test(journeyTime)) {
      Alert.alert("Error", "Please enter a valid time in HH:MM format (24-hour)");
      return;
    }

    const dateTimeString = `${journeyDate}T${journeyTime}:00`;
    const newDate = new Date(dateTimeString);

    if (isNaN(newDate.getTime())) {
      Alert.alert("Error", "Invalid date or time");
      return;
    }

    if (newDate > new Date()) {
      Alert.alert("Error", "Journey start date cannot be in the future");
      return;
    }

    updateUserProfile({ journeyStartDate: newDate.toISOString() });
    setIsEditingDate(false);
    Alert.alert("Success", "Journey start date updated successfully");
  };

  const handleCancelDate = () => {
    setJourneyDate(
      data.userProfile?.journeyStartDate
        ? new Date(data.userProfile.journeyStartDate).toISOString().split("T")[0]
        : ""
    );
    setJourneyTime(
      data.userProfile?.journeyStartDate
        ? new Date(data.userProfile.journeyStartDate).toTimeString().substring(0, 5)
        : ""
    );
    setIsEditingDate(false);
  };

  const journeyStartDate = data.userProfile?.journeyStartDate
    ? new Date(data.userProfile.journeyStartDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "N/A";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: bgColor }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: textColor }]}>Settings</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: textColor }]}>
                Theme
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.themeToggleButton, { backgroundColor: bgColor, borderColor }]}
              onPress={toggleTheme}
              activeOpacity={0.7}
            >
              <View style={styles.themeToggleContent}>
                {isDark ? (
                  <Sun size={20} color={textColor} />
                ) : (
                  <Moon size={20} color={textColor} />
                )}
                <Text style={[styles.themeToggleText, { color: textColor }]}>
                  {isDark ? "Light Mode" : "Dark Mode"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: textColor }]}>
                Journey Start
              </Text>
              {!isEditingDate && (
                <TouchableOpacity
                  onPress={() => setIsEditingDate(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editButton}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {isEditingDate ? (
              <View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: secondaryTextColor }]}>
                    Date (YYYY-MM-DD)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: bgColor,
                        color: textColor,
                        borderColor: borderColor,
                      },
                    ]}
                    value={journeyDate}
                    onChangeText={setJourneyDate}
                    placeholder="2024-01-15"
                    placeholderTextColor={secondaryTextColor}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: secondaryTextColor }]}>
                    Time (HH:MM, 24-hour format)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: bgColor,
                        color: textColor,
                        borderColor: borderColor,
                      },
                    ]}
                    value={journeyTime}
                    onChangeText={setJourneyTime}
                    placeholder="14:30"
                    placeholderTextColor={secondaryTextColor}
                    autoCapitalize="none"
                    returnKeyType="done"
                  />
                </View>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { borderColor }]}
                    onPress={handleCancelDate}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cancelButtonText, { color: textColor }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveDate}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={[styles.cardValue, { color: secondaryTextColor }]}>
                {journeyStartDate}
              </Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: textColor }]}>
                Average Puffs Per Day
              </Text>
              {!isEditing && (
                <TouchableOpacity
                  onPress={() => setIsEditing(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editButton}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {isEditing ? (
              <View>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: bgColor,
                      color: textColor,
                      borderColor: borderColor,
                    },
                  ]}
                  value={averagePuffs}
                  onChangeText={setAveragePuffs}
                  placeholder="e.g. 300"
                  placeholderTextColor={secondaryTextColor}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { borderColor }]}
                    onPress={handleCancel}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cancelButtonText, { color: textColor }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={[styles.cardValue, { color: secondaryTextColor }]}>
                {data.userProfile?.averagePuffsPerDay} puffs
              </Text>
            )}
          </View>

          <View style={[styles.infoCard, { backgroundColor: cardBgColor }]}>
            <Text style={[styles.infoTitle, { color: textColor }]}>
              About This Setting
            </Text>
            <Text style={[styles.infoText, { color: secondaryTextColor }]}>
              This number is used to calculate how many puffs you&rsquo;re avoiding
              since you started your journey. Update it if your average has changed.
            </Text>
          </View>
        </ScrollView>
        <TouchableOpacity
          style={[styles.backfillButton, { borderColor }]}
          onPress={handleBackfill}
          activeOpacity={0.7}
        >
          <Text style={[styles.backfillButtonText, { color: data.hasBackfilled ? secondaryTextColor : textColor }]}>
            {data.hasBackfilled ? "History Backfilled ✓" : "Backfill History"}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.version, { color: secondaryTextColor }]}>V1.1</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backfillButton: {
    marginHorizontal: 24,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },
  backfillButtonText: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    paddingBottom: 16,
  },
  keyboardView: {
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
  card: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    marginBottom: 12,
  },
  cardValue: {
    fontSize: 16,
    lineHeight: 24,
  },
  editButton: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FF6B6B",
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    fontWeight: "600" as const,
    borderWidth: 2,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    backgroundColor: "#FF6B6B",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFF",
  },
  infoCard: {
    borderRadius: 20,
    padding: 24,
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    marginBottom: 8,
  },
  themeToggleButton: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
  },
  themeToggleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  themeToggleText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
