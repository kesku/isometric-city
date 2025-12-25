import { GameState, BuildingType, ZoneType, Building, BUILDING_STATS } from '@/types/game';
import {
  getBuildingSize,
  requiresWaterAdjacency,
  getWaterAdjacency,
  canPlaceMultiTileBuilding,
  applyBuildingFootprint,
  findBuildingOrigin,
  hasRoadAccess,
  isStarterBuilding,
  canSpawnMultiTileBuilding,
} from './buildings';
import { createBuilding, DEFAULT_GRID_SIZE } from './core';
import { createInitialGameState } from './initialState';
import { calculateServiceCoverage } from './services';

// Place a building or zone
export function placeBuilding(
  state: GameState,
  x: number,
  y: number,
  buildingType: BuildingType | null,
  zone: ZoneType | null
): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || tile.building.type === 'water') return state;

  if (buildingType === 'road') {
    if (!['grass', 'tree', 'road', 'rail'].includes(tile.building.type)) return state;
  }

  if (buildingType === 'rail') {
    if (!['grass', 'tree', 'rail', 'road'].includes(tile.building.type)) return state;
  }

  if (
    buildingType &&
    !['road', 'rail'].includes(buildingType) &&
    ['road', 'rail'].includes(tile.building.type)
  ) {
    return state;
  }

  const newGrid = state.grid.map((row) => row.map((t) => ({ ...t, building: { ...t.building } })));

  if (zone !== null) {
    if (zone === 'none') {
      const origin = findBuildingOrigin(newGrid, x, y, state.gridSize);
      if (origin) {
        const size = getBuildingSize(origin.buildingType);
        for (let dy = 0; dy < size.height; dy++) {
          for (let dx = 0; dx < size.width; dx++) {
            const cx = origin.originX + dx;
            const cy = origin.originY + dy;
            if (cx < state.gridSize && cy < state.gridSize) {
              newGrid[cy][cx].building = createBuilding('grass');
              newGrid[cy][cx].zone = 'none';
            }
          }
        }
      } else {
        if (tile.zone === 'none') return state;
        newGrid[y][x].zone = 'none';
        newGrid[y][x].building = createBuilding('grass');
      }
    } else {
      if (!['grass', 'tree', 'road'].includes(tile.building.type)) return state;
      newGrid[y][x].zone = zone;
    }
  } else if (buildingType) {
    const size = getBuildingSize(buildingType);
    let shouldFlip = false;

    if (requiresWaterAdjacency(buildingType)) {
      const check = getWaterAdjacency(newGrid, x, y, size.width, size.height, state.gridSize);
      if (!check.hasWater) return state;
      shouldFlip = check.shouldFlip;
    }

    if (size.width > 1 || size.height > 1) {
      if (!canPlaceMultiTileBuilding(newGrid, x, y, size.width, size.height, state.gridSize))
        return state;
      applyBuildingFootprint(newGrid, x, y, buildingType, 'none', 1);
      if (shouldFlip) newGrid[y][x].building.flipped = true;
    } else {
      if (!['grass', 'tree', 'road', 'rail'].includes(tile.building.type)) return state;

      if (buildingType === 'rail' && tile.building.type === 'road') {
        newGrid[y][x].hasRailOverlay = true;
      } else if (buildingType === 'road' && tile.building.type === 'rail') {
        newGrid[y][x].building = createBuilding('road');
        newGrid[y][x].hasRailOverlay = true;
        newGrid[y][x].zone = 'none';
      } else {
        newGrid[y][x].building = createBuilding(buildingType);
        newGrid[y][x].zone = 'none';
        if (buildingType !== 'road') newGrid[y][x].hasRailOverlay = false;
      }
      if (shouldFlip) newGrid[y][x].building.flipped = true;
    }
  }

  return { ...state, grid: newGrid };
}

// Bulldoze a tile
export function bulldozeTile(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || tile.building.type === 'water') return state;

  const newGrid = state.grid.map((row) => row.map((t) => ({ ...t, building: { ...t.building } })));
  const origin = findBuildingOrigin(newGrid, x, y, state.gridSize);

  if (origin) {
    const size = getBuildingSize(origin.buildingType);
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const cx = origin.originX + dx;
        const cy = origin.originY + dy;
        if (cx < state.gridSize && cy < state.gridSize) {
          newGrid[cy][cx].building = createBuilding('grass');
          newGrid[cy][cx].zone = 'none';
          newGrid[cy][cx].hasRailOverlay = false;
        }
      }
    }
  } else {
    newGrid[y][x].building = createBuilding('grass');
    newGrid[y][x].zone = 'none';
    newGrid[y][x].hasRailOverlay = false;
  }

  return { ...state, grid: newGrid };
}

// Place subway
export function placeSubway(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || tile.building.type === 'water' || tile.hasSubway) return state;

  const newGrid = state.grid.map((row) => row.map((t) => ({ ...t, building: { ...t.building } })));
  newGrid[y][x].hasSubway = true;
  return { ...state, grid: newGrid };
}

// Remove subway
export function removeSubway(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || !tile.hasSubway) return state;

  const newGrid = state.grid.map((row) => row.map((t) => ({ ...t, building: { ...t.building } })));
  newGrid[y][x].hasSubway = false;
  return { ...state, grid: newGrid };
}

