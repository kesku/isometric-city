import { Tile, WaterBody, BuildingType, Building } from '@/types/game';
import { generateWaterName } from '../names';
import { createBuilding, createTile } from './core';

function noise2D(x: number, y: number, seed: number = 42): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const corners =
    (noise2D(x - 1, y - 1, seed) +
      noise2D(x + 1, y - 1, seed) +
      noise2D(x - 1, y + 1, seed) +
      noise2D(x + 1, y + 1, seed)) /
    16;
  const sides =
    (noise2D(x - 1, y, seed) +
      noise2D(x + 1, y, seed) +
      noise2D(x, y - 1, seed) +
      noise2D(x, y + 1, seed)) /
    8;
  const center = noise2D(x, y, seed) / 4;
  return corners + sides + center;
}

function interpolatedNoise(x: number, y: number, seed: number): number {
  const intX = Math.floor(x);
  const fracX = x - intX;
  const intY = Math.floor(y);
  const fracY = y - intY;

  const v1 = smoothNoise(intX, intY, seed);
  const v2 = smoothNoise(intX + 1, intY, seed);
  const v3 = smoothNoise(intX, intY + 1, seed);
  const v4 = smoothNoise(intX + 1, intY + 1, seed);

  const i1 = v1 * (1 - fracX) + v2 * fracX;
  const i2 = v3 * (1 - fracX) + v4 * fracX;

  return i1 * (1 - fracY) + i2 * fracY;
}

export function perlinNoise(x: number, y: number, seed: number, octaves: number = 4): number {
  let total = 0;
  let frequency = 0.05;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += interpolatedNoise(x * frequency, y * frequency, seed + i * 100) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / maxValue;
}

