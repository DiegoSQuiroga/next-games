import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { rememberBookingReference } from '../services/recentBookings'
import { useBookingAvailability } from '../hooks/useBookingData'
import { getGameByType } from '../domain/games'
import { bookingRepository } from '../services/bookingRepository'
import GameImage from '../components/GameImage'
import { formatDateLabel, formatEndTime, formatMoney } from '../utils/formatters'
import { readBookingDraft } from '../services/bookingDraft'
import { isFutureCustomerSlot } from '../domain/session-time'
import { useCurrentTime } from '../hooks/useCurrentTime'
function BookingReviewPage() {
  const navigate = useNavigate()
  const privacyDialog = useRef<HTMLDialogElement>(null)
  const [draft] = useState(readBookingDraft)
  const now = useCurrentTime()
  const [saving, setSaving] = useState(false)
  const availability = useBookingAvailability(draft?.date ?? new Date().toISOString().slice(0, 10))
  const [customerName, setCustomerName] = useState(''); const [error, setError] = useState('')
  const reservations = useMemo(() => draft?.times.map((time) => ({ gameType: draft.gameType, date: draft.date, time })) ?? [], [draft])
  const expiredSelection = reservations.some(({ date, time }) => !isFutureCustomerSlot(date, time, now))
  if (!draft) return <main className="page-shell empty-page"><h1>Booking not found</h1><p>Start a new reservation from the games page.</p><Link className="button button--primary" to="/">Choose a game</Link></main>
  const inventory = availability.data.games.find(g => g.type === draft.gameType)
  const game = inventory ?? getGameByType(draft.gameType); const total = reservations.length * game.price
  const submit = async () => {
    if (saving || !inventory || availability.loading || availability.error) return
    if (reservations.some(({ date, time }) => !isFutureCustomerSlot(date, time))) return setError('A selected start time has passed. Choose another time.')
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
    <section className="review-card review-form"><label className="field"><span className="field__label">Your name</span><input autoComplete="name" autoFocus className="field__input" aria-describedby="booking-privacy-notice" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setError('') }} placeholder="Name" /></label><p id="booking-privacy-notice" className="booking-privacy-notice">Your name is only used to manage your booking and will not be used for marketing. <button type="button" className="booking-privacy-link" aria-haspopup="dialog" onClick={() => privacyDialog.current?.showModal()}>Privacy Policy</button></p><div className="review-total"><span>Total</span><strong>{formatMoney(total)}</strong></div>{(error || availability.error || expiredSelection) && <p className="form-error" role="alert">{error || availability.error || 'A selected start time has passed. Use Change to choose another time.'}</p>}<button className="button button--primary button--wide" type="button" disabled={expiredSelection || saving || availability.loading || !!availability.error || !inventory} onClick={submit}>{saving ? 'Saving...' : 'Confirm booking'}</button><small className="pay-note">Pay at reception.</small></section>
  </div>
    <dialog ref={privacyDialog} className="review-card booking-privacy-dialog" aria-labelledby="booking-privacy-title">
      <h2 id="booking-privacy-title" tabIndex={-1} autoFocus>Privacy Policy</h2>
      <p>Next House Games collects your name and booking details when you make a reservation.</p>
      <h3>What we collect:</h3>
      <p>Your name, selected game, booking date and booking time.</p>
      <h3>Why we collect it:</h3>
      <p>To identify and manage your reservation and operate the game booking system.</p>
      <h3>How the data is used:</h3>
      <p>The information is used only for booking administration and operational purposes. It is not used for marketing and is not sold to third parties.</p>
      <h3>Data storage:</h3>
      <p>Booking information is stored using the technical services required to operate Next House Games, including Supabase.</p>
      <h3>Data retention:</h3>
      <p>Personal data should only be kept for as long as reasonably necessary to manage the booking and related operational needs.</p>
      <h3>Access:</h3>
      <p>Only authorized staff and necessary technical service providers should have access to booking information.</p>
      <h3>Contact:</h3>
      <p>If you have questions regarding your personal data, please contact Next House Copenhagen reception.</p>
      <button type="button" className="button button--primary" onClick={() => privacyDialog.current?.close()}>Close</button>
    </dialog>
  </main>
}
export default BookingReviewPage
