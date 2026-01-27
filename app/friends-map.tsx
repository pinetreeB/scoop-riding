import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Platform,
  Dimensions,
  RefreshControl,
  FlatList,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { ScreenContainer } from "@/components/screen-container";
import { FriendLocationMap } from "@/components/friend-location-map";
import { GoogleFriendLocationMap } from "@/components/google-friend-location-map";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface FriendLocation {
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updatedAt: Date;
}

export default function FriendsMapScreen() {
  const router = useRouter();
  const colors = useColors();

  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendLocation | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);

  const friendsLocationQuery = trpc.liveLocation.friends.useQuery(undefined, {
    refetchInterval: 2000, // Refresh every 2 seconds for real-time tracking
  });

  // Get my location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        setMyLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      friendsLocationQuery.refetch();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await friendsLocationQuery.refetch();
    setRefreshing(false);
  };

  const handleFriendPress = (friend: FriendLocation) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedFriend(friend);
    setShowMapModal(true);
  };

  const formatSpeed = (speed: number | null): string => {
    if (speed === null) return "-";
    const kmh = speed * 3.6; // m/s to km/h
    return `${kmh.toFixed(1)} km/h`;
  };

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    return `${Math.floor(diff / 3600)}시간 전`;
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const getDirectionName = (heading: number): string => {
    const directions = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
    const index = Math.round(heading / 45) % 8;
    return directions[index];
  };

  const renderFriendItem = ({ item }: { item: FriendLocation }) => {
    const distanceFromMe = myLocation
      ? calculateDistance(myLocation.latitude, myLocation.longitude, item.latitude, item.longitude)
      : null;

    return (
      <Pressable
        onPress={() => handleFriendPress(item)}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        className="bg-surface rounded-2xl p-4 mb-3 border border-border"
      >
        <View className="flex-row items-center">
          {/* Avatar with profile image */}
          {item.profileImageUrl ? (
            <Image
              source={{ uri: item.profileImageUrl }}
              style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
            />
          ) : (
            <View
              className="w-12 h-12 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white font-bold text-lg">
                {(item.name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}

          {/* Info */}
          <View className="flex-1">
            <Text className="text-foreground font-semibold text-base">
              {item.name || "Unknown"}
            </Text>
            <View className="flex-row items-center mt-1">
              <MaterialIcons name="electric-scooter" size={14} color={colors.primary} />
              <Text className="text-primary text-sm ml-1 font-medium">주행 중</Text>
              <Text className="text-muted text-xs ml-2">
                {formatTime(item.updatedAt)}
              </Text>
            </View>
          </View>

          {/* Stats and Map Icon */}
          <View className="items-end">
            <View className="flex-row items-center">
              <MaterialIcons name="speed" size={16} color={colors.muted} />
              <Text className="text-foreground font-medium ml-1">
                {formatSpeed(item.speed)}
              </Text>
            </View>
            {distanceFromMe !== null && (
              <View className="flex-row items-center mt-1">
                <MaterialIcons name="place" size={14} color={colors.muted} />
                <Text className="text-muted text-xs ml-1">
                  {formatDistance(distanceFromMe)} 떨어짐
                </Text>
              </View>
            )}
          </View>
          
          {/* Map indicator */}
          <View className="ml-3">
            <MaterialIcons name="map" size={24} color={colors.primary} />
          </View>
        </View>

        {/* Direction indicator */}
        {item.heading !== null && (
          <View className="flex-row items-center mt-3 pt-3 border-t border-border">
            <View
              className="w-8 h-8 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: colors.primary + "20" }}
            >
              <MaterialIcons
                name="navigation"
                size={18}
                color={colors.primary}
                style={{ transform: [{ rotate: `${item.heading}deg` }] }}
              />
            </View>
            <Text className="text-muted text-sm">
              {getDirectionName(item.heading)} 방향으로 이동 중
            </Text>
            <View className="flex-1" />
            <Text className="text-primary text-sm font-medium">
              탭하여 지도 보기 →
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  const ridingFriends = friendsLocationQuery.data || [];

  // Generate OpenStreetMap URL for the selected friend's location
  const getMapUrl = (lat: number, lon: number) => {
    return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01}%2C${lat - 0.01}%2C${lon + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lon}`;
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-border">
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            router.back();
          }}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="mr-4"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">친구 실시간 위치</Text>
        <Pressable
          onPress={handleRefresh}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-2"
        >
          <MaterialIcons name="refresh" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Content */}
      {friendsLocationQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted mt-4">친구 위치 불러오는 중...</Text>
        </View>
      ) : ridingFriends.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.muted + "20" }}
          >
            <MaterialIcons name="location-off" size={40} color={colors.muted} />
          </View>
          <Text className="text-foreground text-lg font-semibold text-center mb-2">
            주행 중인 친구가 없습니다
          </Text>
          <Text className="text-muted text-center">
            친구가 주행을 시작하면 여기서 실시간 위치를 확인할 수 있습니다
          </Text>
        </View>
      ) : (
        <FlatList
          data={ridingFriends}
          renderItem={renderFriendItem}
          keyExtractor={(item) => item.userId.toString()}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View className="bg-primary/10 rounded-xl p-4 mb-4">
              <View className="flex-row items-center">
                <MaterialIcons name="info" size={20} color={colors.primary} />
                <Text className="text-primary font-medium ml-2">
                  {ridingFriends.length}명의 친구가 주행 중입니다
                </Text>
              </View>
              <Text className="text-muted text-sm mt-2">
                친구를 탭하면 지도에서 위치를 확인할 수 있습니다
              </Text>
            </View>
          }
        />
      )}

      {/* Map Modal */}
      <Modal
        visible={showMapModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowMapModal(false)}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "left", "right"]}>
          {/* Modal Header */}
          <View className="flex-row items-center px-5 pt-2 pb-3 border-b border-border">
            <Pressable
              onPress={() => setShowMapModal(false)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="mr-4"
            >
              <MaterialIcons name="close" size={24} color={colors.foreground} />
            </Pressable>
            <View className="flex-1 flex-row items-center">
              {selectedFriend?.profileImageUrl ? (
                <Image
                  source={{ uri: selectedFriend.profileImageUrl }}
                  style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
                />
              ) : (
                <View
                  className="w-8 h-8 rounded-full items-center justify-center mr-2"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-white font-bold text-sm">
                    {(selectedFriend?.name || "?")[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <Text className="text-xl font-bold text-foreground">
                {selectedFriend?.name || "친구"} 위치
              </Text>
            </View>
          </View>

          {/* Map View */}
          {selectedFriend ? (
            <View className="flex-1">
              {/* Real Map with OpenStreetMap */}
              {Platform.OS !== "web" ? (
                <GoogleFriendLocationMap
                  latitude={selectedFriend.latitude}
                  longitude={selectedFriend.longitude}
                  heading={selectedFriend.heading}
                  name={selectedFriend.name}
                  profileImageUrl={selectedFriend.profileImageUrl}
                  style={{ flex: 1 }}
                />
              ) : (
                <FriendLocationMap
                  latitude={selectedFriend.latitude}
                  longitude={selectedFriend.longitude}
                  heading={selectedFriend.heading}
                  name={selectedFriend.name}
                  profileImageUrl={selectedFriend.profileImageUrl}
                  style={{ flex: 1 }}
                />
              )}

              {/* Info Panel */}
              <View className="p-4 border-t border-border" style={{ backgroundColor: colors.background }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <MaterialIcons name="speed" size={20} color={colors.primary} />
                    <Text className="text-foreground font-medium ml-2">
                      {formatSpeed(selectedFriend.speed)}
                    </Text>
                  </View>
                  {selectedFriend.heading !== null && (
                    <View className="flex-row items-center">
                      <MaterialIcons name="explore" size={20} color={colors.primary} />
                      <Text className="text-foreground font-medium ml-2">
                        {getDirectionName(selectedFriend.heading)} 방향
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center">
                    <MaterialIcons name="access-time" size={20} color={colors.muted} />
                    <Text className="text-muted ml-2">
                      {formatTime(selectedFriend.updatedAt)}
                    </Text>
                  </View>
                </View>
                
                {myLocation && (
                  <View className="mt-3 pt-3 border-t border-border">
                    <View className="flex-row items-center justify-center">
                      <MaterialIcons name="social-distance" size={20} color={colors.muted} />
                      <Text className="text-muted ml-2">
                        나와의 거리: {formatDistance(calculateDistance(
                          myLocation.latitude, 
                          myLocation.longitude, 
                          selectedFriend.latitude, 
                          selectedFriend.longitude
                        ))}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </ScreenContainer>
  );
}
