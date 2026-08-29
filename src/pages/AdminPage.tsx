import { useMemo, useState } from 'react'
import { bookingRepository } from '../services/bookingRepository'
import type { BookingGroup, BookingStatus } from '../domain/types'

const STATUS_FILTERS = ['All', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]

function getGroupStatus(group: BookingGroup): BookingStatus {
  if (group.reservations.some((reservation) => reservation.status === 'CONFIRMED')) {
    return 'CONFIRMED'
  }

  if (group.reservations.some((reservation) => reservation.status === 'CANCELLED')) {
    return 'CANCELLED'
  }

  if (group.reservations.some((reservation) => reservation.status === 'COMPLETED')) {
    return 'COMPLETED'
  }

  return 'PENDING_PAYMENT'
}

function AdminPage() {
  const [filter, setFilter] = useState<StatusFilter>('All')
  const [search, setSearch] = useState('')
  const groups = bookingRepository.getAllGroups()

  const visibleGroups = useMemo(() => {
    return groups.filter((group) => {
      const status = getGroupStatus(group)
      const matchesFilter = filter === 'All' || status === filter
      const haystack = `${group.customerName} ${group.bookingReference}`.toLowerCase()
      const matchesSearch = haystack.includes(search.toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [filter, groups, search])

  const handleConfirmPayment = (groupId: string) => {
    const group = bookingRepository.getAllGroups().find((item) => item.id === groupId)

    if (!group) {
      return
    }

    bookingRepository.updateGroup({
      ...group,
      paymentState: 'PAID',
      reservations: group.reservations.map((reservation) => ({
        ...reservation,
        status: 'CONFIRMED',
      })),
    })
  }

  const handleCancel = (groupId: string) => {
    const group = bookingRepository.getAllGroups().find((item) => item.id === groupId)

    if (!group) {
      return
    }

    bookingRepository.updateGroup({
      ...group,
      reservations: group.reservations.map((reservation) => ({
        ...reservation,
        status: 'CANCELLED',
        resourceId: null,
      })),
    })
  }

  return (
    <div className="page-shell admin-page">
      <header className="section-header">
        <div>
          <p className="eyebrow">Reception tools</p>
          <h1>Admin dashboard</h1>
        </div>
        <p className="note-text">No authentication yet. This will be added later.</p>
      </header>

      <div className="tool-bar">
        <select value={filter} onChange={(event) => setFilter(event.target.value as StatusFilter)}>
          {STATUS_FILTERS.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by customer name or reference"
        />
      </div>

      <div className="admin-list">
        {visibleGroups.length === 0 ? (
          <p className="empty-state">No bookings match the current filters.</p>
        ) : null}

        {visibleGroups.map((group) => {
          const status = getGroupStatus(group)

          return (
            <article className="admin-card" key={group.id}>
              <div className="admin-card__top">
                <div>
                  <p className="eyebrow">{group.bookingReference}</p>
                  <h2>{group.customerName}</h2>
                </div>
                <span className="status-badge status-badge--pending">{status}</span>
              </div>

              <div className="admin-card__rows">
                <span>Games: {group.reservations.map((reservation) => reservation.gameType).join(', ')}</span>
                <span>Times: {group.reservations.map((reservation) => `${reservation.date} ${reservation.startTime}`).join(' · ')}</span>
                <span>Total: {group.totalPrice} DKK</span>
                <span>Deadline: {group.paymentDeadline}</span>
              </div>

              <div className="admin-card__actions">
                <button type="button" className="primary-button" onClick={() => handleConfirmPayment(group.id)}>
                  Confirm payment
                </button>
                <button type="button" className="secondary-button" onClick={() => handleCancel(group.id)}>
                  Cancel
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default AdminPage
