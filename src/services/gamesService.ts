import type { GameType } from '../domain/types'

export type GameCatalogItem = {
  type: GameType
  name: string
  price: number
  resourceCount: number
}

type GameRow = { id: number; name: string; price_dkk: number }
type ResourceRow = { id: number; game_id: number }

// Database names map only to local routes/images, never to local prices or inventory.
const gameTypes: Record<string, GameType> = {
  Pool: 'pool', Darts: 'darts', 'Ping Pong': 'ping-pong', Shuffleboard: 'shuffleboard',
}
const displayOrder = Object.values(gameTypes)

export function mapGameCatalog(games: GameRow[], resources: ResourceRow[]): GameCatalogItem[] {
  return games.map((game) => {
    const type = gameTypes[game.name]
    if (!type || !Number.isFinite(game.price_dkk) || game.price_dkk < 0) {
      throw new Error(`Unsupported game or invalid price in public.games (id ${game.id}).`)
    }
    return {
      type,
      name: game.name,
      price: game.price_dkk,
      resourceCount: new Set(resources.filter((resource) => resource.game_id === game.id).map((resource) => resource.id)).size,
    }
  }).sort((a, b) => displayOrder.indexOf(a.type) - displayOrder.indexOf(b.type))
}

export async function fetchGameCatalog(): Promise<GameCatalogItem[]> {
  // Lazy import lets configuration errors reach the page's error state instead of crashing the app.
  const { supabase } = await import('../lib/supabase')
  const [games, resources] = await Promise.all([
    supabase.schema('public').from('games').select('id, name, price_dkk').eq('active', true),
    supabase.schema('public').from('resources').select('id, game_id').eq('active', true),
  ])
  if (games.error) throw new Error(`Unable to read public.games: ${games.error.message}`)
  if (resources.error) throw new Error(`Unable to read public.resources: ${resources.error.message}`)
  if (!games.data.length) throw new Error('No active games returned from public.games. Check seed data and SELECT policies.')
  return mapGameCatalog(games.data, resources.data)
}
