import { useEffect, useState } from 'react'
import { fetchGameCatalog } from '../services/gamesService'
import type { GameCatalogItem } from '../services/gamesService'
import { Link } from 'react-router-dom'
import { getRecentBookingReferences } from '../services/recentBookings'
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

  const [recent] = useState(getRecentBookingReferences)

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero__copy">
          <span className="hero__label">Next House Copenhagen / Play</span>
          <h1 className="hero__title">Next Games</h1>
        </div>
      </section>

      {recent[0] && <p><Link className="back-link" to={'/booking/' + recent[0]}>Your recent booking: {recent[0]}</Link></p>}
      <section className="games-section" aria-labelledby="games-heading">
        <div className="games-heading">
          <h2 id="games-heading">Choose your game</h2>
          <span>1 hour sessions</span>
        </div>
        {loading && <p role="status">Loading games…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="card-grid" aria-busy={loading}>
        {games.map((game) => (
          <GameCard
            key={game.type}
            gameType={game.type}
            name={game.name}
            price={game.price}
          />
        ))}
        </div>
      </section>
    </div>
  )
}

export default HomePage
