import { Link } from 'react-router-dom'
import type { GameType } from '../domain/types'
import GameImage from './GameImage'

function GameCard({
  gameType,
  name,
  price,
  count,
  nextSlot,
  availabilityReady = true,
}: {
  gameType: GameType
  name: string
  price: number
  count: number
  nextSlot: string | null
  availabilityReady?: boolean
}) {
  return (
    <Link to={`/book/${gameType}`} className="game-card" aria-label={`Book ${name}`}>
      <div className="game-card__image">
        <GameImage gameType={gameType} />
      </div>

      <div className="game-card__content">
        <div className="game-card__header">
          <h3 className="game-card__title">{name}</h3>
          <span className="game-card__price">{price} DKK</span>
        </div>

        <div className="game-card__meta">
          <span>{count} available</span>
          <span>{!availabilityReady ? 'Availability unavailable' : nextSlot ? `Next ${nextSlot}` : 'Full today'}</span>
        </div>

        <span className="game-card__cta">Book <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  )
}

export default GameCard
