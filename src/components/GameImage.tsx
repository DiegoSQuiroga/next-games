import poolImage from '../assets/pool.png'
import dartsImage from '../assets/dardos.png'
import pingPongImage from '../assets/ping pong.png'
import shuffleImage from '../assets/shuffle.png'
import type { GameType } from '../domain/types'

const images: Record<GameType, string> = {
  pool: poolImage,
  darts: dartsImage,
  'ping-pong': pingPongImage,
  shuffleboard: shuffleImage,
}

function GameImage({ gameType, className = '' }: { gameType: GameType; className?: string }) {
  return (
    <img
      src={images[gameType]}
      alt=""
      className={`game-image ${className}`}
    />
  )
}

export default GameImage
