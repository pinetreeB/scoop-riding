import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useAppUpdate } from "@/hooks/use-app-update";

/**
 * Banner component that shows when an app update is available
 */
export function UpdateBanner() {
  const colors = useColors();
  const { hasUpdate, latestVersion, startDownload, dismissUpdate } = useAppUpdate();

  if (!hasUpdate || !latestVersion) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <View style={styles.content}>
        <MaterialIcons name="system-update" size={24} color="#fff" />
        <View style={styles.textContainer}>
          <Text style={styles.title}>새 버전 사용 가능</Text>
          <Text style={styles.version}>v{latestVersion.version}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={dismissUpdate}
          style={({ pressed }) => [
            styles.dismissButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.dismissText}>나중에</Text>
        </Pressable>
        <Pressable
          onPress={startDownload}
          style={({ pressed }) => [
            styles.updateButton,
            { opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={styles.updateText}>업데이트</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  textContainer: {
    marginLeft: 12,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  version: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dismissButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dismissText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  updateButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  updateText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
  },
});
