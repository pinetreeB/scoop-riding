import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = '@scoop_favorite_places';

export interface FavoritePlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  createdAt: number;
  icon?: 'home' | 'work' | 'star' | 'favorite';
}

// Get all favorite places
export async function getFavoritePlaces(): Promise<FavoritePlace[]> {
  try {
    const stored = await AsyncStorage.getItem(FAVORITES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load favorite places:', error);
  }
  return [];
}

// Add a new favorite place
export async function addFavoritePlace(place: Omit<FavoritePlace, 'id' | 'createdAt'>): Promise<FavoritePlace> {
  const favorites = await getFavoritePlaces();
  
  // Check if place already exists (by lat/lng)
  const exists = favorites.find(
    f => Math.abs(f.lat - place.lat) < 0.0001 && Math.abs(f.lng - place.lng) < 0.0001
  );
  
  if (exists) {
    return exists;
  }
  
  const newPlace: FavoritePlace = {
    ...place,
    id: `fav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now(),
  };
  
  favorites.unshift(newPlace); // Add to beginning
  
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.error('Failed to save favorite place:', error);
  }
  
  return newPlace;
}

// Remove a favorite place
export async function removeFavoritePlace(id: string): Promise<boolean> {
  const favorites = await getFavoritePlaces();
  const filtered = favorites.filter(f => f.id !== id);
  
  if (filtered.length === favorites.length) {
    return false; // Not found
  }
  
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to remove favorite place:', error);
    return false;
  }
}

// Update a favorite place
export async function updateFavoritePlace(id: string, updates: Partial<FavoritePlace>): Promise<FavoritePlace | null> {
  const favorites = await getFavoritePlaces();
  const index = favorites.findIndex(f => f.id === id);
  
  if (index === -1) {
    return null;
  }
  
  favorites[index] = { ...favorites[index], ...updates };
  
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return favorites[index];
  } catch (error) {
    console.error('Failed to update favorite place:', error);
    return null;
  }
}

// Check if a place is favorited
export async function isFavoritePlace(lat: number, lng: number): Promise<FavoritePlace | null> {
  const favorites = await getFavoritePlaces();
  return favorites.find(
    f => Math.abs(f.lat - lat) < 0.0001 && Math.abs(f.lng - lng) < 0.0001
  ) || null;
}

// Get favorite place icon
export function getFavoriteIcon(icon?: FavoritePlace['icon']): string {
  switch (icon) {
    case 'home':
      return 'home';
    case 'work':
      return 'work';
    case 'favorite':
      return 'favorite';
    case 'star':
    default:
      return 'star';
  }
}
