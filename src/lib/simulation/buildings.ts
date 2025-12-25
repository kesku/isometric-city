import {
  Tile,
  Building,
  BuildingType,
  ZoneType,
  ServiceCoverage,
  BUILDING_STATS,
  RESIDENTIAL_BUILDINGS,
  COMMERCIAL_BUILDINGS,
  INDUSTRIAL_BUILDINGS,
} from '@/types/game';
import { SERVICE_CONFIG } from './core';
import { hasRequiredRoadAccess } from './services';
import { createBuilding } from './core';

// Building sizes for multi-tile structures
const BUILDING_SIZES: Partial<Record<BuildingType, { width: number; height: number }>> = {
  power_plant: { width: 2, height: 2 },
  hospital: { width: 2, height: 2 },
  school: { width: 2, height: 2 },
  stadium: { width: 3, height: 3 },
  museum: { width: 3, height: 3 },
  university: { width: 3, height: 3 },
  airport: { width: 4, height: 4 },
  space_program: { width: 3, height: 3 },
  park_large: { width: 3, height: 3 },
  mansion: { width: 2, height: 2 },
  apartment_low: { width: 2, height: 2 },
  apartment_high: { width: 2, height: 2 },
  office_low: { width: 2, height: 2 },
  office_high: { width: 2, height: 2 },
  mall: { width: 3, height: 3 },
  factory_medium: { width: 2, height: 2 },
  factory_large: { width: 3, height: 3 },
  warehouse: { width: 2, height: 2 },
  city_hall: { width: 2, height: 2 },
  amusement_park: { width: 4, height: 4 },
  playground_large: { width: 2, height: 2 },
  baseball_field_small: { width: 2, height: 2 },
  football_field: { width: 2, height: 2 },
  baseball_stadium: { width: 3, height: 3 },
  mini_golf_course: { width: 2, height: 2 },
  go_kart_track: { width: 2, height: 2 },
  amphitheater: { width: 2, height: 2 },
  greenhouse_garden: { width: 2, height: 2 },
  marina_docks_small: { width: 2, height: 2 },
  roller_coaster_small: { width: 2, height: 2 },
  mountain_lodge: { width: 2, height: 2 },
  mountain_trailhead: { width: 3, height: 3 },
  rail_station: { width: 2, height: 2 },
};

// Tiles that can be consolidated into larger ones
const MERGEABLE_TILE_TYPES = new Set<BuildingType>(['grass', 'tree']);

// Buildings that can be consolidated when demand is high
const CONSOLIDATABLE_BUILDINGS: Record<ZoneType, Set<BuildingType>> = {
  residential: new Set(['house_small', 'house_medium']),
  commercial: new Set(['shop_small', 'shop_medium']),
  industrial: new Set(['factory_small']),
  none: new Set(),
};

// Types that require water adjacency
const WATERFRONT_BUILDINGS: BuildingType[] = ['marina_docks_small', 'pier_large'];

export function getBuildingSize(buildingType: BuildingType): { width: number; height: number } {
  return BUILDING_SIZES[buildingType] || { width: 1, height: 1 };
}

// Construction speed progress per tick
export function getConstructionSpeed(buildingType: BuildingType): number {
  const size = getBuildingSize(buildingType);
  const area = size.width * size.height;
  const baseSpeed = 24 + Math.random() * 12;
  return baseSpeed / Math.sqrt(area) / 1.3;
}

// Check if a multi-tile building can be placed
export function canPlaceMultiTileBuilding(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  gridSize: number
): boolean {
  if (x + width > gridSize || y + height > gridSize) return false;

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = grid[y + dy]?.[x + dx];
      if (!tile || (tile.building.type !== 'grass' && tile.building.type !== 'tree')) {
        return false;
      }
    }
  }
  return true;
}

// Stricter check for spawning multi-tile buildings
export function canSpawnMultiTileBuilding(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  zone: ZoneType,
  gridSize: number
): boolean {
  if (x + width > gridSize || y + height > gridSize) return false;

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = grid[y + dy]?.[x + dx];
      if (
        !tile ||
        tile.zone !== zone ||
        (tile.building.type !== 'grass' && tile.building.type !== 'tree')
      ) {
        return false;
      }
    }
  }
  return true;
}

