import { useRouter } from "expo-router";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../contexts/AppContext";

export default function Onboarding() {
  const { setUserProfile } = useApp();
  const router = useRouter();
  const [averagePuffs, setAveragePuffs] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleContinue = () => {
    const puffs = parseInt(averagePuffs, 10);
    
    if (!averagePuffs || isNaN(puffs) || puffs <= 0) {
      setError("Please enter a valid number of puffs");
      return;
    }

    setUserProfile({
      averagePuffsPerDay: puffs,
      journeyStartDate: new Date().toISOString(),
    });

    router.replace("/home");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <Text style={styles.title}>Let&rsquo;s Get Started</Text>
            <Text style={styles.subtitle}>
              Your journey to quit vaping starts now
            </Text>

            <View style={styles.formContainer}>
              <Text style={styles.label}>
                What&rsquo;s your average puffs per day?
              </Text>
              <TextInput
                style={styles.input}
                value={averagePuffs}
                onChangeText={(text) => {
                  setAveragePuffs(text);
                  setError("");
                }}
                placeholder="e.g. 300"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                returnKeyType="done"
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Text style={styles.helperText}>
                This helps us calculate how many puffs you&rsquo;re avoiding
              </Text>
            </View>

            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.continueButtonText}>Start Journey</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 36,
    fontWeight: "700" as const,
    color: "#FFF",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    color: "#999",
    marginBottom: 60,
  },
  formContainer: {
    flex: 1,
  },
  label: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: "#FFF",
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 20,
    fontSize: 28,
    color: "#FFF",
    fontWeight: "600" as const,
    borderWidth: 2,
    borderColor: "#2A2A2A",
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
    marginTop: 8,
  },
  helperText: {
    fontSize: 14,
    color: "#666",
    marginTop: 12,
    lineHeight: 20,
  },
  continueButton: {
    backgroundColor: "#FF6B6B",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFF",
  },
});
