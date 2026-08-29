import type { Game, GameType, PhysicalResource, ResourceId } from './types'

export const GAME_DEFINITIONS: Record<GameType, Game> = {
  pool: {
    type: 'pool',
    name: 'Pool',
    price: 60,
    resources: [
      { id: 'pool-1', gameType: 'pool', label: 'Pool table 1' },
      { id: 'pool-2', gameType: 'pool', label: 'Pool table 2' },
    ],
  },
  darts: {
    type: 'darts',
    name: 'Darts',
    price: 60,
    resources: [
      { id: 'darts-1', gameType: 'darts', label: 'Dart station 1' },
      { id: 'darts-2', gameType: 'darts', label: 'Dart station 2' },
      { id: 'darts-3', gameType: 'darts', label: 'Dart station 3' },
    ],
  },
  'ping-pong': {
    type: 'ping-pong',
    name: 'Ping Pong',
    price: 60,
    resources: [{ id: 'ping-pong-1', gameType: 'ping-pong', label: 'Ping Pong table' }],
  },
  shuffleboard: {
    type: 'shuffleboard',
    name: 'Shuffleboard',
    price: 75,
    resources: [
      { id: 'shuffleboard-1', gameType: 'shuffleboard', label: 'Shuffleboard 1' },
      { id: 'shuffleboard-2', gameType: 'shuffleboard', label: 'Shuffleboard 2' },
    ],
  },
}

export const GAME_TYPES: GameType[] = ['pool', 'darts', 'ping-pong', 'shuffleboard']

export const ALL_RESOURCES: PhysicalResource[] = Object.values(GAME_DEFINITIONS).flatMap(
  (game) => game.resources,
)

export const RESOURCE_IDS: ResourceId[] = ALL_RESOURCES.map((resource) => resource.id)

export function getGameByType(gameType: GameType): Game {
  return GAME_DEFINITIONS[gameType]
}

export function getGameDisplayName(gameType: GameType): string {
  return GAME_DEFINITIONS[gameType].name
}
