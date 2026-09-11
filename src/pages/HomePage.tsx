import { getOperatingDate } from '../domain/session-time'
import { useEffect, useMemo, useState } from 'react'
import { fetchGameCatalog } from '../services/gamesService'
import type { GameCatalogItem } from '../services/gamesService'
import { Link } from 'react-router-dom'
import { useBookingAvailability } from '../hooks/useBookingData'
import { getRecentBookingReferences } from '../services/recentBookings'
import { getAvailabilityForGame } from '../domain/booking-engine'
import GameCard from '../components/GameCard'

function HomePage() {
  const [games, setGames] = useState<GameCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchGameCatalog().then((catalog) => {
      if (!cancelled) setGames(catalog)
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load games from Supabase.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const today = getOperatingDate()
  const availability = useBookingAvailability(today)
  const [recent] = useState(getRecentBookingReferences)
  const reservations = availability.data.reservations

  const cards = useMemo(
    () =>
      games.map((game) => {
        const inventory = availability.data.games.find(g => g.type === game.type)
        const nextSlot = inventory ? getAvailabilityForGame(game.type, today, reservations, inventory).find(slot => !slot.isFull)?.time ?? null : null

        return {
          ...game,
          nextSlot,
        }
      }),
    [games, reservations, availability.data.games, today],
  )

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero__copy">
          <h1 className="hero__title">Next Games</h1>
        </div>
      </section>

      {recent[0] && <p><Link className="back-link" to={'/booking/' + recent[0]}>Your recent booking: {recent[0]}</Link></p>}
      <section className="games-section" aria-labelledby="games-heading">
        <div className="games-heading">
          <h2 id="games-heading">Choose your game</h2>
          <span>1 hour sessions</span>
        </div>
        {(loading || availability.loading) && <p role="status">Loading games…</p>}
        {(error || availability.error) && <p className="form-error" role="alert">{error || availability.error}</p>}
        <div className="card-grid" aria-busy={loading}>
        {cards.map((game) => (
          <GameCard
            key={game.type}
            gameType={game.type}
            name={game.name}
            price={game.price}
            count={game.resourceCount}
            nextSlot={game.nextSlot}
            availabilityReady={!availability.loading && !availability.error}
          />
        ))}
        </div>
      </section>
    </div>
  )
}

export default HomePage
