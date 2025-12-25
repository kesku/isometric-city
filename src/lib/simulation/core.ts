import { Tile, Building, BuildingType, Budget, Stats, ServiceCoverage } from '@/types/game';

import { isMobile } from 'react-device-detect';

// Default grid size for new games
export const DEFAULT_GRID_SIZE = isMobile ? 50 : 70;

// Building types that don't require construction, and are already complete when placed
export const NO_CONSTRUCTION_TYPES: BuildingType[] = ['grass', 'empty', 'water', 'road', 'tree'];

// Service building configuration
export const SERVICE_CONFIG = {
  police_station: { range: 13, rangeSquared: 169, type: 'police' as const, requiresRoad: true },
  fire_station: { range: 18, rangeSquared: 324, type: 'fire' as const, requiresRoad: true },
  hospital: { range: 12, rangeSquared: 144, type: 'health' as const, requiresRoad: true },
  school: { range: 11, rangeSquared: 121, type: 'education' as const, requiresRoad: true },
  university: { range: 19, rangeSquared: 361, type: 'education' as const, requiresRoad: true },
  power_plant: { range: 15, rangeSquared: 225, requiresRoad: false },
  water_tower: { range: 12, rangeSquared: 144, requiresRoad: false },
} as const;

export function createBuilding(type: BuildingType): Building {
  const constructionProgress = NO_CONSTRUCTION_TYPES.includes(type) ? 100 : 0;

  return {
    type,
    level: type === 'grass' || type === 'empty' || type === 'water' ? 0 : 1,
    population: 0,
    jobs: 0,
    powered: false,
    watered: false,
    onFire: false,
    fireProgress: 0,
    age: 0,
    constructionProgress,
    abandoned: false,
  };
}

export function createTile(x: number, y: number, buildingType: BuildingType = 'grass'): Tile {
  return {
    x,
    y,
    zone: 'none',
    building: createBuilding(buildingType),
    landValue: 50,
    pollution: 0,
    crime: 0,
    traffic: 0,
    hasSubway: false,
  };
}

export function createInitialBudget(): Budget {
  return {
    police: { name: 'Police', funding: 100, cost: 0 },
    fire: { name: 'Fire', funding: 100, cost: 0 },
    health: { name: 'Health', funding: 100, cost: 0 },
    education: { name: 'Education', funding: 100, cost: 0 },
    transportation: { name: 'Transportation', funding: 100, cost: 0 },
    parks: { name: 'Parks', funding: 100, cost: 0 },
    power: { name: 'Power', funding: 100, cost: 0 },
    water: { name: 'Water', funding: 100, cost: 0 },
  };
}

export function createInitialStats(): Stats {
  return {
    population: 0,
    jobs: 0,
    money: 100000,
    income: 0,
    expenses: 0,
    happiness: 50,
    health: 50,
    education: 50,
    safety: 50,
    environment: 75,
    demand: {
      residential: 50,
      commercial: 30,
      industrial: 40,
    },
  };
}

export function createServiceCoverage(size: number): ServiceCoverage {
  const createGrid = () => {
    const grid: number[][] = new Array(size);
    for (let y = 0; y < size; y++) {
      grid[y] = new Array(size).fill(0);
    }
    return grid;
  };

  const createBoolGrid = () => {
    const grid: boolean[][] = new Array(size);
    for (let y = 0; y < size; y++) {
      grid[y] = new Array(size).fill(false);
    }
    return grid;
  };

  return {
    police: createGrid(),
    fire: createGrid(),
    health: createGrid(),
    education: createGrid(),
    power: createBoolGrid(),
    water: createBoolGrid(),
  };
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