// Find the origin tile of a multi-tile building
export function findBuildingOrigin(
  grid: Tile[][],
  x: number,
  y: number,
  gridSize: number
): { originX: number; originY: number; buildingType: BuildingType } | null {
  const tile = grid[y][x];
  if (tile.building.type !== 'empty') {
    const size = getBuildingSize(tile.building.type);
    if (size.width > 1 || size.height > 1) {
      return { originX: x, originY: y, buildingType: tile.building.type };
    }
    return null;
  }

  // Look up and left for the origin tile
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ox = x - dx;
      const oy = y - dy;
      if (ox >= 0 && oy >= 0) {
        const originTile = grid[oy][ox];
        if (originTile.building.type !== 'empty' && originTile.building.type !== 'grass') {
          const size = getBuildingSize(originTile.building.type);
          if (x >= ox && x < ox + size.width && y >= oy && y < oy + size.height) {
            return { originX: ox, originY: oy, buildingType: originTile.building.type };
          }
        }
      }
    }
  }
  return null;
}

// Apply a building footprint to the grid
export function applyBuildingFootprint(
  grid: Tile[][],
  originX: number,
  originY: number,
  buildingType: BuildingType,
  zone: ZoneType,
  level: number,
  services?: ServiceCoverage
): Building {
  const size = getBuildingSize(buildingType);
  const stats = BUILDING_STATS[buildingType] || { pollution: 0 };

  for (let dy = 0; dy < size.height; dy++) {
    for (let dx = 0; dx < size.width; dx++) {
      const cell = grid[originY + dy][originX + dx];
      if (dx === 0 && dy === 0) {
        cell.building = createBuilding(buildingType);
        cell.building.level = level;
        if (services) {
          cell.building.powered = services.power[originY + dy][originX + dx];
          cell.building.watered = services.water[originY + dy][originX + dx];
        }
      } else {
        cell.building = createBuilding('empty');
        cell.building.level = 0;
      }
      cell.zone = zone;
      cell.pollution = dx === 0 && dy === 0 ? stats.pollution : 0;
    }
  }
  return grid[originY][originX].building;
}

// Check if building type requires water adjacency
export function requiresWaterAdjacency(buildingType: BuildingType): boolean {
  return WATERFRONT_BUILDINGS.includes(buildingType);
}

// Check for water adjacency and sprite flip
export function getWaterAdjacency(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  gridSize: number
): { hasWater: boolean; shouldFlip: boolean } {
  let waterOnSouthOrEast = false;
  let waterOnNorthOrWest = false;

  for (let dx = 0; dx < width; dx++) {
    const cy = y + height;
    if (cy < gridSize && grid[cy]?.[x + dx]?.building.type === 'water') {
      waterOnSouthOrEast = true;
      break;
    }
  }

  if (!waterOnSouthOrEast) {
    for (let dy = 0; dy < height; dy++) {
      const cx = x + width;
      if (cx < gridSize && grid[y + dy]?.[cx]?.building.type === 'water') {
        waterOnSouthOrEast = true;
        break;
      }
    }
  }

  for (let dx = 0; dx < width; dx++) {
    const cy = y - 1;
    if (cy >= 0 && grid[cy]?.[x + dx]?.building.type === 'water') {
      waterOnNorthOrWest = true;
      break;
    }
  }

  if (!waterOnNorthOrWest) {
    for (let dy = 0; dy < height; dy++) {
      const cx = x - 1;
      if (cx >= 0 && grid[y + dy]?.[cx]?.building.type === 'water') {
        waterOnNorthOrWest = true;
        break;
      }
    }
  }

  const hasWater = waterOnSouthOrEast || waterOnNorthOrWest;
  const shouldFlip = hasWater && waterOnNorthOrWest && !waterOnSouthOrEast;
  return { hasWater, shouldFlip };
}

