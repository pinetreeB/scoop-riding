/**
 * Map Selector - Platform-aware map component selection
 * 
 * - Native (Android/iOS): Uses react-native-maps with Google Maps provider
 * - Web: Falls back to WebView-based OpenStreetMap/Leaflet implementation
 * 
 * This allows the app to work in both Expo Go (web preview) and production builds (native maps).
 */

import { Platform } from "react-native";

// Re-export the appropriate map components based on platform
export const useGoogleMaps = Platform.OS !== "web";

// Export components with platform detection
export { RideMap } from "./ride-map";
export { FriendLocationMap } from "./friend-location-map";
export { CompareMap } from "./compare-map";

// Google Maps versions (only work in native builds, not Expo Go)
export { GoogleRideMap } from "./google-ride-map";
export { GoogleFriendLocationMap } from "./google-friend-location-map";
export { GoogleCompareMap } from "./google-compare-map";

/**
 * Usage example:
 * 
 * ```tsx
 * import { useGoogleMaps, RideMap, GoogleRideMap } from "@/components/map-selector";
 * 
 * // In your component:
 * const MapComponent = useGoogleMaps ? GoogleRideMap : RideMap;
 * 
 * return <MapComponent gpsPoints={points} isLive={true} />;
 * ```
 * 
 * Note: Google Maps components require a development build (not Expo Go).
 * For Expo Go testing, use the WebView-based components (RideMap, FriendLocationMap, CompareMap).
 */
