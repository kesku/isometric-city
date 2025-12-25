import { Tile, AdjacentCity } from '@/types/game';
import { generateCityName } from '../names';

// Generate adjacent cities
export function generateAdjacentCities(): AdjacentCity[] {
  const cities: AdjacentCity[] = [];
  const directions: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
  const usedNames = new Set<string>();

  for (const direction of directions) {
    let name: string;
    do {
      name = generateCityName();
    } while (usedNames.has(name));
    usedNames.add(name);

    cities.push({
      id: `city-${direction}`,
      name,
      direction,
      connected: false,
      discovered: false,
    });
  }
  return cities;
}

// Check for a road at the edge of the map
export function hasRoadAtEdge(
  grid: Tile[][],
  gridSize: number,
  direction: 'north' | 'south' | 'east' | 'west'
): boolean {
  switch (direction) {
    case 'north':
      for (let x = 0; x < gridSize; x++) if (grid[0][x].building.type === 'road') return true;
      return false;
    case 'south':
      for (let x = 0; x < gridSize; x++)
        if (grid[gridSize - 1][x].building.type === 'road') return true;
      return false;
    case 'east':
      for (let y = 0; y < gridSize; y++)
        if (grid[y][gridSize - 1].building.type === 'road') return true;
      return false;
    case 'west':
      for (let y = 0; y < gridSize; y++) if (grid[y][0].building.type === 'road') return true;
      return false;
  }
}

// Check for discoverable cities
export function checkForDiscoverableCities(
  grid: Tile[][],
  gridSize: number,
  adjacentCities: AdjacentCity[]
): AdjacentCity[] {
  const citiesToShow: AdjacentCity[] = [];
  for (const city of adjacentCities) {
    if (!city.connected && hasRoadAtEdge(grid, gridSize, city.direction)) {
      if (!city.discovered) citiesToShow.push(city);
    }
  }
  return citiesToShow;
}

// Get already discovered but unconnected cities
export function getConnectableCities(
  grid: Tile[][],
  gridSize: number,
  adjacentCities: AdjacentCity[]
): AdjacentCity[] {
  const connectable: AdjacentCity[] = [];
  for (const city of adjacentCities) {
    if (city.discovered && !city.connected && hasRoadAtEdge(grid, gridSize, city.direction)) {
      connectable.push(city);
    }
  }
  return connectable;
}