// Check for road adjacency and sprite flip
export function getRoadAdjacency(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  gridSize: number
): { hasRoad: boolean; shouldFlip: boolean } {
  let roadOnSouthOrEast = false;
  let roadOnNorthOrWest = false;

  for (let dx = 0; dx < width; dx++) {
    const cy = y + height;
    if (cy < gridSize && grid[cy]?.[x + dx]?.building.type === 'road') {
      roadOnSouthOrEast = true;
      break;
    }
  }

  if (!roadOnSouthOrEast) {
    for (let dy = 0; dy < height; dy++) {
      const cx = x + width;
      if (cx < gridSize && grid[y + dy]?.[cx]?.building.type === 'road') {
        roadOnSouthOrEast = true;
        break;
      }
    }
  }

  for (let dx = 0; dx < width; dx++) {
    const cy = y - 1;
    if (cy >= 0 && grid[cy]?.[x + dx]?.building.type === 'road') {
      roadOnNorthOrWest = true;
      break;
    }
  }

  if (!roadOnNorthOrWest) {
    for (let dy = 0; dy < height; dy++) {
      const cx = x - 1;
      if (cx >= 0 && grid[y + dy]?.[cx]?.building.type === 'road') {
        roadOnNorthOrWest = true;
        break;
      }
    }
  }

  const hasRoad = roadOnSouthOrEast || roadOnNorthOrWest;
  const shouldFlip = hasRoad && roadOnNorthOrWest && !roadOnSouthOrEast;
  return { hasRoad, shouldFlip };
}

// Check if a tile is a "starter" building
export function isStarterBuilding(x: number, y: number, buildingType: string): boolean {
  if (buildingType === 'house_small' || buildingType === 'shop_small') return true;
  if (buildingType === 'factory_small') return true;
  return false;
}

// BFS arrays for road access
const roadAccessQueue = new Int16Array(3 * 256);
const roadAccessVisited = new Uint8Array(128 * 128);

// Check if a tile has road access
export function hasRoadAccess(
  grid: Tile[][],
  x: number,
  y: number,
  size: number,
  maxDistance: number = 8
): boolean {
  const startZone = grid[y][x].zone;
  if (startZone === 'none') return false;

  const minX = Math.max(0, x - maxDistance);
  const maxX = Math.min(size - 1, x + maxDistance);
  const minY = Math.max(0, y - maxDistance);
  const maxY = Math.min(size - 1, y + maxDistance);

  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      roadAccessVisited[cy * size + cx] = 0;
    }
  }

  let head = 0;
  let tail = 3;
  roadAccessQueue[0] = x;
  roadAccessQueue[1] = y;
  roadAccessQueue[2] = 0;
  roadAccessVisited[y * size + x] = 1;

  while (head < tail) {
    const cx = roadAccessQueue[head];
    const cy = roadAccessQueue[head + 1];
    const dist = roadAccessQueue[head + 2];
    head += 3;

    if (dist >= maxDistance) continue;

    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;

      const idx = ny * size + nx;
      if (roadAccessVisited[idx]) continue;
      roadAccessVisited[idx] = 1;

      const neighbor = grid[ny][nx];
      if (neighbor.building.type === 'road') return true;

      if (
        neighbor.zone === startZone &&
        neighbor.building.type !== 'water' &&
        tail < roadAccessQueue.length - 3
      ) {
        roadAccessQueue[tail] = nx;
        roadAccessQueue[tail + 1] = ny;
        roadAccessQueue[tail + 2] = dist + 1;
        tail += 3;
      }
    }
  }
  return false;
}

// Check if a tile is mergeable
export function isMergeableZoneTile(
  tile: Tile,
  zone: ZoneType,
  excludeTile?: { x: number; y: number },
  allowBuildingConsolidation?: boolean
): boolean {
  if (excludeTile && tile.x === excludeTile.x && tile.y === excludeTile.y) {
    return (
      tile.zone === zone &&
      !tile.building.onFire &&
      tile.building.type !== 'water' &&
      tile.building.type !== 'road'
    );
  }

  if (
    tile.zone !== zone ||
    tile.building.onFire ||
    tile.building.type === 'water' ||
    tile.building.type === 'road'
  ) {
    return false;
  }

  if (MERGEABLE_TILE_TYPES.has(tile.building.type)) return true;
  if (allowBuildingConsolidation && CONSOLIDATABLE_BUILDINGS[zone]?.has(tile.building.type))
    return true;

  return false;
}