// Generate lakes
function generateLakes(
  grid: Tile[][],
  size: number,
  seed: number,
  createBuilding: (type: BuildingType) => Building
): WaterBody[] {
  // Use noise to find potential lake centers
  const lakeNoise = (x: number, y: number) => perlinNoise(x, y, seed + 1000, 3);

  // Find lake seed points
  const lakeCenters: { x: number; y: number; noise: number }[] = [];
  const minDistFromEdge = Math.max(8, Math.floor(size * 0.15));
  const minDistBetweenLakes = Math.max(size * 0.2, 10);

  // Collect all potential lake centers with adaptive threshold
  let threshold = 0.5;
  let attempts = 0;
  const maxAttempts = 3;

  while (lakeCenters.length < 2 && attempts < maxAttempts) {
    lakeCenters.length = 0;

    for (let y = minDistFromEdge; y < size - minDistFromEdge; y++) {
      for (let x = minDistFromEdge; x < size - minDistFromEdge; x++) {
        const noiseVal = lakeNoise(x, y);

        // Check if this is a good lake center
        if (noiseVal < threshold) {
          // Check distance from other lake centers
          let tooClose = false;
          for (const center of lakeCenters) {
            const dist = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
            if (dist < minDistBetweenLakes) {
              tooClose = true;
              break;
            }
          }

          if (!tooClose) {
            lakeCenters.push({ x, y, noise: noiseVal });
          }
        }
      }
    }

    if (lakeCenters.length >= 2) break;

    threshold += 0.1;
    attempts++;
  }

  // If still no centers found, force create at least 2 lakes
  if (lakeCenters.length === 0) {
    const safeZone = minDistFromEdge + 5;
    const quarterSize = Math.max(safeZone, Math.floor(size / 4));
    const threeQuarterSize = Math.min(size - safeZone, Math.floor((size * 3) / 4));
    lakeCenters.push(
      { x: quarterSize, y: quarterSize, noise: 0 },
      { x: threeQuarterSize, y: threeQuarterSize, noise: 0 }
    );
  } else if (lakeCenters.length === 1) {
    // If only one center found, add another at a safe distance
    const existing = lakeCenters[0];
    const safeZone = minDistFromEdge + 5;
    const quarterSize = Math.max(safeZone, Math.floor(size / 4));
    const threeQuarterSize = Math.min(size - safeZone, Math.floor((size * 3) / 4));
    let newX = existing.x > size / 2 ? quarterSize : threeQuarterSize;
    let newY = existing.y > size / 2 ? quarterSize : threeQuarterSize;
    lakeCenters.push({ x: newX, y: newY, noise: 0 });
  }

  // Sort by noise value (lowest first) and pick 2-3 best candidates
  lakeCenters.sort((a, b) => a.noise - b.noise);
  const numLakes = 2 + Math.floor(Math.random() * 2);
  const selectedCenters = lakeCenters.slice(0, Math.min(numLakes, lakeCenters.length));

  const waterBodies: WaterBody[] = [];
  const usedLakeNames = new Set<string>();

  // Grow lakes from each center
  for (const center of selectedCenters) {
    const targetSize = 40 + Math.floor(Math.random() * 41);
    const lakeTiles: { x: number; y: number }[] = [{ x: center.x, y: center.y }];
    const candidates: { x: number; y: number; dist: number; noise: number }[] = [];

    // Add initial neighbors as candidates
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
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (
        nx >= minDistFromEdge &&
        nx < size - minDistFromEdge &&
        ny >= minDistFromEdge &&
        ny < size - minDistFromEdge
      ) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        const noise = lakeNoise(nx, ny);
        candidates.push({ x: nx, y: ny, dist, noise });
      }
    }

    // Grow lake by adding adjacent tiles
    while (lakeTiles.length < targetSize && candidates.length > 0) {
      candidates.sort((a, b) => {
        if (Math.abs(a.dist - b.dist) < 0.5) {
          return a.noise - b.noise;
        }
        return a.dist - b.dist;
      });

      // Pick from top candidates
      const pickIndex = Math.floor(Math.random() * Math.min(5, candidates.length));
      const picked = candidates.splice(pickIndex, 1)[0];

      // Check if already in lake
      if (lakeTiles.some((t) => t.x === picked.x && t.y === picked.y)) continue;

      // Check if tile is valid (not already water from another lake)
      if (grid[picked.y][picked.x].building.type === 'water') continue;

      lakeTiles.push({ x: picked.x, y: picked.y });

      // Add new neighbors as candidates
      for (const [dx, dy] of directions) {
        const nx = picked.x + dx;
        const ny = picked.y + dy;
        if (
          nx >= minDistFromEdge &&
          nx < size - minDistFromEdge &&
          ny >= minDistFromEdge &&
          ny < size - minDistFromEdge &&
          !lakeTiles.some((t) => t.x === nx && t.y === ny) &&
          !candidates.some((c) => c.x === nx && c.y === ny)
        ) {
          const dist = Math.sqrt((nx - center.x) ** 2 + (ny - center.y) ** 2);
          const noise = lakeNoise(nx, ny);
          candidates.push({ x: nx, y: ny, dist, noise });
        }
      }
    }

    // Apply lake tiles to grid
    for (const tile of lakeTiles) {
      grid[tile.y][tile.x].building = createBuilding('water');
      grid[tile.y][tile.x].landValue = 60;
    }

    // Calculate center
    const avgX = lakeTiles.reduce((sum, t) => sum + t.x, 0) / lakeTiles.length;
    const avgY = lakeTiles.reduce((sum, t) => sum + t.y, 0) / lakeTiles.length;

    // Assign a random name to this lake
    let lakeName = generateWaterName('lake');
    while (usedLakeNames.has(lakeName)) {
      lakeName = generateWaterName('lake');
    }
    usedLakeNames.add(lakeName);

    // Add to water bodies list
    waterBodies.push({
      id: `lake-${waterBodies.length}`,
      name: lakeName,
      type: 'lake',
      tiles: lakeTiles,
      centerX: Math.round(avgX),
      centerY: Math.round(avgY),
    });
  }

  return waterBodies;
}

