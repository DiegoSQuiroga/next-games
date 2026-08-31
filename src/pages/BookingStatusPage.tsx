import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { bookingRepository } from '../services/bookingRepository'
import CountdownTimer from '../components/CountdownTimer'
import GameImage from '../components/GameImage'
import StatusBadge from '../components/StatusBadge'
import { formatDateLabel, formatDateTime, formatEndTime, formatMoney } from '../utils/formatters'

function BookingStatusPage() {
  const { reference } = useParams(); const [, refresh] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => refresh((value) => value + 1), 5000); return () => window.clearInterval(timer) }, [])
  const group = bookingRepository.getGroupByReference(reference ?? '')
  if (!group) return <main className="page-shell empty-page"><h1>Booking not found</h1><p>Check the reference or start a new reservation.</p><Link className="button button--primary" to="/">Book a game</Link></main>
  const status = group.reservations.every((item) => item.status === 'CONFIRMED') ? 'CONFIRMED' : group.reservations.some((item) => item.status === 'PENDING_PAYMENT') ? 'PENDING_PAYMENT' : group.reservations[0].status
  const pending = status === 'PENDING_PAYMENT'
  const copyReference = () => navigator.clipboard?.writeText(group.bookingReference)
  return <main className="page-shell status-page">
    <section className={`status-hero ${pending ? 'status-hero--pending' : 'status-hero--confirmed'}`}><span className="status-icon" aria-hidden="true">✓</span><h1>{pending ? 'Booking pending' : status === 'CONFIRMED' ? 'Booking confirmed' : 'Booking cancelled'}</h1></section>
    <div className="status-layout"><section className="status-card ticket"><div className="reference-line"><span>Save this code</span><strong>{group.bookingReference}</strong><button type="button" className="copy-button" onClick={copyReference}>Copy</button></div>{group.reservations.map((reservation) => <div className="status-session" key={reservation.id}><div className="status-session__art"><GameImage gameType={reservation.gameType} /></div><div><strong>{reservation.gameType === 'ping-pong' ? 'Ping Pong' : reservation.gameType[0].toUpperCase() + reservation.gameType.slice(1)}</strong><span>{formatDateLabel(reservation.date)}</span><span>{reservation.startTime}–{formatEndTime(reservation.startTime)}</span></div><StatusBadge status={reservation.status} /></div>)}<div className="review-total"><span>Total</span><strong>{formatMoney(group.totalPrice)}</strong></div></section>
    {pending && <section className="deadline-card"><div><span className="eyebrow">Pay before</span><strong>{formatDateTime(group.paymentDeadline)}</strong></div><div><span className="eyebrow">Time left</span><strong><CountdownTimer deadline={group.paymentDeadline} /></strong></div></section>}
    <aside className="status-card status-help"><h2>{pending ? 'Pay at reception.' : 'See you there.'}</h2><p>Take a screenshot or keep your booking code handy.</p><Link to="/" className="button button--secondary button--wide">Book another game</Link></aside></div>
  </main>
}
export default BookingStatusPage
