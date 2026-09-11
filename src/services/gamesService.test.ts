import { describe, expect, it, vi } from 'vitest'
import { fetchGameCatalog, mapGameCatalog } from './gamesService'

const { query, schema } = vi.hoisted(() => ({ query: vi.fn(), schema: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { schema } }))

describe('game catalog mapping', () => {
  it('uses database prices and joins distinct resources by game ID in display order', () => {
    expect(mapGameCatalog([
      { id: 40, name: 'Shuffleboard', price_dkk: 75 },
      { id: 10, name: 'Pool', price_dkk: 65 },
    ], [
      { id: 1, game_id: 10 }, { id: 2, game_id: 10 }, { id: 2, game_id: 10 },
      { id: 3, game_id: 40 }, { id: 4, game_id: 99 },
    ])).toEqual([
      { type: 'pool', name: 'Pool', price: 65, resourceCount: 2 },
      { type: 'shuffleboard', name: 'Shuffleboard', price: 75, resourceCount: 1 },
    ])
  })
  it('returns zero resources without falling back to local inventory', () => {
    expect(mapGameCatalog([{ id: 1, name: 'Darts', price_dkk: 60 }], [])[0].resourceCount).toBe(0)
  })
  it('rejects unsupported names and invalid prices rather than inventing a mapping', () => {
    expect(() => mapGameCatalog([{ id: 1, name: 'Unknown', price_dkk: 60 }], [])).toThrow(/Unsupported/)
    expect(() => mapGameCatalog([{ id: 1, name: 'Pool', price_dkk: -1 }], [])).toThrow(/invalid price/)
  })
})

function mockTables(gameError: { message: string } | null = null, resourceError: { message: string } | null = null, empty = false) {
  query.mockReset()
  schema.mockReset().mockReturnValue({ from: (table: string) => ({
    select: () => ({ eq: (column: string, value: boolean) => {
      query(table, column, value)
      return Promise.resolve(table === 'games'
        ? { data: empty ? [] : [{ id: 1, name: 'Pool', price_dkk: 60 }], error: gameError }
        : { data: [{ id: 1, game_id: 1 }], error: resourceError })
    } }),
  }) })
}

describe('read-only catalog queries', () => {
  it('reads active games and resources from public and returns only the presentation model', async () => {
    mockTables()
    expect(await fetchGameCatalog()).toEqual([{ type: 'pool', name: 'Pool', price: 60, resourceCount: 1 }])
    expect(schema).toHaveBeenCalledWith('public')
    expect(query.mock.calls).toEqual([['games', 'active', true], ['resources', 'active', true]])
  })
  it('reports game and resource query failures', async () => {
    mockTables({ message: 'Permission denied' })
    await expect(fetchGameCatalog()).rejects.toThrow('Unable to read public.games: Permission denied')
    mockTables(null, { message: 'Network error' })
    await expect(fetchGameCatalog()).rejects.toThrow('Unable to read public.resources: Network error')
  })
  it('reports an empty catalog, including rows hidden by SELECT policies', async () => {
    mockTables(null, null, true)
    await expect(fetchGameCatalog()).rejects.toThrow(/No active games/)
  })
})
