import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { getGameByType, GAME_TYPES } from '../domain/games'
import { getNextAvailableSlot } from '../domain/booking-engine'
import { bookingRepository } from '../services/bookingRepository'

function HomePage() {
  const reservations = bookingRepository.flattenReservations()

  const cards = useMemo(
    () =>
      GAME_TYPES.map((gameType) => {
        const game = getGameByType(gameType)
        const nextSlot = getNextAvailableSlot(gameType, new Date().toISOString().slice(0, 10), reservations)

        return {
          ...game,
          nextSlot,
        }
      }),
    [reservations],
  )

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <p className="eyebrow">Next House Copenhagen</p>
        <h1>Book your next game session</h1>
        <p className="lead">
          Reserve a table, station or court in minutes. Pay at the bar or reception when you arrive.
        </p>
      </header>

      <section className="card-grid">
        {cards.map((game) => (
          <article className="game-card" key={game.type}>
            <div className="game-card__header">
              <div>
                <p className="game-card__label">Game</p>
                <h2>{game.name}</h2>
              </div>
              <span className="price-pill">{game.price} DKK</span>
            </div>

            <div className="game-card__meta">
              <span>{game.resources.length} available resources</span>
              <span>{game.nextSlot ? `Next slot: ${game.nextSlot}` : 'Fully booked'}</span>
            </div>

            <Link to={`/book/${game.type}`} className="primary-button">
              Book now
            </Link>
          </article>
        ))}
      </section>
    </div>
  )
}

export default HomePage
