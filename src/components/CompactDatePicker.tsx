import { format, addDays } from 'date-fns'

function CompactDatePicker({
  value,
  onChange,
  daysAhead = 7,
}: {
  value: string
  onChange: (date: string) => void
  daysAhead?: number
}) {
  const today = new Date()
  const dates = Array.from({ length: daysAhead }, (_, i) => addDays(today, i))

  return (
    <div className="date-picker">
      <div className="date-picker__label">Date</div>
      <div className="date-picker__scroll">
        {dates.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd')
          const isSelected = dateStr === value
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onChange(dateStr)}
              className={`date-picker__day ${isSelected ? 'date-picker__day--selected' : ''}`}
            >
              <span className="date-picker__day-label">
                {format(date, 'EEE').toUpperCase()}
              </span>
              <span className="date-picker__day-number">
                {format(date, 'd')}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CompactDatePicker
