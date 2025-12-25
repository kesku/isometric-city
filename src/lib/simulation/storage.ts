import { GameState, SavedCityMeta } from '@/types/game';
import { generateUUID } from './core';
import { SPRITE_PACKS, DEFAULT_SPRITE_PACK_ID } from '../renderConfig';

const STORAGE_KEY = 'isocity-game-state';
const SAVED_CITY_STORAGE_KEY = 'isocity-saved-city';
const SAVED_CITIES_INDEX_KEY = 'isocity-saved-cities-index';
const SAVED_CITY_PREFIX = 'isocity-city-';
const SPRITE_PACK_STORAGE_KEY = 'isocity-sprite-pack';
const DAY_NIGHT_MODE_STORAGE_KEY = 'isocity-day-night-mode';

export type DayNightMode = 'auto' | 'day' | 'night';

export type SavedCityInfo = {
  cityName: string;
  population: number;
  money: number;
  savedAt: number;
} | null;

export function loadGameState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (
      parsed &&
      parsed.grid &&
      Array.isArray(parsed.grid) &&
      parsed.gridSize &&
      typeof parsed.gridSize === 'number' &&
      parsed.stats &&
      parsed.stats.money !== undefined &&
      parsed.stats.population !== undefined
    ) {
      // Migrations
      if (parsed.grid) {
        for (let y = 0; y < parsed.grid.length; y++) {
          for (let x = 0; x < parsed.grid[y].length; x++) {
            if (parsed.grid[y][x]?.building?.type === 'park_medium') {
              parsed.grid[y][x].building.type = 'park_large';
            }
            if (
              parsed.grid[y][x]?.building &&
              parsed.grid[y][x].building.constructionProgress === undefined
            ) {
              parsed.grid[y][x].building.constructionProgress = 100;
            }
            if (parsed.grid[y][x]?.building && parsed.grid[y][x].building.abandoned === undefined) {
              parsed.grid[y][x].building.abandoned = false;
            }
          }
        }
      }
      if (parsed.selectedTool === 'park_medium') parsed.selectedTool = 'park_large';
      if (!parsed.adjacentCities) parsed.adjacentCities = [];
      for (const city of parsed.adjacentCities) {
        if (city.discovered === undefined) city.discovered = true;
      }
      if (!parsed.waterBodies) parsed.waterBodies = [];
      if (parsed.hour === undefined) parsed.hour = 12;
      if (parsed.effectiveTaxRate === undefined) parsed.effectiveTaxRate = parsed.taxRate ?? 9;
      if (parsed.gameVersion === undefined) parsed.gameVersion = 0;
      if (!parsed.id) parsed.id = generateUUID();

      return parsed as GameState;
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to load game state:', e);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (clearError) {}
  }
  return null;
}

export function saveGameState(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    if (!state || !state.grid || !state.gridSize || !state.stats) return;
    const serialized = JSON.stringify(state);
    if (serialized.length > 5 * 1024 * 1024) return;
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e) {}
}

export function clearGameState(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function loadSpritePackId(): string {
  if (typeof window === 'undefined') return DEFAULT_SPRITE_PACK_ID;
  try {
    const saved = localStorage.getItem(SPRITE_PACK_STORAGE_KEY);
    if (saved && SPRITE_PACKS.some((p) => p.id === saved)) return saved;
  } catch (e) {}
  return DEFAULT_SPRITE_PACK_ID;
}

export function saveSpritePackId(packId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SPRITE_PACK_STORAGE_KEY, packId);
}

export function loadDayNightMode(): DayNightMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = localStorage.getItem(DAY_NIGHT_MODE_STORAGE_KEY);
    if (saved === 'auto' || saved === 'day' || saved === 'night') return saved;
  } catch (e) {}
  return 'auto';
}

export function saveDayNightMode(mode: DayNightMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DAY_NIGHT_MODE_STORAGE_KEY, mode);
}

export function saveCityForRestore(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    const savedData = {
      state: state,
      info: {
        cityName: state.cityName,
        population: state.stats.population,
        money: state.stats.money,
        savedAt: Date.now(),
      },
    };
    localStorage.setItem(SAVED_CITY_STORAGE_KEY, JSON.stringify(savedData));
  } catch (e) {}
}

export function loadSavedCityInfo(): SavedCityInfo {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.info || null;
    }
  } catch (e) {}
  return null;
}

export function loadSavedCityState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SAVED_CITY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.state && parsed.state.grid && parsed.state.gridSize && parsed.state.stats) {
        return parsed.state as GameState;
      }
    }
  } catch (e) {}
  return null;
}

export function clearSavedCityStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SAVED_CITY_STORAGE_KEY);
}

export function loadSavedCitiesIndex(): SavedCityMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(SAVED_CITIES_INDEX_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

export function saveSavedCitiesIndex(index: SavedCityMeta[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SAVED_CITIES_INDEX_KEY, JSON.stringify(index));
}

export function saveCityState(cityId: string, state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    if (serialized.length > 5 * 1024 * 1024) return;
    localStorage.setItem(`${SAVED_CITY_PREFIX}${cityId}`, serialized);
  } catch (e) {}
}

export function loadCityState(cityId: string): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(`${SAVED_CITY_PREFIX}${cityId}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return null;
}

export function deleteCityState(cityId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${SAVED_CITY_PREFIX}${cityId}`);
    const index = loadSavedCitiesIndex().filter((c) => c.id !== cityId);
    saveSavedCitiesIndex(index);
  } catch (e) {}
}
