import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Announcement {
  id: number;
  title: string;
  content: string;
  type: "notice" | "update" | "event" | "maintenance";
  priority: number;
  createdAt: Date;
}

interface AnnouncementPopupProps {
  visible: boolean;
  announcements: Announcement[];
  onClose: () => void;
  onDismiss: (id: number) => void;
}

export function AnnouncementPopup({
  visible,
  announcements,
  onClose,
  onDismiss,
}: AnnouncementPopupProps) {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
    }
  }, [visible]);

  if (!visible || announcements.length === 0) return null;

  const currentAnnouncement = announcements[currentIndex];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "update":
        return "system-update";
      case "event":
        return "celebration";
      case "maintenance":
        return "build";
      default:
        return "campaign";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "update":
        return "#4CAF50";
      case "event":
        return "#FF9800";
      case "maintenance":
        return "#F44336";
      default:
        return colors.primary;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "update":
        return "업데이트";
      case "event":
        return "이벤트";
      case "maintenance":
        return "점검";
      default:
        return "공지";
    }
  };

  const handleNext = () => {
    if (currentIndex < announcements.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handleDismiss = () => {
    onDismiss(currentAnnouncement.id);
    handleNext();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.typeContainer}>
              <MaterialIcons
                name={getTypeIcon(currentAnnouncement.type)}
                size={20}
                color={getTypeColor(currentAnnouncement.type)}
              />
              <Text
                style={[
                  styles.typeLabel,
                  { color: getTypeColor(currentAnnouncement.type) },
                ]}
              >
                {getTypeLabel(currentAnnouncement.type)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {currentAnnouncement.title}
            </Text>
            <Text style={[styles.body, { color: colors.foreground }]}>
              {currentAnnouncement.content}
            </Text>
          </ScrollView>

          {/* Pagination */}
          {announcements.length > 1 && (
            <View style={styles.pagination}>
              {announcements.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        index === currentIndex ? colors.primary : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
          )}

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={handleDismiss}
              style={styles.dismissButton}
            >
              <Text style={[styles.dismissText, { color: colors.muted }]}>
                다시 보지 않기
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              style={[styles.confirmButton, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.confirmText}>
                {currentIndex < announcements.length - 1 ? "다음" : "확인"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: SCREEN_WIDTH - 40,
    maxWidth: 400,
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  typeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    maxHeight: 300,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    lineHeight: 26,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
  },
  dismissButton: {
    padding: 8,
  },
  dismissText: {
    fontSize: 14,
  },
  confirmButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
