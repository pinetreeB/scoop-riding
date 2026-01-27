import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Keyboard,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getFavoritePlaces,
  addFavoritePlace,
  removeFavoritePlace,
  FavoritePlace,
  getFavoriteIcon,
} from "@/lib/favorite-places";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const RECENT_SEARCHES_KEY = "@scoop_recent_destinations";
const MAX_RECENT_SEARCHES = 10;

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

interface RecentDestination {
  place_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

export default function SearchDestinationScreen() {
  const router = useRouter();
  const colors = useColors();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);

  // Get current location for biasing search results
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    })();
  }, []);

  // Load recent destinations and favorites
  useEffect(() => {
    loadRecentDestinations();
    loadFavoritePlaces();
  }, []);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const loadRecentDestinations = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentDestinations(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load recent destinations:", error);
    }
  };

  const loadFavoritePlaces = async () => {
    const favorites = await getFavoritePlaces();
    setFavoritePlaces(favorites);
  };

  const handleAddFavorite = async (destination: RecentDestination) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    await addFavoritePlace({
      name: destination.name,
      address: destination.address,
      lat: destination.latitude,
      lng: destination.longitude,
    });
    
    await loadFavoritePlaces();
    Alert.alert("즐겨찾기 추가", `${destination.name}이(가) 즐겨찾기에 추가되었습니다.`);
  };

  const handleRemoveFavorite = async (id: string, name: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    Alert.alert(
      "즐겨찾기 삭제",
      `${name}을(를) 즐겨찾기에서 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            await removeFavoritePlace(id);
            await loadFavoritePlaces();
          },
        },
      ]
    );
  };

  const handleSelectFavorite = (favorite: FavoritePlace) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    router.push({
      pathname: "/route-preview" as any,
      params: {
        destinationName: favorite.name,
        destinationAddress: favorite.address,
        destinationLat: favorite.lat.toString(),
        destinationLng: favorite.lng.toString(),
      },
    });
  };

  const saveRecentDestination = async (destination: RecentDestination) => {
    try {
      const updated = [
        destination,
        ...recentDestinations.filter((d) => d.place_id !== destination.place_id),
      ].slice(0, MAX_RECENT_SEARCHES);
      
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      setRecentDestinations(updated);
    } catch (error) {
      console.error("Failed to save recent destination:", error);
    }
  };

  const searchPlaces = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);
    try {
      let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&language=ko&components=country:kr`;
      
      // Add location bias if available
      if (currentLocation) {
        url += `&location=${currentLocation.lat},${currentLocation.lng}&radius=50000`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK") {
        setPredictions(data.predictions);
      } else if (data.status === "ZERO_RESULTS") {
        setPredictions([]);
      } else {
        console.error("Places API error:", data.status);
        setPredictions([]);
      }
    } catch (error) {
      console.error("Search error:", error);
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentLocation]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    
    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      searchPlaces(text);
    }, 300);
  };

  const getPlaceDetails = async (placeId: string): Promise<PlaceDetails | null> => {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=place_id,name,formatted_address,geometry&key=${GOOGLE_MAPS_API_KEY}&language=ko`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK") {
        return data.result;
      }
      return null;
    } catch (error) {
      console.error("Place details error:", error);
      return null;
    }
  };

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const details = await getPlaceDetails(prediction.place_id);
      
      if (details) {
        const destination: RecentDestination = {
          place_id: details.place_id,
          name: details.name,
          address: details.formatted_address,
          latitude: details.geometry.location.lat,
          longitude: details.geometry.location.lng,
          timestamp: Date.now(),
        };

        // Save to recent destinations
        await saveRecentDestination(destination);

        // Navigate to route preview screen
        router.push({
          pathname: "/route-preview" as any,
          params: {
            destinationName: destination.name,
            destinationAddress: destination.address,
            destinationLat: destination.latitude.toString(),
            destinationLng: destination.longitude.toString(),
          },
        });
      } else {
        Alert.alert("오류", "장소 정보를 가져올 수 없습니다.");
      }
    } catch (error) {
      console.error("Select place error:", error);
      Alert.alert("오류", "장소 선택 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRecent = (destination: RecentDestination) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Update timestamp and move to top
    const updated: RecentDestination = {
      ...destination,
      timestamp: Date.now(),
    };
    saveRecentDestination(updated);

    // Navigate to route preview screen
    router.push({
      pathname: "/route-preview" as any,
      params: {
        destinationName: destination.name,
        destinationAddress: destination.address,
        destinationLat: destination.latitude.toString(),
        destinationLng: destination.longitude.toString(),
      },
    });
  };

  const clearRecentDestinations = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    Alert.alert(
      "최근 검색 삭제",
      "모든 최근 검색 기록을 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
            setRecentDestinations([]);
          },
        },
      ]
    );
  };

  const renderPredictionItem = ({ item }: { item: PlacePrediction }) => (
    <Pressable
      onPress={() => handleSelectPlace(item)}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      className="px-4 py-3 border-b border-border"
    >
      <View className="flex-row items-center">
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.primary + "20" }}
        >
          <MaterialIcons name="place" size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-foreground font-medium" numberOfLines={1}>
            {item.structured_formatting.main_text}
          </Text>
          <Text className="text-muted text-sm" numberOfLines={1}>
            {item.structured_formatting.secondary_text}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  const renderRecentItem = ({ item }: { item: RecentDestination }) => (
    <Pressable
      onPress={() => handleSelectRecent(item)}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      className="px-4 py-3 border-b border-border"
    >
      <View className="flex-row items-center">
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.muted + "20" }}
        >
          <MaterialIcons name="history" size={20} color={colors.muted} />
        </View>
        <View className="flex-1">
          <Text className="text-foreground font-medium" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-muted text-sm" numberOfLines={1}>
            {item.address}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-2 -ml-2"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        
        <View className="flex-1 mx-2">
          <View className="bg-surface rounded-full px-4 py-2 flex-row items-center">
            <MaterialIcons name="search" size={20} color={colors.muted} />
            <TextInput
              ref={inputRef}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="목적지 검색"
              placeholderTextColor={colors.muted}
              className="flex-1 ml-2 text-foreground"
              style={{ fontSize: 16 }}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchQuery("");
                  setPredictions([]);
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Loading Indicator */}
      {isLoading && (
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {/* Search Results */}
      {searchQuery.length > 0 && predictions.length > 0 && (
        <FlatList
          data={predictions}
          keyExtractor={(item) => item.place_id}
          renderItem={renderPredictionItem}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* No Results */}
      {searchQuery.length > 1 && !isLoading && predictions.length === 0 && (
        <View className="py-8 items-center">
          <MaterialIcons name="search-off" size={48} color={colors.muted} />
          <Text className="text-muted mt-2">검색 결과가 없습니다</Text>
        </View>
      )}

      {/* Favorites & Recent Destinations */}
      {searchQuery.length === 0 && (
        <FlatList
          data={[]}
          keyExtractor={() => "empty"}
          renderItem={() => null}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {/* Favorite Places Section */}
              {favoritePlaces.length > 0 && (
                <>
                  <View className="flex-row items-center justify-between px-4 py-3">
                    <View className="flex-row items-center">
                      <MaterialIcons name="star" size={18} color={colors.warning} />
                      <Text className="text-foreground font-bold ml-1">즐겨찾기</Text>
                    </View>
                  </View>
                  {favoritePlaces.map((favorite) => (
                    <Pressable
                      key={favorite.id}
                      onPress={() => handleSelectFavorite(favorite)}
                      onLongPress={() => handleRemoveFavorite(favorite.id, favorite.name)}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                      className="px-4 py-3 border-b border-border"
                    >
                      <View className="flex-row items-center">
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: colors.warning + "20" }}
                        >
                          <MaterialIcons
                            name={getFavoriteIcon(favorite.icon) as any}
                            size={20}
                            color={colors.warning}
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-foreground font-medium" numberOfLines={1}>
                            {favorite.name}
                          </Text>
                          <Text className="text-muted text-sm" numberOfLines={1}>
                            {favorite.address}
                          </Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                      </View>
                    </Pressable>
                  ))}
                </>
              )}

              {/* Recent Destinations Section */}
              {recentDestinations.length > 0 && (
                <View className="flex-row items-center justify-between px-4 py-3">
                  <Text className="text-foreground font-bold">최근 검색</Text>
                  <Pressable
                    onPress={clearRecentDestinations}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text className="text-muted text-sm">전체 삭제</Text>
                  </Pressable>
                </View>
              )}
              {recentDestinations.map((item) => (
                <Pressable
                  key={item.place_id}
                  onPress={() => handleSelectRecent(item)}
                  onLongPress={() => handleAddFavorite(item)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="px-4 py-3 border-b border-border"
                >
                  <View className="flex-row items-center">
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: colors.muted + "20" }}
                    >
                      <MaterialIcons name="history" size={20} color={colors.muted} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-medium" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-muted text-sm" numberOfLines={1}>
                        {item.address}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleAddFavorite(item)}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 8 }]}
                    >
                      <MaterialIcons name="star-border" size={20} color={colors.muted} />
                    </Pressable>
                  </View>
                </Pressable>
              ))}

              {/* Empty State */}
              {favoritePlaces.length === 0 && recentDestinations.length === 0 && (
                <View className="py-8 items-center">
                  <MaterialIcons name="explore" size={48} color={colors.muted} />
                  <Text className="text-muted mt-2">목적지를 검색해보세요</Text>
                  <Text className="text-muted text-sm mt-1">
                    경로 안내와 함께 라이딩을 시작할 수 있습니다
                  </Text>
                  <Text className="text-muted text-xs mt-3">
                    팁: 최근 검색을 길게 누르면 즐겨찾기에 추가됩니다
                  </Text>
                </View>
              )}
            </>
          }
        />
      )}
    </ScreenContainer>
  );
}
