import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { bookingRepository } from '../services/bookingRepository'
import { formatDistanceToNowStrict, format } from 'date-fns'

function BookingStatusPage() {
  const { reference } = useParams()
  const group = useMemo(() => bookingRepository.getGroupByReference(reference ?? ''), [reference])

  if (!group) {
    return (
      <div className="page-shell">
        <h1>Booking not found</h1>
        <p>No booking could be found for this reference.</p>
      </div>
    )
  }

  const reservationList = group.reservations
  const remainingTime = formatDistanceToNowStrict(new Date(group.paymentDeadline), { addSuffix: false })

  return (
    <div className="page-shell">
      <header className="section-header">
        <div>
          <p className="eyebrow">Booking confirmation</p>
          <h1>{group.bookingReference}</h1>
        </div>
      </header>

      <div className="status-card">
        <p className="status-label">Customer</p>
        <h2>{group.customerName}</h2>
        <p>Status: {group.paymentState === 'PENDING' ? 'Reservation pending' : 'Paid'}</p>
        <p>Payment deadline: {format(new Date(group.paymentDeadline), 'yyyy-MM-dd HH:mm')}</p>
        <p>Time remaining: {remainingTime}</p>
        <p className="highlight">Pay {group.totalPrice} DKK at reception before the payment deadline.</p>
      </div>

      <div className="review-panel">
        {reservationList.map((reservation, index) => (
          <div className="reservation-row" key={`${reservation.id}-${index}`}>
            <div>
              <strong>{reservation.gameType}</strong>
              <p>{reservation.date} · {reservation.startTime}</p>
            </div>
            <span>{reservation.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BookingStatusPage
