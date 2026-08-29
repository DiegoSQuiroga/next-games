import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGameByType, GAME_TYPES } from '../domain/games'
import { getAvailabilityForGame, makeDayOptions } from '../domain/booking-engine'
import { bookingRepository } from '../services/bookingRepository'
import type { GameType } from '../domain/types'

const REQUIRED_DATE_COUNT = 7

function GameBookingPage() {
  const { game: gameParam } = useParams()
  const navigate = useNavigate()
  const selectedGame = (gameParam as GameType) || 'pool'

  const game = getGameByType(selectedGame)
  const reservations = bookingRepository.flattenReservations()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedTimes, setSelectedTimes] = useState<string[]>([])

  const dayOptions = useMemo(() => makeDayOptions(REQUIRED_DATE_COUNT), [])
  const slotData = useMemo(
    () => getAvailabilityForGame(selectedGame, selectedDate, reservations),
    [selectedGame, selectedDate, reservations],
  )

  if (!GAME_TYPES.includes(selectedGame)) {
    return <div className="page-shell"><p>Invalid game selected.</p></div>
  }

  const handleToggleTime = (time: string) => {
    setSelectedTimes((current) => {
      if (current.includes(time)) {
        return current.filter((item) => item !== time)
      }

      if (current.length >= 2) {
        return current
      }

      return [...current, time]
    })
  }

  const handleContinue = () => {
    if (selectedTimes.length === 0) {
      return
    }

    const draft = {
      gameType: selectedGame,
      date: selectedDate,
      times: selectedTimes,
      quantity: selectedTimes.length,
    }

    sessionStorage.setItem('next-games-draft', JSON.stringify(draft))
    navigate('/booking/review')
  }

  return (
    <div className="page-shell booking-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Book a game</p>
          <h1>{game.name}</h1>
        </div>
        <span className="price-pill">{game.price} DKK / hour</span>
      </div>

      <label className="field-label">
        Select a date
        <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
          {dayOptions.map((day) => (
            <option value={day} key={day}>
              {day}
            </option>
          ))}
        </select>
      </label>

      <div className="slot-grid">
        {slotData.map((slot) => (
          <button
            type="button"
            key={slot.time}
            className={[
              'slot-button',
              selectedTimes.includes(slot.time) ? 'slot-button--selected' : '',
              slot.isFull ? 'slot-button--full' : '',
            ].join(' ')}
            onClick={() => !slot.isFull && handleToggleTime(slot.time)}
            disabled={slot.isFull}
          >
            <span>{slot.time}</span>
            {slot.isFull ? <strong>FULL</strong> : <small>{slot.available} of {slot.capacity} available</small>}
          </button>
        ))}
      </div>

      <div className="selection-summary">
        <p>
          Selected: {selectedTimes.length > 0 ? selectedTimes.join(', ') : 'No time chosen yet'}
        </p>
        <button type="button" className="primary-button" onClick={handleContinue} disabled={selectedTimes.length === 0}>
          Continue to review
        </button>
      </div>
    </div>
  )
}

export default GameBookingPage