// Generate ocean connections on map edges (sometimes) with organic coastlines
function generateOceans(
  grid: Tile[][],
  size: number,
  seed: number,
  createBuilding: (type: BuildingType) => Building
): WaterBody[] {
  const waterBodies: WaterBody[] = [];
  const oceanChance = 0.4;

  const coastNoise = (x: number, y: number) => perlinNoise(x, y, seed + 2000, 3);

  const edges: Array<{
    side: 'north' | 'east' | 'south' | 'west';
    tiles: { x: number; y: number }[];
  }> = [];

  // Ocean parameters
  const baseDepth = Math.max(4, Math.floor(size * 0.12));
  const depthVariation = Math.max(4, Math.floor(size * 0.08));
  const maxDepth = Math.floor(size * 0.18);

  // Helper to generate ocean section along an edge
  const generateOceanEdge = (
    isHorizontal: boolean,
    edgePosition: number,
    inwardDirection: 1 | -1
  ): { x: number; y: number }[] => {
    const tiles: { x: number; y: number }[] = [];

    // Randomize the span of the ocean
    const spanStart = Math.floor(size * (0.05 + Math.random() * 0.25));
    const spanEnd = Math.floor(size * (0.7 + Math.random() * 0.25));

    for (let i = spanStart; i < spanEnd; i++) {
      const edgeFade = Math.min((i - spanStart) / 5, (spanEnd - i) / 5, 1);

      const coarseNoise = coastNoise(
        isHorizontal ? i * 0.08 : edgePosition * 0.08,
        isHorizontal ? edgePosition * 0.08 : i * 0.08
      );
      const fineNoise = coastNoise(
        isHorizontal ? i * 0.25 : edgePosition * 0.25 + 500,
        isHorizontal ? edgePosition * 0.25 + 500 : i * 0.25
      );
      const noiseVal = coarseNoise * 0.6 + fineNoise * 0.4;

      const rawDepth = baseDepth + (noiseVal - 0.5) * depthVariation * 2.5;
      const localDepth = Math.max(1, Math.min(Math.floor(rawDepth * edgeFade), maxDepth));

      // Place water tiles from edge inward
      for (let d = 0; d < localDepth; d++) {
        const x = isHorizontal ? i : inwardDirection === 1 ? d : size - 1 - d;
        const y = isHorizontal ? (inwardDirection === 1 ? d : size - 1 - d) : i;

        if (x >= 0 && x < size && y >= 0 && y < size && grid[y][x].building.type !== 'water') {
          grid[y][x].building = createBuilding('water');
          grid[y][x].landValue = 60;
          tiles.push({ x, y });
        }
      }
    }

    return tiles;
  };

  // North edge (top, y=0, extends downward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(true, 0, 1);
    if (tiles.length > 0) {
      edges.push({ side: 'north', tiles });
    }
  }

  // South edge (bottom, y=size-1, extends upward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(true, size - 1, -1);
    if (tiles.length > 0) {
      edges.push({ side: 'south', tiles });
    }
  }

  // East edge (right, x=size-1, extends leftward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(false, size - 1, -1);
    if (tiles.length > 0) {
      edges.push({ side: 'east', tiles });
    }
  }

  // West edge (left, x=0, extends rightward)
  if (Math.random() < oceanChance) {
    const tiles = generateOceanEdge(false, 0, 1);
    if (tiles.length > 0) {
      edges.push({ side: 'west', tiles });
    }
  }

  // Create water body entries for oceans
  const usedOceanNames = new Set<string>();
  for (const edge of edges) {
    if (edge.tiles.length > 0) {
      const avgX = edge.tiles.reduce((sum, t) => sum + t.x, 0) / edge.tiles.length;
      const avgY = edge.tiles.reduce((sum, t) => sum + t.y, 0) / edge.tiles.length;

      let oceanName = generateWaterName('ocean');
      while (usedOceanNames.has(oceanName)) {
        oceanName = generateWaterName('ocean');
      }
      usedOceanNames.add(oceanName);

      waterBodies.push({
        id: `ocean-${edge.side}-${waterBodies.length}`,
        name: oceanName,
        type: 'ocean',
        tiles: edge.tiles,
        centerX: Math.round(avgX),
        centerY: Math.round(avgY),
      });
    }
  }

  return waterBodies;
}

export function generateTerrain(
  size: number,
  createTile: (x: number, y: number, type: BuildingType) => Tile,
  createBuilding: (type: BuildingType) => Building
): { grid: Tile[][]; waterBodies: WaterBody[] } {
  const grid: Tile[][] = [];
  const seed = Math.random() * 1000;

  // First pass: create base terrain with grass
  for (let y = 0; y < size; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x++) {
      row.push(createTile(x, y, 'grass'));
    }
    grid.push(row);
  }

  // Second pass: add lakes
  const lakeBodies = generateLakes(grid, size, seed, createBuilding);

  // Third pass: add oceans
  const oceanBodies = generateOceans(grid, size, seed, createBuilding);

  // Combine all water bodies
  const waterBodies = [...lakeBodies, ...oceanBodies];

  // Fourth pass: add scattered trees
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x].building.type === 'water') continue; // Don't place trees on water

      const treeNoise = perlinNoise(x * 2, y * 2, seed + 500, 2);
      const isTree = treeNoise > 0.72 && Math.random() > 0.65;

      // Also add some trees close to water
      const nearWater = isNearWater(grid, x, y, size);
      const isTreeNearWater = nearWater && Math.random() > 0.7;

      if (isTree || isTreeNearWater) {
        grid[y][x].building = createBuilding('tree');
      }
    }
  }

  return { grid, waterBodies };
}

// Check if a tile is near water
export function isNearWater(grid: Tile[][], x: number, y: number, size: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        if (grid[ny][nx].building.type === 'water') {
          return true;
        }
      }
    }
  }
  return false;
}