// Generate random advanced city
export function generateRandomAdvancedCity(
  size: number = DEFAULT_GRID_SIZE,
  cityName: string = 'Metropolis'
): GameState {
  const base = createInitialGameState(size, cityName);
  const grid = base.grid;

  const isClear = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const t = grid[y + dy]?.[x + dx];
        if (!t || t.building.type === 'water') return false;
      }
    }
    return true;
  };

  const placeRoad = (x: number, y: number) => {
    const t = grid[y]?.[x];
    if (t && t.building.type !== 'water') {
      t.building = {
        type: 'road',
        level: 0,
        population: 0,
        jobs: 0,
        powered: true,
        watered: true,
        onFire: false,
        fireProgress: 0,
        age: 100,
        constructionProgress: 100,
        abandoned: false,
      };
      t.zone = 'none';
    }
  };

  const placeMulti = (x: number, y: number, type: BuildingType, zone: ZoneType = 'none') => {
    const s = getBuildingSize(type);
    if (!isClear(x, y, s.width, s.height) || x + s.width > size || y + s.height > size)
      return false;

    for (let dy = 0; dy < s.height; dy++) {
      for (let dx = 0; dx < s.width; dx++) {
        const t = grid[y + dy][x + dx];
        t.zone = zone;
        if (dx === 0 && dy === 0) {
          t.building = {
            type,
            level: Math.floor(Math.random() * 3) + 3,
            population: 0,
            jobs: 0,
            powered: true,
            watered: true,
            onFire: false,
            fireProgress: 0,
            age: 100,
            constructionProgress: 100,
            abandoned: false,
          };
          const st = BUILDING_STATS[type];
          if (st) {
            t.building.population = Math.floor(st.maxPop * t.building.level * 0.8);
            t.building.jobs = Math.floor(st.maxJobs * t.building.level * 0.8);
          }
        } else {
          t.building = {
            type: 'empty',
            level: 0,
            population: 0,
            jobs: 0,
            powered: true,
            watered: true,
            onFire: false,
            fireProgress: 0,
            age: 100,
            constructionProgress: 100,
            abandoned: false,
          };
        }
      }
    }
    return true;
  };

  const centerX = Math.floor(size / 2);
  const centerY = Math.floor(size / 2);
  const cityRadius = Math.floor(size * 0.35);
  const roadSpacing = 6 + Math.floor(Math.random() * 3);

  for (let ry = centerY - cityRadius; ry <= centerY + cityRadius; ry += roadSpacing) {
    if (ry < 2 || ry >= size - 2) continue;
    for (
      let x = Math.max(2, centerX - cityRadius);
      x <= Math.min(size - 3, centerX + cityRadius);
      x++
    )
      placeRoad(x, ry);
  }

  for (let rx = centerX - cityRadius; rx <= centerX + cityRadius; rx += roadSpacing) {
    if (rx < 2 || rx >= size - 2) continue;
    for (
      let y = Math.max(2, centerY - cityRadius);
      y <= Math.min(size - 3, centerY + cityRadius);
      y++
    )
      placeRoad(rx, y);
  }

  const services: Array<{ type: BuildingType; count: number }> = [
    { type: 'power_plant', count: 4 },
    { type: 'water_tower', count: 8 },
    { type: 'police_station', count: 6 },
    { type: 'fire_station', count: 6 },
    { type: 'hospital', count: 3 },
    { type: 'school', count: 5 },
    { type: 'university', count: 2 },
  ];

  for (const s of services) {
    let placed = 0;
    let attempts = 0;
    while (placed < s.count && attempts < 500) {
      if (
        placeMulti(
          centerX - cityRadius + Math.floor(Math.random() * cityRadius * 2),
          centerY - cityRadius + Math.floor(Math.random() * cityRadius * 2),
          s.type
        )
      )
        placed++;
      attempts++;
    }
  }

  const coverage = calculateServiceCoverage(grid, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      grid[y][x].building.powered = coverage.power[y][x];
      grid[y][x].building.watered = coverage.water[y][x];
    }
  }

  return { ...base, grid, services: coverage };
}

// Development blockers
export function getDevelopmentBlockers(state: GameState, x: number, y: number) {
  const blockers: Array<{ reason: string; details: string }> = [];
  const tile = state.grid[y]?.[x];
  if (
    !tile ||
    tile.zone === 'none' ||
    (tile.building.type !== 'grass' && tile.building.type !== 'tree')
  )
    return blockers;

  if (!hasRoadAccess(state.grid, x, y, state.gridSize)) {
    blockers.push({ reason: 'No road access', details: 'Within 8 tiles of road' });
  }

  const candidate =
    tile.zone === 'residential'
      ? 'house_small'
      : tile.zone === 'commercial'
        ? 'shop_small'
        : 'factory_small';
  const isStarter = isStarterBuilding(x, y, candidate);
  if (!state.services.power[y][x] && !isStarter)
    blockers.push({ reason: 'No power', details: 'Build power plant' });
  if (!state.services.water[y][x] && !isStarter)
    blockers.push({ reason: 'No water', details: 'Build water tower' });

  return blockers;
}
