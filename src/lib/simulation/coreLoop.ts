import { GameState, Tile, BUILDING_STATS } from '@/types/game';
import { NO_CONSTRUCTION_TYPES, createBuilding } from './core';
import { calculateServiceCoverage } from './services';
import {
  getConstructionSpeed,
  findBuildingOrigin,
  hasRoadAccess,
  isStarterBuilding,
  canSpawnMultiTileBuilding,
  applyBuildingFootprint,
  evolveBuilding,
} from './buildings';
import { updateBudgetCosts, calculateStats, generateAdvisorMessages } from './economy';

export function simulateTick(state: GameState): GameState {
  const size = state.gridSize;
  const services = calculateServiceCoverage(state.grid, size);
  const modifiedRows = new Set<number>();
  const newGrid: Tile[][] = new Array(size);

  for (let y = 0; y < size; y++) newGrid[y] = state.grid[y];

  const getModifiableTile = (x: number, y: number): Tile => {
    if (!modifiedRows.has(y)) {
      newGrid[y] = state.grid[y].map((t) => ({ ...t, building: { ...t.building } }));
      modifiedRows.add(y);
    }
    return newGrid[y][x];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const originalTile = state.grid[y][x];
      const originalBuilding = originalTile.building;

      if (originalBuilding.type === 'water') continue;

      const newPowered = services.power[y][x];
      const newWatered = services.water[y][x];
      const needsUpdate =
        originalBuilding.powered !== newPowered || originalBuilding.watered !== newWatered;

      if (originalBuilding.type === 'road' && !needsUpdate) continue;

      if (
        originalTile.zone === 'none' &&
        (originalBuilding.type === 'grass' || originalBuilding.type === 'tree') &&
        !needsUpdate &&
        originalTile.pollution < 0.01 &&
        (BUILDING_STATS[originalBuilding.type]?.pollution || 0) === 0
      ) {
        continue;
      }

      const isCompleted =
        originalTile.zone === 'none' &&
        originalBuilding.constructionProgress === 100 &&
        !originalBuilding.onFire &&
        !['grass', 'tree', 'empty'].includes(originalBuilding.type);
      if (isCompleted && !needsUpdate && originalTile.pollution < 0.01) continue;

      const tile = getModifiableTile(x, y);
      tile.building.powered = newPowered;
      tile.building.watered = newWatered;

      if (
        tile.zone === 'none' &&
        tile.building.constructionProgress !== undefined &&
        tile.building.constructionProgress < 100 &&
        !NO_CONSTRUCTION_TYPES.includes(tile.building.type)
      ) {
        const isUtility =
          tile.building.type === 'power_plant' || tile.building.type === 'water_tower';
        if (isUtility || (tile.building.powered && tile.building.watered)) {
          tile.building.constructionProgress = Math.min(
            100,
            tile.building.constructionProgress + getConstructionSpeed(tile.building.type)
          );
        }
      }

      if (tile.building.type === 'empty' && !findBuildingOrigin(newGrid, x, y, size)) {
        tile.building = createBuilding('grass');
        tile.building.powered = newPowered;
        tile.building.watered = newWatered;
      }

      if (tile.zone !== 'none' && tile.building.type === 'grass') {
        const demand = state.stats.demand
          ? tile.zone === 'residential'
            ? state.stats.demand.residential
            : tile.zone === 'commercial'
              ? state.stats.demand.commercial
              : state.stats.demand.industrial
          : 0;
        const spawnChance = 0.05 * Math.max(0, Math.min(1, (demand + 30) / 80));

        if (
          hasRoadAccess(newGrid, x, y, size) &&
          newPowered &&
          newWatered &&
          Math.random() < spawnChance
        ) {
          // Simplified candidate selection for core loop
          const candidate =
            tile.zone === 'residential'
              ? 'house_small'
              : tile.zone === 'commercial'
                ? 'shop_small'
                : 'factory_small';
          const s = { width: 1, height: 1 }; // Default size for starters
          if (canSpawnMultiTileBuilding(newGrid, x, y, s.width, s.height, tile.zone, size)) {
            applyBuildingFootprint(newGrid, x, y, candidate, tile.zone, 1, services);
          }
        }
      } else if (tile.zone !== 'none' && tile.building.type !== 'grass') {
        newGrid[y][x].building = evolveBuilding(newGrid, x, y, services, state.stats.demand);
      }

      const bStats = BUILDING_STATS[tile.building.type];
      tile.pollution = Math.max(0, tile.pollution * 0.95 + (bStats?.pollution || 0));

      if (state.disastersEnabled && tile.building.onFire) {
        if (Math.random() < services.fire[y][x] / 300) {
          tile.building.onFire = false;
          tile.building.fireProgress = 0;
        } else {
          tile.building.fireProgress += 2 / 3;
          if (tile.building.fireProgress >= 100) {
            tile.building = createBuilding('grass');
            tile.zone = 'none';
          }
        }
      }

      if (
        state.disastersEnabled &&
        !tile.building.onFire &&
        !['grass', 'water', 'road', 'tree', 'empty'].includes(tile.building.type) &&
        Math.random() < 0.00003
      ) {
        tile.building.onFire = true;
        tile.building.fireProgress = 0;
      }
    }
  }

  const newBudget = updateBudgetCosts(newGrid, state.budget);
  const newEffectiveTaxRate =
    state.effectiveTaxRate + (state.taxRate - state.effectiveTaxRate) * 0.03;
  const newStats = calculateStats(
    newGrid,
    size,
    newBudget,
    state.taxRate,
    newEffectiveTaxRate,
    services
  );
  newStats.money = state.stats.money;

  let { year: newYear, month: newMonth, day: newDay, tick: newTick } = state;
  newTick++;

  const totalTicks =
    (newYear - 2024) * 12 * 30 * 30 + (newMonth - 1) * 30 * 30 + (newDay - 1) * 30 + newTick;
  const newHour = Math.floor(((totalTicks % 450) / 450) * 24);

  if (newTick >= 30) {
    newTick = 0;
    newDay++;
    if (newDay % 7 === 0) newStats.money += Math.floor((newStats.income - newStats.expenses) / 4);
  }

  if (newDay > 30) {
    newDay = 1;
    newMonth++;
  }

  if (newMonth > 12) {
    newMonth = 1;
    newYear++;
  }

  const history = [...state.history];
  if (newMonth % 3 === 0 && newDay === 1 && newTick === 0) {
    history.push({
      year: newYear,
      month: newMonth,
      population: newStats.population,
      money: newStats.money,
      happiness: newStats.happiness,
    });
    if (history.length > 100) history.shift();
  }

  return {
    ...state,
    grid: newGrid,
    year: newYear,
    month: newMonth,
    day: newDay,
    hour: newHour,
    tick: newTick,
    effectiveTaxRate: newEffectiveTaxRate,
    stats: newStats,
    budget: newBudget,
    services,
    advisorMessages: generateAdvisorMessages(newStats, services, newGrid),
    history,
  };
}
