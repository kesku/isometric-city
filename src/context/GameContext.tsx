// Consolidated GameContext for the SimCity-like game
'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, useRef } from 'react';
import {
  Budget,
  BuildingType,
  GameState,
  SavedCityMeta,
  Tool,
  TOOL_INFO,
  ZoneType,
} from '@/types/game';
import {
  bulldozeTile,
  createInitialGameState,
  DEFAULT_GRID_SIZE,
  placeBuilding,
  placeSubway,
  simulateTick,
  checkForDiscoverableCities,
  generateRandomAdvancedCity,
  loadGameState,
  saveGameState,
  clearGameState,
  loadSpritePackId,
  saveSpritePackId,
  loadDayNightMode,
  saveDayNightMode,
  saveCityForRestore,
  loadSavedCityInfo,
  loadSavedCityState,
  clearSavedCityStorage,
  loadSavedCitiesIndex,
  saveCityState,
  loadCityState,
  deleteCityState,
  saveSavedCitiesIndex,
  DayNightMode,
  SavedCityInfo,
} from '@/lib/simulation/index';
import {
  SPRITE_PACKS,
  DEFAULT_SPRITE_PACK_ID,
  getSpritePack,
  setActiveSpritePack,
  SpritePack,
} from '@/lib/renderConfig';

export type { DayNightMode, SavedCityInfo };

type GameContextValue = {
  state: GameState;
  setTool: (tool: Tool) => void;
  setSpeed: (speed: 0 | 1 | 2 | 3) => void;
  setTaxRate: (rate: number) => void;
  setActivePanel: (panel: GameState['activePanel']) => void;
  setBudgetFunding: (key: keyof Budget, funding: number) => void;
  placeAtTile: (x: number, y: number) => void;
  connectToCity: (cityId: string) => void;
  discoverCity: (cityId: string) => void;
  checkAndDiscoverCities: (
    onDiscover?: (city: {
      id: string;
      direction: 'north' | 'south' | 'east' | 'west';
      name: string;
    }) => void
  ) => void;
  setDisastersEnabled: (enabled: boolean) => void;
  newGame: (name?: string, size?: number) => void;
  loadState: (stateString: string) => boolean;
  exportState: () => string;
  generateRandomCity: () => void;
  hasExistingGame: boolean;
  isSaving: boolean;
  addMoney: (amount: number) => void;
  addNotification: (title: string, description: string, icon: string) => void;
  // Sprite pack management
  currentSpritePack: SpritePack;
  availableSpritePacks: SpritePack[];
  setSpritePack: (packId: string) => void;
  // Day/night mode override
  dayNightMode: DayNightMode;
  setDayNightMode: (mode: DayNightMode) => void;
  visualHour: number; // The hour to use for rendering (respects day/night mode override)
  // Save/restore city for shared links
  saveCurrentCityForRestore: () => void;
  restoreSavedCity: () => boolean;
  getSavedCityInfo: () => SavedCityInfo;
  clearSavedCity: () => void;
  // Multi-city save system
  savedCities: SavedCityMeta[];
  saveCity: () => void;
  loadSavedCity: (cityId: string) => boolean;
  deleteSavedCity: (cityId: string) => void;
  renameSavedCity: (cityId: string, newName: string) => void;
};

