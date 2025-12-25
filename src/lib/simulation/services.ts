import { Tile, ServiceCoverage, BuildingType } from '@/types/game';
import { createServiceCoverage, SERVICE_CONFIG } from './core';

// Buildings that provide services
const SERVICE_BUILDING_TYPES = new Set([
  'police_station',
  'fire_station',
  'hospital',
  'school',
  'university',
  'power_plant',
  'water_tower',
]);

// Check if a service building has required road access
export function hasRequiredRoadAccess(
  grid: Tile[][],
  gridSize: number,
  x: number,
  y: number,
  buildingType: string
): boolean {
  const config = SERVICE_CONFIG[buildingType as keyof typeof SERVICE_CONFIG];

  if (!config || !config.requiresRoad) return true;

  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (
      nx >= 0 &&
      ny >= 0 &&
      nx < gridSize &&
      ny < gridSize &&
      grid[ny][nx].building.type === 'road'
    ) {
      return true;
    }
  }
  return false;
}

// Calculate service coverage from buildings
export function calculateServiceCoverage(grid: Tile[][], size: number): ServiceCoverage {
  const services = createServiceCoverage(size);
  const serviceBuildings: Array<{ x: number; y: number; type: BuildingType }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = grid[y][x];
      const buildingType = tile.building.type;

      if (!SERVICE_BUILDING_TYPES.has(buildingType)) continue;
      if (
        tile.building.constructionProgress !== undefined &&
        tile.building.constructionProgress < 100
      )
        continue;
      if (tile.building.abandoned) continue;

      if (!hasRequiredRoadAccess(grid, size, x, y, buildingType)) continue;

      serviceBuildings.push({ x, y, type: buildingType });
    }
  }

  for (const building of serviceBuildings) {
    const { x, y, type } = building;
    const config = SERVICE_CONFIG[type as keyof typeof SERVICE_CONFIG];
    if (!config) continue;

    const range = config.range;
    const rangeSquared = config.rangeSquared;
    const minY = Math.max(0, y - range);
    const maxY = Math.min(size - 1, y + range);
    const minX = Math.max(0, x - range);
    const maxX = Math.min(size - 1, x + range);

    if (type === 'power_plant') {
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x;
          const dy = ny - y;
          if (dx * dx + dy * dy <= rangeSquared) services.power[ny][nx] = true;
        }
      }
    } else if (type === 'water_tower') {
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x;
          const dy = ny - y;
          if (dx * dx + dy * dy <= rangeSquared) services.water[ny][nx] = true;
        }
      }
    } else {
      const serviceType = (config as { type: 'police' | 'fire' | 'health' | 'education' }).type;
      const currentCoverage = services[serviceType] as number[][];

      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x;
          const dy = ny - y;
          const distSquared = dx * dx + dy * dy;

          if (distSquared <= rangeSquared) {
            const distance = Math.sqrt(distSquared);
            const coverage = Math.max(0, (1 - distance / range) * 100);
            currentCoverage[ny][nx] = Math.min(100, currentCoverage[ny][nx] + coverage);
          }
        }
      }
    }
  }

  return services;
}
