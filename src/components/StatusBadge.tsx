import type { BookingStatus } from '../domain/types'
import { formatStatusLabel } from '../utils/formatters'

function StatusBadge({ status }: { status: BookingStatus }) {
  const statusLower = status.toLowerCase().replace('_', '-')

  return (
    <span className={`badge badge--status badge--${statusLower}`}>
      <span aria-hidden="true" className="badge__dot" />{formatStatusLabel(status)}
    </span>
  )
}

export default StatusBadge
