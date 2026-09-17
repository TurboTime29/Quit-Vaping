import { StatusBar } from "expo-status-bar";
import { useApp } from "../contexts/AppContext";

export default function ThemedStatusBar() {
  const { data } = useApp();
  return <StatusBar style={data.theme === "dark" ? "light" : "dark"} />;
}