const GameContext = createContext<GameContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const toolBuildingMap: Partial<Record<Tool, BuildingType>> = {
  road: 'road',
  rail: 'rail',
  rail_station: 'rail_station',
  tree: 'tree',
  police_station: 'police_station',
  fire_station: 'fire_station',
  hospital: 'hospital',
  school: 'school',
  university: 'university',
  park: 'park',
  park_large: 'park_large',
  tennis: 'tennis',
  power_plant: 'power_plant',
  water_tower: 'water_tower',
  subway_station: 'subway_station',
  stadium: 'stadium',
  museum: 'museum',
  airport: 'airport',
  space_program: 'space_program',
  city_hall: 'city_hall',
  amusement_park: 'amusement_park',
  // New parks
  basketball_courts: 'basketball_courts',
  playground_small: 'playground_small',
  playground_large: 'playground_large',
  baseball_field_small: 'baseball_field_small',
  soccer_field_small: 'soccer_field_small',
  football_field: 'football_field',
  baseball_stadium: 'baseball_stadium',
  community_center: 'community_center',
  office_building_small: 'office_building_small',
  swimming_pool: 'swimming_pool',
  skate_park: 'skate_park',
  mini_golf_course: 'mini_golf_course',
  bleachers_field: 'bleachers_field',
  go_kart_track: 'go_kart_track',
  amphitheater: 'amphitheater',
  greenhouse_garden: 'greenhouse_garden',
  animal_pens_farm: 'animal_pens_farm',
  cabin_house: 'cabin_house',
  campground: 'campground',
  marina_docks_small: 'marina_docks_small',
  pier_large: 'pier_large',
  roller_coaster_small: 'roller_coaster_small',
  community_garden: 'community_garden',
  pond_park: 'pond_park',
  park_gate: 'park_gate',
  mountain_lodge: 'mountain_lodge',
  mountain_trailhead: 'mountain_trailhead',
};

const toolZoneMap: Partial<Record<Tool, ZoneType>> = {
  zone_residential: 'residential',
  zone_commercial: 'commercial',
  zone_industrial: 'industrial',
  zone_dezone: 'none',
};

