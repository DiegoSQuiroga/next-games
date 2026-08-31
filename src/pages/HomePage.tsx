import { useMemo } from 'react'
import { getGameByType, GAME_TYPES } from '../domain/games'
import { getNextAvailableSlot } from '../domain/booking-engine'
import { bookingRepository } from '../services/bookingRepository'
import GameCard from '../components/GameCard'

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
      <section className="hero">
        <div className="hero__copy">
          <p className="hero__label">Play at Next House</p>
          <h1 className="hero__title">Next Games</h1>
          <p className="hero__subtitle">Book. Play. Pay at reception.</p>
        </div>
      </section>

      <section className="games-section" aria-labelledby="games-heading">
        <div className="games-heading">
          <h2 id="games-heading">Choose your game</h2>
          <span>1 hour sessions</span>
        </div>
        <div className="card-grid">
        {cards.map((game, index) => (
          <GameCard
            key={game.type}
            index={index + 1}
            gameType={game.type}
            name={game.name}
            price={game.price}
            count={game.resources.length}
            nextSlot={game.nextSlot}
          />
        ))}
        </div>
      </section>
    </div>
  )
}

export default HomePage