// Check if a footprint is available
export function footprintAvailable(
  grid: Tile[][],
  originX: number,
  originY: number,
  width: number,
  height: number,
  zone: ZoneType,
  gridSize: number,
  excludeTile?: { x: number; y: number },
  allowBuildingConsolidation?: boolean
): boolean {
  if (originX < 0 || originY < 0 || originX + width > gridSize || originY + height > gridSize)
    return false;

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (
        !isMergeableZoneTile(
          grid[originY + dy][originX + dx],
          zone,
          excludeTile,
          allowBuildingConsolidation
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

// Score a footprint based on road access and size
export function scoreFootprint(
  grid: Tile[][],
  originX: number,
  originY: number,
  width: number,
  height: number,
  gridSize: number
): number {
  let roadScore = 0;
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      for (const [ox, oy] of offsets) {
        const nx = originX + dx + ox;
        const ny = originY + dy + oy;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx < gridSize &&
          ny < gridSize &&
          grid[ny][nx].building.type === 'road'
        ) {
          roadScore++;
        }
      }
    }
  }
  return roadScore - width * height * 0.25;
}

// Find a footprint including a specific tile
export function findFootprintIncludingTile(
  grid: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  zone: ZoneType,
  gridSize: number,
  allowBuildingConsolidation?: boolean
): { originX: number; originY: number } | null {
  const candidates: { originX: number; originY: number; score: number }[] = [];
  const excludeTile = { x, y };

  for (let oy = y - (height - 1); oy <= y; oy++) {
    for (let ox = x - (width - 1); ox <= x; ox++) {
      if (
        !footprintAvailable(
          grid,
          ox,
          oy,
          width,
          height,
          zone,
          gridSize,
          excludeTile,
          allowBuildingConsolidation
        )
      )
        continue;
      if (x < ox || x >= ox + width || y < oy || y >= oy + height) continue;

      candidates.push({
        originX: ox,
        originY: oy,
        score: scoreFootprint(grid, ox, oy, width, height, gridSize),
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { originX: candidates[0].originX, originY: candidates[0].originY };
}

// Evolve a building
export function evolveBuilding(
  grid: Tile[][],
  x: number,
  y: number,
  services: ServiceCoverage,
  demand?: { residential: number; commercial: number; industrial: number }
): Building {
  const tile = grid[y][x];
  const building = tile.building;
  const zone = tile.zone;

  if (zone === 'none' || ['grass', 'water', 'road'].includes(building.type)) return building;

  if (building.type === 'empty') {
    building.powered = services.power[y][x];
    building.watered = services.water[y][x];
    building.population = 0;
    building.jobs = 0;
    return building;
  }

  building.powered = services.power[y][x];
  building.watered = services.water[y][x];

  if (!isStarterBuilding(x, y, building.type) && (!building.powered || !building.watered))
    return building;

  if (building.constructionProgress !== undefined && building.constructionProgress < 100) {
    building.constructionProgress = Math.min(
      100,
      building.constructionProgress + getConstructionSpeed(building.type)
    );
    building.population = 0;
    building.jobs = 0;
    return building;
  }

  const zoneDemand = demand
    ? zone === 'residential'
      ? demand.residential
      : zone === 'commercial'
        ? demand.commercial
        : demand.industrial
    : 0;

  if (building.abandoned) {
    if (zoneDemand > 10 && Math.random() < Math.min(0.12, (zoneDemand - 10) / 600)) {
      const size = getBuildingSize(building.type);
      if (size.width > 1 || size.height > 1) {
        for (let dy = 0; dy < size.height; dy++) {
          for (let dx = 0; dx < size.width; dx++) {
            const clearTile = grid[y + dy]?.[x + dx];
            if (clearTile) {
              clearTile.building = createBuilding('grass');
              clearTile.building.powered = services.power[y + dy]?.[x + dx] ?? false;
              clearTile.building.watered = services.water[y + dy]?.[x + dx] ?? false;
            }
          }
        }
      }
      const cleared = createBuilding('grass');
      cleared.powered = building.powered;
      cleared.watered = building.watered;
      return cleared;
    }
    building.population = 0;
    building.jobs = 0;
    building.age = (building.age || 0) + 0.1;
    return building;
  }

  if (zoneDemand < -20 && building.age > 30) {
    const prob =
      Math.min(0.02, Math.abs(zoneDemand + 20) / 4000) +
      (isStarterBuilding(x, y, building.type) ? 0 : 0.01) +
      (building.level <= 2 ? 0.003 : 0);
    if (Math.random() < prob) {
      building.abandoned = true;
      building.population = 0;
      building.jobs = 0;
      return building;
    }
  }

  building.age = (building.age || 0) + 1;

  const buildingList =
    zone === 'residential'
      ? RESIDENTIAL_BUILDINGS
      : zone === 'commercial'
        ? COMMERCIAL_BUILDINGS
        : INDUSTRIAL_BUILDINGS;
  const coverage =
    (services.police[y][x] +
      services.fire[y][x] +
      services.health[y][x] +
      services.education[y][x]) /
    4;
  const demandBoost = Math.max(0, (zoneDemand - 30) / 70) * 0.7;
  const targetLevel = Math.min(
    5,
    Math.max(1, Math.floor(tile.landValue / 24 + coverage / 28 + building.age / 60 + demandBoost))
  );
  const targetType = buildingList[Math.min(buildingList.length - 1, targetLevel - 1)];

  let anchorX = x;
  let anchorY = y;
  let consolidationChance = 0.08;
  let allowConsolidation = false;

  if (zoneDemand > 30) {
    const isSmall =
      (zone === 'residential' && ['house_small', 'house_medium'].includes(building.type)) ||
      (zone === 'commercial' && ['shop_small', 'shop_medium'].includes(building.type)) ||
      (zone === 'industrial' && building.type === 'factory_small');
    if (isSmall) {
      consolidationChance += Math.min(0.25, (zoneDemand - 30) / 300);
      if (zoneDemand > 70) {
        consolidationChance += 0.05;
        allowConsolidation = true;
      }
    }
  }

  if (
    building.powered &&
    building.watered &&
    building.age > 12 &&
    (targetLevel > building.level || targetType !== building.type) &&
    Math.random() < consolidationChance
  ) {
    const size = getBuildingSize(targetType);
    const footprint = findFootprintIncludingTile(
      grid,
      x,
      y,
      size.width,
      size.height,
      zone,
      grid.length,
      allowConsolidation
    );
    if (footprint) {
      const anchor = applyBuildingFootprint(
        grid,
        footprint.originX,
        footprint.originY,
        targetType,
        zone,
        targetLevel,
        services
      );
      anchor.level = targetLevel;
      anchorX = footprint.originX;
      anchorY = footprint.originY;
    } else if (targetLevel > building.level) {
      building.level = Math.min(targetLevel, building.level + 1);
    }
  }

  const anchorTile = grid[anchorY][anchorX];
  const anchorBuilding = anchorTile.building;
  anchorBuilding.powered = services.power[anchorY][anchorX];
  anchorBuilding.watered = services.water[anchorY][anchorX];
  anchorBuilding.level = Math.max(
    anchorBuilding.level,
    Math.min(targetLevel, anchorBuilding.level + 1)
  );

  const stats = BUILDING_STATS[anchorBuilding.type];
  const efficiency = (anchorBuilding.powered ? 0.5 : 0) + (anchorBuilding.watered ? 0.5 : 0);
  anchorBuilding.population =
    stats?.maxPop > 0
      ? Math.floor(stats.maxPop * Math.max(1, anchorBuilding.level) * efficiency * 0.8)
      : 0;
  anchorBuilding.jobs =
    stats?.maxJobs > 0
      ? Math.floor(stats.maxJobs * Math.max(1, anchorBuilding.level) * efficiency * 0.8)
      : 0;

  return grid[y][x].building;
}
