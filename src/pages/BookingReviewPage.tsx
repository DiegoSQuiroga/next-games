import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createBookingGroup } from '../domain/booking-engine'
import { getGameByType } from '../domain/games'
import { bookingRepository } from '../services/bookingRepository'
import { formatDateLabel, formatEndTime, formatMoney } from '../utils/formatters'
import type { GameType } from '../domain/types'
type DraftSelection = { gameType: GameType; date: string; times: string[]; quantity: number }
function BookingReviewPage() {
  const navigate = useNavigate(); const draftRaw = sessionStorage.getItem('next-games-draft'); const draft = draftRaw ? (JSON.parse(draftRaw) as DraftSelection) : null
  const [customerName, setCustomerName] = useState(''); const [error, setError] = useState('')
  const reservations = useMemo(() => draft?.times.map((time) => ({ gameType: draft.gameType, date: draft.date, time })) ?? [], [draft])
  if (!draft) return <main className="page-shell empty-page"><h1>Booking not found</h1><p>Start a new reservation from the games page.</p><Link className="button button--primary" to="/">Choose a game</Link></main>
  const game = getGameByType(draft.gameType); const total = reservations.length * game.price
  const submit = () => { if (!customerName.trim()) return setError('Enter your name to confirm the booking.'); try { const group = createBookingGroup({ customerName, reservationInputs: reservations, existingGroups: bookingRepository.getAllGroups(), allReservations: bookingRepository.flattenReservations() }); bookingRepository.saveGroup(group); sessionStorage.removeItem('next-games-draft'); navigate(`/booking/${group.bookingReference}`) } catch (bookingError) { setError((bookingError as Error).message) } }
  return <main className="page-shell review-page"><Link to={`/book/${draft.gameType}`} className="back-link">← Change selection</Link><header className="compact-heading"><p className="eyebrow">Almost there</p><h1>Review your booking</h1></header><div className="review-layout">
    <section className="review-card"><p className="eyebrow">Your selection</p>{reservations.map((reservation, index) => <div className="review-session" key={reservation.time}><span className="review-session__number">{index + 1}</span><div><strong>{game.name}</strong><span>{formatDateLabel(reservation.date)} · {reservation.time}–{formatEndTime(reservation.time)}</span></div><b>{formatMoney(game.price)}</b></div>)}<Link to="/" className="add-link">+ Add another game</Link></section>
    <section className="review-card review-form"><label className="field"><span className="field__label">Your name</span><input autoComplete="name" autoFocus className="field__input" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setError('') }} placeholder="e.g. Roberto" /></label><div className="payment-line"><div><p className="eyebrow">Payment</p><strong>Pay at the bar / reception</strong></div><span>In person</span></div><div className="review-total"><span>Total</span><strong>{formatMoney(total)}</strong></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary button--wide" type="button" onClick={submit}>Confirm booking →</button></section>
  </div></main>
}
export default BookingReviewPage
