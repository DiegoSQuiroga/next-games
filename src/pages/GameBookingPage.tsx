import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getGameByType, GAME_TYPES } from '../domain/games'
import { getAvailabilityForGame } from '../domain/booking-engine'
import { bookingRepository } from '../services/bookingRepository'
import GameImage from '../components/GameImage'
import CompactDatePicker from '../components/CompactDatePicker'
import type { GameType } from '../domain/types'

function GameBookingPage() {
  const { game: gameParam } = useParams(); const navigate = useNavigate()
  const selectedGame = (gameParam as GameType) || 'pool'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedTimes, setSelectedTimes] = useState<string[]>([])
  const reservations = bookingRepository.flattenReservations()
  const slotData = useMemo(() => getAvailabilityForGame(selectedGame, selectedDate, reservations), [selectedGame, selectedDate, reservations])
  if (!GAME_TYPES.includes(selectedGame)) return <div className="page-shell"><h1>Game not found</h1><Link to="/">Choose a game</Link></div>
  const game = getGameByType(selectedGame)
  const toggleTime = (time: string) => setSelectedTimes((current) => current.includes(time) ? current.filter((item) => item !== time) : current.length < 2 ? [...current, time] : current)
  const continueBooking = () => { if (!selectedTimes.length) return; sessionStorage.setItem('next-games-draft', JSON.stringify({ gameType: selectedGame, date: selectedDate, times: selectedTimes, quantity: selectedTimes.length })); navigate('/booking/review') }
  return <main className="page-shell booking-page">
    <Link to="/" className="back-link">← Games</Link>
    <section className="booking-game"><div className="booking-game__art"><GameImage gameType={selectedGame} /></div><div><h1>{game.name}</h1><p>{game.price} DKK <span>/ hour</span></p></div></section>
    <section className="booking-section"><CompactDatePicker value={selectedDate} onChange={(date) => { setSelectedDate(date); setSelectedTimes([]) }} /></section>
    <section className="booking-section"><div className="section-title-row"><h2>Time</h2><span>{selectedTimes.length}/2 selected</span></div><div className="time-list">
      {slotData.map((slot) => <button type="button" key={slot.time} disabled={slot.isFull} onClick={() => toggleTime(slot.time)} className={`time-row ${selectedTimes.includes(slot.time) ? 'time-row--selected' : ''} ${slot.available === 1 ? 'time-row--low' : ''}`}><strong>{slot.time}</strong><span>{slot.isFull ? 'Full' : `${slot.available} available`}</span><i aria-hidden="true">{selectedTimes.includes(slot.time) ? '✓' : '→'}</i></button>)}
    </div></section>
    <div className="booking-footer"><div><span>{selectedTimes.length ? `${selectedTimes.length} session${selectedTimes.length > 1 ? 's' : ''}` : 'Choose a time'}</span><strong>{selectedTimes.length ? `${selectedTimes.length * game.price} DKK` : ''}</strong></div><button type="button" className="button button--primary" disabled={!selectedTimes.length} onClick={continueBooking}>Continue →</button></div>
  </main>
}
export default GameBookingPage
