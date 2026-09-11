import './booking-times.css'
import { getOperatingDate } from '../domain/session-time'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getGameByType, GAME_TYPES } from '../domain/games'
import { getAvailabilityForGame } from '../domain/booking-engine'
import { useBookingAvailability } from '../hooks/useBookingData'
import GameImage from '../components/GameImage'
import CompactDatePicker from '../components/CompactDatePicker'
import type { GameType } from '../domain/types'

function GameBookingPage() {
  const { game: gameParam } = useParams(); const navigate = useNavigate()
  const selectedGame = (gameParam as GameType) || 'pool'
  const [selectedDate, setSelectedDate] = useState(getOperatingDate())
  const [selectedTimes, setSelectedTimes] = useState<string[]>([])
  const { data, error, loading, refresh } = useBookingAvailability(selectedDate)
  const reservations = data.reservations
  const inventory = data.games.find(g => g.type === selectedGame)
  const ready = !loading && !error && data.date === selectedDate && !!inventory
  const slotData = useMemo(() => GAME_TYPES.includes(selectedGame) && ready ? getAvailabilityForGame(selectedGame, selectedDate, reservations, inventory) : [], [selectedGame, selectedDate, reservations, ready, inventory])
  if (!GAME_TYPES.includes(selectedGame)) return <div className="page-shell"><h1>Game not found</h1><Link to="/">Choose a game</Link></div>
  const game = inventory ?? getGameByType(selectedGame)
  const toggleTime = (time: string) => setSelectedTimes((current) => current.includes(time) ? current.filter((item) => item !== time) : current.length < 2 ? [...current, time] : current)
  const continueBooking = () => { if (!ready || !selectedTimes.length) return; sessionStorage.setItem('next-games-draft', JSON.stringify({ gameType: selectedGame, date: selectedDate, times: selectedTimes, quantity: selectedTimes.length })); navigate('/booking/review') }
  return <main className="page-shell booking-page">
    <Link to="/" className="back-link">← Games</Link>
    <ol className="flow-steps" aria-label="Booking progress"><li className="is-done">Game</li><li className="is-active">Date & time</li><li>Name</li><li>Confirm</li></ol>
    <section className="booking-game"><div className="booking-game__art"><GameImage gameType={selectedGame} /></div><div><h1>{game.name}</h1><p>{game.price} DKK <span>/ hour</span></p></div></section>
    <section className="booking-section"><CompactDatePicker value={selectedDate} onChange={(date) => { setSelectedDate(date); setSelectedTimes([]) }} /></section>
    <section className="booking-section"><div className="section-title-row"><h2>Time</h2><span>{selectedTimes.length}/2 selected</span></div><p className="pay-note">1-hour sessions</p>{(loading || data.date !== selectedDate) && !error && <p role="status">Loading availability...</p>}{error && <p className="form-error" role="alert">{error} <button type="button" onClick={refresh}>Retry</button></p>}{!loading && !error && data.date === selectedDate && !inventory && <p role="status">This game is currently unavailable.</p>}<div className="time-list">
      {slotData.map((slot) => <button type="button" key={slot.time} aria-pressed={selectedTimes.includes(slot.time)} disabled={slot.isFull} onClick={() => toggleTime(slot.time)} className={`time-row ${selectedTimes.includes(slot.time) ? 'time-row--selected' : ''} ${slot.available === 1 ? 'time-row--low' : ''}`}><strong>{slot.time}</strong><span>{slot.isFull ? 'FULL' : `${slot.available} available${slot.available === 1 ? ' ? Last one' : ''}`}</span><i aria-hidden="true">{selectedTimes.includes(slot.time) ? '✓' : '→'}</i></button>)}
    </div></section>
    <div className="booking-footer"><div><span>{selectedTimes.length ? `${selectedTimes.length} session${selectedTimes.length > 1 ? 's' : ''}` : 'Choose a time'}</span><strong>{selectedTimes.length ? `${selectedTimes.length * game.price} DKK` : ''}</strong></div><button type="button" className="button button--primary" disabled={!ready || !selectedTimes.length} onClick={continueBooking}>Continue →</button></div>
  </main>
}
export default GameBookingPage
