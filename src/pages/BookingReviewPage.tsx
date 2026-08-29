import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBookingGroup } from '../domain/booking-engine'
import { bookingRepository } from '../services/bookingRepository'

import type { GameType } from '../domain/types'

type DraftSelection = {
  gameType: GameType
  date: string
  times: string[]
  quantity: number
}

function BookingReviewPage() {
  const navigate = useNavigate()
  const draftRaw = sessionStorage.getItem('next-games-draft')
  const draft = draftRaw ? (JSON.parse(draftRaw) as DraftSelection) : null
  const [customerName, setCustomerName] = useState('')
  const [error, setError] = useState('')

  const reservations = useMemo(() => {
    if (!draft) {
      return []
    }

    return draft.times.map((time) => ({
      gameType: draft.gameType,
      date: draft.date,
      time,
    }))
  }, [draft])

  const total = useMemo(
    () => reservations.reduce((sum) => sum + 60, 0),
    [reservations],
  )

  if (!draft) {
    return (
      <div className="page-shell">
        <h1>Booking not found</h1>
        <p>Please start a new reservation from the home page.</p>
      </div>
    )
  }

  const handleSubmit = () => {
    if (!customerName.trim()) {
      setError('Please enter your name before confirming the booking.')
      return
    }

    const existingGroups = bookingRepository.getAllGroups()
    const allReservations = bookingRepository.flattenReservations()

    try {
      const group = createBookingGroup({
        customerName,
        reservationInputs: reservations,
        existingGroups,
        allReservations,
      })

      bookingRepository.saveGroup(group)
      sessionStorage.removeItem('next-games-draft')
      navigate(`/booking/${group.bookingReference}`)
    } catch (bookingError) {
      setError((bookingError as Error).message)
    }
  }

  return (
    <div className="page-shell review-page">
      <header className="section-header">
        <div>
          <p className="eyebrow">Review booking</p>
          <h1>Confirm your reservation</h1>
        </div>
      </header>

      <div className="review-layout">
        <div className="review-panel">
          <h2>Your selected sessions</h2>
          {reservations.map((reservation, index) => (
            <div className="reservation-row" key={`${reservation.date}-${reservation.time}-${index}`}>
              <div>
                <strong>{draft.gameType}</strong>
                <p>{reservation.date} · {reservation.time}</p>
              </div>
              <span>60 DKK</span>
            </div>
          ))}

          <div className="review-total">
            <span>Total</span>
            <strong>{total} DKK</strong>
          </div>
        </div>

        <div className="review-panel">
          <label className="field-label">
            Name
            <input
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Enter your name"
            />
          </label>

          <div className="payment-box">
            <h3>Payment instructions</h3>
            <p>Pay at reception/bar before the payment deadline. Your booking stays pending until payment is confirmed.</p>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="button" className="primary-button" onClick={handleSubmit}>
            Confirm booking
          </button>
        </div>
      </div>
    </div>
  )
}

export default BookingReviewPage
