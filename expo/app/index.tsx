import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../contexts/AppContext";

export default function Index() {
  const { data, isLoading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (data.userProfile) {
        router.replace("/home");
      } else {
        router.replace("/onboarding");
      }
    }
  }, [isLoading, data.userProfile, router]);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color="#FF6B6B" />
      <Text style={styles.text}>Loading...</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 16,
  },
  text: {
    fontSize: 16,
    color: "#FFF",
  },
});
