import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { rememberBookingReference } from '../services/recentBookings'
import { useBookingAvailability } from '../hooks/useBookingData'
import { getGameByType } from '../domain/games'
import { bookingRepository } from '../services/bookingRepository'
import GameImage from '../components/GameImage'
import { formatDateLabel, formatEndTime, formatMoney } from '../utils/formatters'
import { readBookingDraft } from '../services/bookingDraft'
function BookingReviewPage() {
  const navigate = useNavigate()
  const [draft] = useState(readBookingDraft)
  const [saving, setSaving] = useState(false)
  const availability = useBookingAvailability(draft?.date ?? new Date().toISOString().slice(0, 10))
  const [customerName, setCustomerName] = useState(''); const [error, setError] = useState('')
  const reservations = useMemo(() => draft?.times.map((time) => ({ gameType: draft.gameType, date: draft.date, time })) ?? [], [draft])
  if (!draft) return <main className="page-shell empty-page"><h1>Booking not found</h1><p>Start a new reservation from the games page.</p><Link className="button button--primary" to="/">Choose a game</Link></main>
  const inventory = availability.data.games.find(g => g.type === draft.gameType)
  const game = inventory ?? getGameByType(draft.gameType); const total = reservations.length * game.price
  const submit = async () => {
    if (saving || !inventory || availability.loading || availability.error) return
    if (!customerName.trim()) return setError('Enter your name to confirm the booking.')
    setSaving(true); setError('')
    try {
      const group = await bookingRepository.createGroup({ customerName, reservationInputs: reservations })
      rememberBookingReference(group.bookingReference)
      try { sessionStorage.removeItem('next-games-draft') } catch { /* The server booking already succeeded. */ }
      navigate('/booking/' + group.bookingReference)
    } catch (cause) { setError((cause as Error).message) } finally { setSaving(false) }
  }
  return <main className="page-shell review-page"><Link to={`/book/${draft.gameType}`} className="back-link">← Change</Link><ol className="flow-steps" aria-label="Booking progress"><li className="is-done">Game</li><li className="is-done">Date & time</li><li className="is-active">Name</li><li>Confirm</li></ol><header className="compact-heading"><h1>Your booking</h1></header><div className="review-layout">
    <section className="review-card">{reservations.map((reservation) => <div className="review-session" key={reservation.time}><div className="review-session__art"><GameImage gameType={draft.gameType} /></div><div><strong>{game.name}</strong><span>{formatDateLabel(reservation.date, reservation.time)}</span><span>{reservation.time}–{formatEndTime(reservation.time)}</span></div><b>{formatMoney(game.price)}</b></div>)}<Link to="/" className="add-link">+ Add another game</Link></section>
    <section className="review-card review-form"><label className="field"><span className="field__label">Your name</span><input autoComplete="name" autoFocus className="field__input" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setError('') }} placeholder="Name" /></label><div className="review-total"><span>Total</span><strong>{formatMoney(total)}</strong></div>{(error || availability.error) && <p className="form-error" role="alert">{error || availability.error}</p>}<button className="button button--primary button--wide" type="button" disabled={saving || availability.loading || !!availability.error || !inventory} onClick={submit}>{saving ? 'Saving...' : 'Confirm booking'}</button><small className="pay-note">Pay at reception.</small></section>
  </div></main>
}
export default BookingReviewPage