export function GameProvider({ children }: { children: React.ReactNode }) {
  // Start with a default state, we'll load from localStorage after mount
  const [state, setState] = useState<GameState>(() =>
    createInitialGameState(DEFAULT_GRID_SIZE, 'IsoCity')
  );

  const [hasExistingGame, setHasExistingGame] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(false);
  const hasLoadedRef = useRef(false);

  // Sprite pack state
  const [currentSpritePack, setCurrentSpritePack] = useState<SpritePack>(() =>
    getSpritePack(DEFAULT_SPRITE_PACK_ID)
  );

  // Day/night mode state
  const [dayNightMode, setDayNightModeState] = useState<DayNightMode>('auto');

  // Saved cities state for multi-city save system
  const [savedCities, setSavedCities] = useState<SavedCityMeta[]>([]);

  // Load game state and sprite pack from localStorage on mount (client-side only)
  useEffect(() => {
    // Load sprite pack preference
    const savedPackId = loadSpritePackId();
    const pack = getSpritePack(savedPackId);
    setCurrentSpritePack(pack);
    setActiveSpritePack(pack);

    // Load day/night mode preference
    const savedDayNightMode = loadDayNightMode();
    setDayNightModeState(savedDayNightMode);

    // Load saved cities index
    const cities = loadSavedCitiesIndex();
    setSavedCities(cities);

    // Load game state
    const saved = loadGameState();
    if (saved) {
      skipNextSaveRef.current = true; // Set skip flag BEFORE updating state
      setState(saved);
      setHasExistingGame(true);
    } else {
      setHasExistingGame(false);
    }
    // Mark as loaded immediately - the skipNextSaveRef will handle skipping the first save
    hasLoadedRef.current = true;
  }, []);

  // Track the state that needs to be saved
  const stateToSaveRef = useRef<GameState | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update the state to save whenever state changes
  useEffect(() => {
    if (!hasLoadedRef.current) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      lastSaveTimeRef.current = Date.now();
      return;
    }

    // Store current state for saving (deep copy)
    stateToSaveRef.current = JSON.parse(JSON.stringify(state));
  }, [state]);

  // Separate effect that actually performs saves on an interval
  useEffect(() => {
    // Wait for initial load
    const checkLoaded = setInterval(() => {
      if (!hasLoadedRef.current) {
        return;
      }

      // Clear the check interval
      clearInterval(checkLoaded);

      // Clear any existing save interval
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }

      // Set up interval to save every 3 seconds if there's pending state
      saveIntervalRef.current = setInterval(() => {
        // Don't save if we just loaded
        if (skipNextSaveRef.current) {
          return;
        }

        // Don't save too frequently
        const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
        if (timeSinceLastSave < 2000) {
          return;
        }

        // Don't save if there's no state to save
        if (!stateToSaveRef.current) {
          return;
        }

        // Perform the save
        setIsSaving(true);
        try {
          saveGameState(stateToSaveRef.current);
          lastSaveTimeRef.current = Date.now();
          setHasExistingGame(true);
        } finally {
          setIsSaving(false);
        }
      }, 3000); // Check every 3 seconds
    }, 100);

    return () => {
      clearInterval(checkLoaded);
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // Simulation loop - with mobile performance optimization
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (state.speed > 0) {
      // Check if running on mobile for performance optimization
      const isMobileDevice =
        typeof window !== 'undefined' &&
        (window.innerWidth < 768 ||
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          ));

      // Slower tick intervals on mobile to reduce CPU load
      // Desktop: 500ms, 220ms, 50ms for speeds 1, 2, 3
      // Mobile: 750ms, 400ms, 150ms for speeds 1, 2, 3 (50% slower)
      const interval = isMobileDevice
        ? state.speed === 1
          ? 750
          : state.speed === 2
            ? 400
            : 150
        : state.speed === 1
          ? 500
          : state.speed === 2
            ? 220
            : 50;

      timer = setInterval(() => {
        setState((prev) => simulateTick(prev));
      }, interval);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [state.speed]);

  const setTool = useCallback((tool: Tool) => {
    setState((prev) => ({ ...prev, selectedTool: tool, activePanel: 'none' }));
  }, []);

  const setSpeed = useCallback((speed: 0 | 1 | 2 | 3) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);

  const setTaxRate = useCallback((rate: number) => {
    setState((prev) => ({ ...prev, taxRate: clamp(rate, 0, 100) }));
  }, []);

  const setActivePanel = useCallback((panel: GameState['activePanel']) => {
    setState((prev) => ({ ...prev, activePanel: panel }));
  }, []);

  const setBudgetFunding = useCallback((key: keyof Budget, funding: number) => {
    const clamped = clamp(funding, 0, 100);
    setState((prev) => ({
      ...prev,
      budget: {
        ...prev.budget,
        [key]: { ...prev.budget[key], funding: clamped },
      },
    }));
  }, []);

  const placeAtTile = useCallback((x: number, y: number) => {
    setState((prev) => {
      const tool = prev.selectedTool;
      if (tool === 'select') return prev;

      const info = TOOL_INFO[tool];
      const cost = info?.cost ?? 0;
      const tile = prev.grid[y]?.[x];

      if (!tile) return prev;
      if (cost > 0 && prev.stats.money < cost) return prev;

      // Prevent wasted spend if nothing would change
      if (tool === 'bulldoze' && tile.building.type === 'grass' && tile.zone === 'none') {
        return prev;
      }

      const building = toolBuildingMap[tool];
      const zone = toolZoneMap[tool];

      if (zone && tile.zone === zone) return prev;
      if (building && tile.building.type === building) return prev;

      // Handle subway tool separately (underground placement)
      if (tool === 'subway') {
        // Can't place subway under water
        if (tile.building.type === 'water') return prev;
        // Already has subway
        if (tile.hasSubway) return prev;

        const nextState = placeSubway(prev, x, y);
        if (nextState === prev) return prev;

        return {
          ...nextState,
          stats: { ...nextState.stats, money: nextState.stats.money - cost },
        };
      }

      let nextState: GameState;

      if (tool === 'bulldoze') {
        nextState = bulldozeTile(prev, x, y);
      } else if (zone) {
        nextState = placeBuilding(prev, x, y, null, zone);
      } else if (building) {
        nextState = placeBuilding(prev, x, y, building, null);
      } else {
        return prev;
      }

      if (nextState === prev) return prev;

      if (cost > 0) {
        nextState = {
          ...nextState,
          stats: { ...nextState.stats, money: nextState.stats.money - cost },
        };
      }

      return nextState;
    });
  }, []);

  const connectToCity = useCallback((cityId: string) => {
    setState((prev) => {
      const city = prev.adjacentCities.find((c) => c.id === cityId);
      if (!city || city.connected) return prev;

      // Mark city as connected (and discovered if not already) and add trade income
      const updatedCities = prev.adjacentCities.map((c) =>
        c.id === cityId ? { ...c, connected: true, discovered: true } : c
      );

      // Add trade income bonus (one-time bonus + monthly income)
      const tradeBonus = 5000;
      const tradeIncome = 200; // Monthly income from trade

      return {
        ...prev,
        adjacentCities: updatedCities,
        stats: {
          ...prev.stats,
          money: prev.stats.money + tradeBonus,
          income: prev.stats.income + tradeIncome,
        },
        notifications: [
          {
            id: `city-connect-${Date.now()}`,
            title: 'City Connected!',
            description: `Trade route established with ${city.name}. +$${tradeBonus} bonus and +$${tradeIncome}/month income.`,
            icon: 'road',
            timestamp: Date.now(),
          },
          ...prev.notifications.slice(0, 9), // Keep only 10 most recent
        ],
      };
    });
  }, []);

  const discoverCity = useCallback((cityId: string) => {
    setState((prev) => {
      const city = prev.adjacentCities.find((c) => c.id === cityId);
      if (!city || city.discovered) return prev;

      // Mark city as discovered
      const updatedCities = prev.adjacentCities.map((c) =>
        c.id === cityId ? { ...c, discovered: true } : c
      );

      return {
        ...prev,
        adjacentCities: updatedCities,
        notifications: [
          {
            id: `city-discover-${Date.now()}`,
            title: 'City Discovered!',
            description: `Your road has reached the ${city.direction} border! You can now connect to ${city.name}.`,
            icon: 'road',
            timestamp: Date.now(),
          },
          ...prev.notifications.slice(0, 9), // Keep only 10 most recent
        ],
      };
    });
  }, []);

  // Check for cities that should be discovered based on roads reaching edges
  // Calls onDiscover callback with city info if a new city was discovered
  const checkAndDiscoverCities = useCallback(
    (
      onDiscover?: (city: {
        id: string;
        direction: 'north' | 'south' | 'east' | 'west';
        name: string;
      }) => void
    ): void => {
      setState((prev) => {
        const newlyDiscovered = checkForDiscoverableCities(
          prev.grid,
          prev.gridSize,
          prev.adjacentCities
        );

        if (newlyDiscovered.length === 0) return prev;

        // Discover the first city found
        const cityToDiscover = newlyDiscovered[0];

        const updatedCities = prev.adjacentCities.map((c) =>
          c.id === cityToDiscover.id ? { ...c, discovered: true } : c
        );

        // Call the callback after state update is scheduled
        if (onDiscover) {
          setTimeout(() => {
            onDiscover({
              id: cityToDiscover.id,
              direction: cityToDiscover.direction,
              name: cityToDiscover.name,
            });
          }, 0);
        }

        return {
          ...prev,
          adjacentCities: updatedCities,
        };
      });
    },
    []
  );

  const setDisastersEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, disastersEnabled: enabled }));
  }, []);

  const setSpritePack = useCallback((packId: string) => {
    const pack = getSpritePack(packId);
    setCurrentSpritePack(pack);
    setActiveSpritePack(pack);
    saveSpritePackId(packId);
  }, []);

  const setDayNightMode = useCallback((mode: DayNightMode) => {
    setDayNightModeState(mode);
    saveDayNightMode(mode);
  }, []);

  // Compute the visual hour based on the day/night mode override
  // This doesn't affect time progression, just the rendering
  const visualHour =
    dayNightMode === 'auto'
      ? state.hour
      : dayNightMode === 'day'
        ? 12 // Noon - full daylight
        : 22; // Night time

  const newGame = useCallback((name?: string, size?: number) => {
    clearGameState(); // Clear saved state when starting fresh
    const fresh = createInitialGameState(size ?? DEFAULT_GRID_SIZE, name || 'IsoCity');
    // Increment gameVersion from current state to ensure vehicles/entities are cleared
    setState((prev) => ({
      ...fresh,
      gameVersion: (prev.gameVersion ?? 0) + 1,
    }));
  }, []);

  const loadState = useCallback((stateString: string): boolean => {
    try {
      const parsed = JSON.parse(stateString);
      // Validate it has essential properties
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
        // Ensure new fields exist for backward compatibility
        if (!parsed.adjacentCities) {
          parsed.adjacentCities = [];
        }
        // Migrate adjacentCities to have 'discovered' property
        for (const city of parsed.adjacentCities) {
          if (city.discovered === undefined) {
            // Old cities that exist are implicitly discovered (they were visible in the old system)
            city.discovered = true;
          }
        }
        if (!parsed.waterBodies) {
          parsed.waterBodies = [];
        }
        // Ensure effectiveTaxRate exists for lagging tax effect
        if (parsed.effectiveTaxRate === undefined) {
          parsed.effectiveTaxRate = parsed.taxRate ?? 9;
        }
        // Migrate constructionProgress for existing buildings (they're already built)
        if (parsed.grid) {
          for (let y = 0; y < parsed.grid.length; y++) {
            for (let x = 0; x < parsed.grid[y].length; x++) {
              if (
                parsed.grid[y][x]?.building &&
                parsed.grid[y][x].building.constructionProgress === undefined
              ) {
                parsed.grid[y][x].building.constructionProgress = 100; // Existing buildings are complete
              }
              // Migrate abandoned property for existing buildings (they're not abandoned)
              if (
                parsed.grid[y][x]?.building &&
                parsed.grid[y][x].building.abandoned === undefined
              ) {
                parsed.grid[y][x].building.abandoned = false;
              }
            }
          }
        }
        // Increment gameVersion to clear vehicles/entities when loading a new state
        setState((prev) => ({
          ...(parsed as GameState),
          gameVersion: (prev.gameVersion ?? 0) + 1,
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const exportState = useCallback((): string => {
    return JSON.stringify(state);
  }, [state]);

  const generateRandomCity = useCallback(() => {
    clearGameState(); // Clear saved state when generating a new city
    const randomCity = generateRandomAdvancedCity(DEFAULT_GRID_SIZE);
    // Increment gameVersion to ensure vehicles/entities are cleared
    setState((prev) => ({
      ...randomCity,
      gameVersion: (prev.gameVersion ?? 0) + 1,
    }));
  }, []);

  const addMoney = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        money: prev.stats.money + amount,
      },
    }));
  }, []);

  const addNotification = useCallback((title: string, description: string, icon: string) => {
    setState((prev) => {
      const newNotifications = [
        {
          id: `cheat-${Date.now()}-${Math.random()}`,
          title,
          description,
          icon,
          timestamp: Date.now(),
        },
        ...prev.notifications,
      ];
      // Keep only recent notifications
      while (newNotifications.length > 10) {
        newNotifications.pop();
      }
      return {
        ...prev,
        notifications: newNotifications,
      };
    });
  }, []);

  // Save current city for restore (when viewing shared cities)
  const saveCurrentCityForRestore = useCallback(() => {
    saveCityForRestore(state);
  }, [state]);

  // Restore saved city
  const restoreSavedCity = useCallback((): boolean => {
    const savedState = loadSavedCityState();
    if (savedState) {
      skipNextSaveRef.current = true;
      setState(savedState);
      clearSavedCityStorage();
      return true;
    }
    return false;
  }, []);

  // Get saved city info
  const getSavedCityInfo = useCallback((): SavedCityInfo => {
    return loadSavedCityInfo();
  }, []);

  // Clear saved city
  const clearSavedCity = useCallback(() => {
    clearSavedCityStorage();
  }, []);

  // Save current city to the multi-save system
  const saveCity = useCallback(() => {
    const cityMeta: SavedCityMeta = {
      id: state.id,
      cityName: state.cityName,
      population: state.stats.population,
      money: state.stats.money,
      year: state.year,
      month: state.month,
      gridSize: state.gridSize,
      savedAt: Date.now(),
    };

    // Save the city state
    saveCityState(state.id, state);

    // Update the index
    setSavedCities((prev) => {
      // Check if this city already exists in the list
      const existingIndex = prev.findIndex((c) => c.id === state.id);
      let newCities: SavedCityMeta[];

      if (existingIndex >= 0) {
        // Update existing entry
        newCities = [...prev];
        newCities[existingIndex] = cityMeta;
      } else {
        // Add new entry
        newCities = [...prev, cityMeta];
      }

      // Sort by savedAt descending (most recent first)
      newCities.sort((a, b) => b.savedAt - a.savedAt);

      // Persist to localStorage
      saveSavedCitiesIndex(newCities);

      return newCities;
    });
  }, [state]);

  // Load a saved city from the multi-save system
  const loadSavedCity = useCallback((cityId: string): boolean => {
    const cityState = loadCityState(cityId);
    if (!cityState) return false;

    // Ensure the loaded state has an ID
    if (!cityState.id) {
      cityState.id = cityId;
    }

    // Perform migrations for backward compatibility
    if (!cityState.adjacentCities) {
      cityState.adjacentCities = [];
    }
    for (const city of cityState.adjacentCities) {
      if (city.discovered === undefined) {
        city.discovered = true;
      }
    }
    if (!cityState.waterBodies) {
      cityState.waterBodies = [];
    }
    if (cityState.effectiveTaxRate === undefined) {
      cityState.effectiveTaxRate = cityState.taxRate ?? 9;
    }
    if (cityState.grid) {
      for (let y = 0; y < cityState.grid.length; y++) {
        for (let x = 0; x < cityState.grid[y].length; x++) {
          if (
            cityState.grid[y][x]?.building &&
            cityState.grid[y][x].building.constructionProgress === undefined
          ) {
            cityState.grid[y][x].building.constructionProgress = 100;
          }
          if (
            cityState.grid[y][x]?.building &&
            cityState.grid[y][x].building.abandoned === undefined
          ) {
            cityState.grid[y][x].building.abandoned = false;
          }
        }
      }
    }

    skipNextSaveRef.current = true;
    setState((prev) => ({
      ...cityState,
      gameVersion: (prev.gameVersion ?? 0) + 1,
    }));

    // Also update the current game in local storage
    saveGameState(cityState);

    return true;
  }, []);

  // Delete a saved city from the multi-save system
  const deleteSavedCity = useCallback((cityId: string) => {
    // Delete the city state
    deleteCityState(cityId);

    // Update the index
    setSavedCities((prev) => {
      const newCities = prev.filter((c) => c.id !== cityId);
      saveSavedCitiesIndex(newCities);
      return newCities;
    });
  }, []);

  // Rename a saved city
  const renameSavedCity = useCallback(
    (cityId: string, newName: string) => {
      // Load the city state, update the name, and save it back
      const cityState = loadCityState(cityId);
      if (cityState) {
        cityState.cityName = newName;
        saveCityState(cityId, cityState);
      }

      // Update the index
      setSavedCities((prev) => {
        const newCities = prev.map((c) => (c.id === cityId ? { ...c, cityName: newName } : c));
        saveSavedCitiesIndex(newCities);
        return newCities;
      });

      // If the current game is the one being renamed, update its state too
      if (state.id === cityId) {
        setState((prev) => ({ ...prev, cityName: newName }));
      }
    },
    [state.id]
  );

  const value: GameContextValue = {
    state,
    setTool,
    setSpeed,
    setTaxRate,
    setActivePanel,
    setBudgetFunding,
    placeAtTile,
    connectToCity,
    discoverCity,
    checkAndDiscoverCities,
    setDisastersEnabled,
    newGame,
    loadState,
    exportState,
    generateRandomCity,
    hasExistingGame,
    isSaving,
    addMoney,
    addNotification,
    // Sprite pack management
    currentSpritePack,
    availableSpritePacks: SPRITE_PACKS,
    setSpritePack,
    // Day/night mode override
    dayNightMode,
    setDayNightMode,
    visualHour,
    // Save/restore city for shared links
    saveCurrentCityForRestore,
    restoreSavedCity,
    getSavedCityInfo,
    clearSavedCity,
    // Multi-city save system
    savedCities,
    saveCity,
    loadSavedCity,
    deleteSavedCity,
    renameSavedCity,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}
