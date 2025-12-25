import { GameState } from '@/types/game';
import { generateAdjacentCities } from './cities';
import {
  createInitialStats,
  createInitialBudget,
  createServiceCoverage,
  generateUUID,
  DEFAULT_GRID_SIZE,
  createTile,
  createBuilding,
} from './core';
import { generateTerrain } from './terrain';

export function createInitialGameState(
  size: number = DEFAULT_GRID_SIZE,
  cityName: string = 'New City'
): GameState {
  const { grid, waterBodies } = generateTerrain(size, createTile, createBuilding);
  const adjacentCities = generateAdjacentCities();

  return {
    id: generateUUID(),
    grid,
    gridSize: size,
    cityName,
    year: 2024,
    month: 1,
    day: 1,
    hour: 12,
    tick: 0,
    speed: 1,
    selectedTool: 'select',
    taxRate: 9,
    effectiveTaxRate: 9,
    stats: createInitialStats(),
    budget: createInitialBudget(),
    services: createServiceCoverage(size),
    notifications: [],
    advisorMessages: [],
    history: [],
    activePanel: 'none',
    disastersEnabled: true,
    adjacentCities,
    waterBodies,
    gameVersion: 0,
  };
}
