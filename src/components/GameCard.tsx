import { Link } from 'react-router-dom'
import type { GameType } from '../domain/types'
import GameImage from './GameImage'

function GameCard({
  gameType,
  name,
  price,
}: {
  gameType: GameType
  name: string
  price: number
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

        <span className="game-card__cta">Book <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  )
}

export default GameCard
