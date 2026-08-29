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
  return <main className="page-shell status-page">
    <section className={`status-hero ${pending ? 'status-hero--pending' : 'status-hero--confirmed'}`}><span className="status-icon" aria-hidden="true">{pending ? '!' : '✓'}</span><p className="eyebrow">Reservation {pending ? 'pending' : 'updated'}</p><h1>{pending ? 'Pay to hold your game' : status === 'CONFIRMED' ? 'Booking confirmed' : 'Booking cancelled'}</h1><p>{pending ? 'Your sessions are reserved until the payment deadline.' : status === 'CONFIRMED' ? 'You are all set. No further action is required.' : 'This reservation is no longer active.'}</p></section>
    {pending && <section className="deadline-card"><div><p className="eyebrow">Time left</p><strong><CountdownTimer deadline={group.paymentDeadline} /></strong></div><div><span>Pay {formatMoney(group.totalPrice)} at the bar / reception</span><small>Deadline · {formatDateTime(group.paymentDeadline)}</small></div></section>}
    <div className="status-layout"><section className="status-card"><div className="reference-line"><span>Booking reference</span><strong>{group.bookingReference}</strong></div>{group.reservations.map((reservation) => <div className="status-session" key={reservation.id}><div className="status-session__art"><GameImage gameType={reservation.gameType} /></div><div><strong>{reservation.gameType === 'ping-pong' ? 'Ping Pong' : reservation.gameType[0].toUpperCase() + reservation.gameType.slice(1)}</strong><span>{formatDateLabel(reservation.date)}</span><span>{reservation.startTime}–{formatEndTime(reservation.startTime)}</span></div><StatusBadge status={reservation.status} /></div>)}<div className="review-total"><span>Total</span><strong>{formatMoney(group.totalPrice)}</strong></div></section><aside className="status-card status-help"><p className="eyebrow">What to do</p><h2>{pending ? 'Pay at reception' : 'Show up and play'}</h2><p>{pending ? 'Show this reference at the bar or reception before the deadline. Your whole booking is paid together.' : 'Keep your reference handy and arrive a few minutes before your first session.'}</p><Link to="/" className="button button--secondary button--wide">Book another game</Link></aside></div>
  </main>
}
export default BookingStatusPage
