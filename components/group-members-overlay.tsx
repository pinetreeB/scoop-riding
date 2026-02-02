/**
 * Group Members Overlay
 * Shows group members on the left side of the riding screen
 * - Gray profile when member is in group but not riding
 * - Colored profile when member is actively riding
 * - Tap to focus on member's location on map
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { BlurView } from "expo-blur";
import { Platform } from "react-native";

export interface GroupMember {
  id: number;
  name: string | null;
  profileImage: string | null;
  isRiding: boolean; // true if actively riding
  latitude?: number;
  longitude?: number;
  speed?: number; // km/h
  distance?: number; // km from current user
}

interface GroupMembersOverlayProps {
  members: GroupMember[];
  currentUserId: number;
  onMemberPress?: (member: GroupMember) => void;
}

export function GroupMembersOverlay({
  members,
  currentUserId,
  onMemberPress,
}: GroupMembersOverlayProps) {
  // Filter out current user and sort: riding members first
  const otherMembers = members
    .filter((m) => m.id !== currentUserId)
    .sort((a, b) => {
      if (a.isRiding && !b.isRiding) return -1;
      if (!a.isRiding && b.isRiding) return 1;
      return 0;
    });

  if (otherMembers.length === 0) {
    return null;
  }

  const Container = Platform.OS === "ios" ? BlurView : View;
  const containerProps =
    Platform.OS === "ios"
      ? { intensity: 40, tint: "dark" as const }
      : {};

  return (
    <View style={styles.container}>
      <Container
        style={[
          styles.overlay,
          Platform.OS !== "ios" && styles.overlayAndroid,
        ]}
        {...containerProps}
      >
        <Text style={styles.title}>그룹원</Text>
        <View style={styles.membersList}>
          {otherMembers.map((member) => (
            <TouchableOpacity
              key={member.id}
              style={styles.memberItem}
              onPress={() => onMemberPress?.(member)}
              disabled={!member.isRiding || !member.latitude}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.profileContainer,
                  !member.isRiding && styles.profileInactive,
                ]}
              >
                {member.profileImage ? (
                  <Image
                    source={{ uri: member.profileImage }}
                    style={[
                      styles.profileImage,
                      !member.isRiding && styles.profileImageInactive,
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.profilePlaceholder,
                      !member.isRiding && styles.profilePlaceholderInactive,
                    ]}
                  >
                    <Text style={styles.profileInitial}>
                      {member.name?.charAt(0) || "?"}
                    </Text>
                  </View>
                )}
                {member.isRiding && (
                  <View style={styles.ridingIndicator} />
                )}
              </View>
              <Text
                style={[
                  styles.memberName,
                  !member.isRiding && styles.memberNameInactive,
                ]}
                numberOfLines={1}
              >
                {member.name || "익명"}
              </Text>
              {member.isRiding && member.speed !== undefined && (
                <Text style={styles.memberSpeed}>
                  {member.speed.toFixed(0)}km/h
                </Text>
              )}
              {!member.isRiding && (
                <Text style={styles.memberStatus}>대기중</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    top: 200,
    zIndex: 100,
  },
  overlay: {
    borderRadius: 16,
    overflow: "hidden",
    padding: 12,
    minWidth: 80,
  },
  overlayAndroid: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  title: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
    opacity: 0.8,
  },
  membersList: {
    gap: 12,
  },
  memberItem: {
    alignItems: "center",
    gap: 4,
  },
  profileContainer: {
    position: "relative",
  },
  profileInactive: {
    opacity: 0.5,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#4CAF50",
  },
  profileImageInactive: {
    borderColor: "#666",
    opacity: 0.6,
  },
  profilePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FF6B00",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#4CAF50",
  },
  profilePlaceholderInactive: {
    backgroundColor: "#555",
    borderColor: "#666",
  },
  profileInitial: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  ridingIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4CAF50",
    borderWidth: 2,
    borderColor: "#fff",
  },
  memberName: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
    maxWidth: 60,
    textAlign: "center",
  },
  memberNameInactive: {
    color: "#999",
  },
  memberSpeed: {
    color: "#4CAF50",
    fontSize: 10,
    fontWeight: "600",
  },
  memberStatus: {
    color: "#999",
    fontSize: 9,
  },
});
