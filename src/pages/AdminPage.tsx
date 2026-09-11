import { authService } from '../services/authService'
import { useBookingGroups, useBookingAvailability } from '../hooks/useBookingData'
import { useMemo, useState } from 'react'
import { getAvailabilityAtTime, OPERATING_SLOT_TIMES } from '../domain/booking-engine'
import { getOperatingDate, operatingMinute } from '../domain/session-time'
import { GAME_TYPES, getGameByType } from '../domain/games'
import { bookingRepository } from '../services/bookingRepository'
import StatusBadge from '../components/StatusBadge'
import { formatDateLabel, formatDateTime, formatEndTime, formatMoney, formatStatusLabel } from '../utils/formatters'
import type { BookingGroup, BookingStatus, GameType } from '../domain/types'

type View = 'overview' | 'schedule' | 'bookings'
type Filter = 'ALL' | BookingStatus
type FormState = { customerName: string; gameType: GameType; date: string; time: string; secondGameType: GameType; secondTime: string; status: 'PENDING_PAYMENT' | 'CONFIRMED' }
const emptyForm: FormState = { customerName: '', gameType: 'pool', date: getOperatingDate(), time: '18:00', secondGameType: 'pool', secondTime: '', status: 'PENDING_PAYMENT' }

function groupStatus(group: BookingGroup): BookingStatus {
  if (group.reservations.some((r) => r.status === 'CONFIRMED')) return 'CONFIRMED'
  if (group.reservations.some((r) => r.status === 'PENDING_PAYMENT')) return 'PENDING_PAYMENT'
  return group.reservations[0]?.status ?? 'CANCELLED'
}

function AdminPage() {
  const [view, setView] = useState<View>('overview'); const [filter, setFilter] = useState<Filter>('ALL'); const [search, setSearch] = useState('')
  const [selectedSnapshot, setSelected] = useState<BookingGroup | null>(null); const [editing, setEditing] = useState<BookingGroup | 'new' | null>(null); const [form, setForm] = useState<FormState>(emptyForm); const [formError, setFormError] = useState(''); const [scheduleGame, setScheduleGame] = useState<GameType>('pool')
  const { data, loading, error, refresh } = useBookingGroups()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const selected = selectedSnapshot ? data.find(g => g.id === selectedSnapshot.id) ?? null : null
  const groups = [...data].sort((a, b) => a.paymentDeadline.localeCompare(b.paymentDeadline))
  const summary = useMemo(() => ({ ALL: groups.filter((g) => groupStatus(g) !== 'CANCELLED').length, PENDING_PAYMENT: groups.filter((g) => groupStatus(g) === 'PENDING_PAYMENT').length, CONFIRMED: groups.filter((g) => groupStatus(g) === 'CONFIRMED').length, CANCELLED: groups.filter((g) => groupStatus(g) === 'CANCELLED').length }), [groups])
  const visible = groups.filter((g) => (filter === 'ALL' ? groupStatus(g) !== 'CANCELLED' : groupStatus(g) === filter) && `${g.customerName} ${g.bookingReference}`.toLowerCase().includes(search.toLowerCase()))
  const mutate = async (group: BookingGroup, status: 'CONFIRMED' | 'CANCELLED') => {
    if (busy) return
    setBusy(true); setActionError('')
    try { await bookingRepository.setGroupStatus(group.id, status); setSelected(null); refresh() }
    catch (cause) { setActionError((cause as Error).message) } finally { setBusy(false) }
  }
  const confirm = (group: BookingGroup) => void mutate(group, 'CONFIRMED')
  const cancel = (group: BookingGroup) => void mutate(group, 'CANCELLED')
  const openForm = (group?: BookingGroup) => { setSelected(null); setEditing(group ?? 'new'); setFormError(''); setForm(group ? { customerName: group.customerName, gameType: group.reservations[0].gameType, date: group.reservations[0].date, time: group.reservations[0].startTime, secondGameType: group.reservations[1]?.gameType ?? group.reservations[0].gameType, secondTime: group.reservations[1]?.startTime ?? '', status: groupStatus(group) === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING_PAYMENT' } : { ...emptyForm, date: getOperatingDate() }) }
  const saveForm = async () => {
    if (busy) return
    setBusy(true); setFormError('')
    try {
      const old = editing === 'new' ? null : editing
      const inputs = [{ gameType: form.gameType, date: form.date, time: form.time }, ...(form.secondTime ? [{ gameType: form.secondGameType, date: form.date, time: form.secondTime }] : [])]
      await bookingRepository.saveAdminGroup({ customerName: form.customerName, reservationInputs: inputs }, old?.id ?? null, form.status)
      setEditing(null); refresh()
    } catch (cause) { setFormError((cause as Error).message) } finally { setBusy(false) }
  }

  const bookingList = <div className="booking-table-wrap"><div className="booking-table booking-table--head"><span>Ref</span><span>Customer</span><span>Game & time</span><span>Total</span><span>Deadline</span><span>Status</span><span>Actions</span></div>{visible.map((g) => <div className="booking-table" key={g.id} role="button" tabIndex={0} onClick={() => setSelected(g)} onKeyDown={(e) => e.key === 'Enter' && setSelected(g)}><span className="booking-ref">{g.bookingReference}</span><strong>{g.customerName}</strong><span>{g.reservations.map((r) => `${getGameByType(r.gameType).name} · ${r.startTime}`).join(' / ')}</span><b>{formatMoney(g.totalPrice)}</b><span>{formatDateTime(g.paymentDeadline)}</span><StatusBadge status={groupStatus(g)} /><span className="row-actions" onClick={(e) => e.stopPropagation()}>{groupStatus(g) === 'PENDING_PAYMENT' && <button disabled={busy} onClick={() => confirm(g)}>Confirm</button>}<button disabled={busy} onClick={() => openForm(g)}>Edit</button><button className="danger-link" disabled={busy} onClick={() => cancel(g)}>Cancel</button></span></div>)}{!visible.length && <div className="empty-state">No bookings match these filters.</div>}</div>

  return <main className="admin-shell"><header className="admin-titlebar"><div><p className="eyebrow">Next House · Reception</p><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><button className="button button--secondary" disabled={busy} onClick={() => void authService.signOut()}>Log out</button><button className="button button--primary" onClick={() => openForm()}>+ New booking</button></header>
    {loading && <p role="status">Loading bookings...</p>}{(error || actionError) && <p className="form-error" role="alert">{actionError || error} <button onClick={refresh}>Retry</button></p>}
    <nav className="admin-tabs" aria-label="Reception views">{(['overview', 'schedule', 'bookings'] as View[]).map((item) => <button className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
    {view !== 'schedule' && <><div className="admin-stats">{(['ALL', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED'] as Filter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}><span>{item === 'ALL' ? 'All' : formatStatusLabel(item)}</span><strong>{summary[item as keyof typeof summary]}</strong></button>)}</div><div className="admin-tools"><label><span className="sr-only">Search bookings</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or reference…" /></label><span>{visible.length} booking{visible.length === 1 ? '' : 's'}</span></div>{bookingList}</>}
    {view === 'schedule' && <Schedule groups={groups} selectedGame={scheduleGame} setSelectedGame={setScheduleGame} onSelect={setSelected} />}
    <nav className="admin-bottom" aria-label="Mobile reception navigation">{(['overview', 'schedule', 'bookings'] as View[]).map((item) => <button className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}><span aria-hidden="true">{item === 'overview' ? '⌂' : item === 'schedule' ? '▦' : '≡'}</span>{item}</button>)}<button onClick={() => openForm()}><span aria-hidden="true">＋</span>New</button></nav>
    {selected && <div className="sheet-backdrop" onMouseDown={() => setSelected(null)}><aside className="detail-sheet" onMouseDown={(e) => e.stopPropagation()} aria-label="Booking details"><button className="sheet-close" onClick={() => setSelected(null)} aria-label="Close">×</button><p className="eyebrow">Booking detail</p><h2>{selected.bookingReference}</h2><h3>{selected.customerName}</h3><StatusBadge status={groupStatus(selected)} />{actionError && <p className="form-error" role="alert">{actionError}</p>}{selected.reservations.map((r) => <div className="detail-session" key={r.id}><strong>{getGameByType(r.gameType).name}</strong><span>{formatDateLabel(r.date, r.startTime)} · {r.startTime}–{formatEndTime(r.startTime)}</span><small>{r.resourceLabel ?? 'No resource assigned'}</small></div>)}<dl><div><dt>Total</dt><dd>{formatMoney(selected.totalPrice)}</dd></div><div><dt>Deadline</dt><dd>{formatDateTime(selected.paymentDeadline)}</dd></div></dl><div className="sheet-actions">{groupStatus(selected) === 'PENDING_PAYMENT' && <button className="button button--primary" onClick={() => confirm(selected)}>Confirm payment</button>}<button className="button button--secondary" onClick={() => openForm(selected)}>Edit</button><button className="button button--danger" onClick={() => cancel(selected)}>Cancel booking</button></div></aside></div>}
    {editing && <BookingForm busy={busy} form={form} setForm={setForm} error={formError} onClose={() => setEditing(null)} onSave={saveForm} title={editing === 'new' ? 'New booking' : `Edit ${editing.bookingReference}`} />}
  </main>
}

function Schedule({ groups, selectedGame, setSelectedGame, onSelect }: { groups: BookingGroup[]; selectedGame: GameType; setSelectedGame: (g: GameType) => void; onSelect: (g: BookingGroup) => void }) {
  const today = getOperatingDate()
  const availability = useBookingAvailability(today)
  const reservations = groups.flatMap((g) => g.reservations.map((r) => ({ ...r, group: g }))).filter((r) => r.date === today && r.status !== 'CANCELLED')
  const times = [...new Set([...OPERATING_SLOT_TIMES, ...reservations.map((r) => r.startTime)])].sort((a, b) => operatingMinute(a) - operatingMinute(b))
  return <section className="schedule">{availability.error && <p className="form-error" role="alert">{availability.error}</p>}<div className="schedule-heading"><div><p className="eyebrow">Live schedule</p><h2>{formatDateLabel(today)}</h2></div><select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value as GameType)}>{GAME_TYPES.map((g) => <option value={g} key={g}>{getGameByType(g).name}</option>)}</select></div><div className="schedule-grid"><div className="schedule-grid__head">Time</div>{GAME_TYPES.map((g) => <div className="schedule-grid__head" key={g}>{getGameByType(g).name}<small>{availability.data.games.find(game => game.type === g)?.resources.length ?? '?'} resources</small></div>)}{times.map((time) => <div className="schedule-grid__row" key={time}><strong>{time}</strong>{GAME_TYPES.map((game) => { const items = reservations.filter((r) => r.startTime === time && r.gameType === game); return <div className="schedule-cell" key={game}>{items.map((r) => <button key={r.id} className={`schedule-pill schedule-pill--${r.status.toLowerCase()}`} onClick={() => onSelect(r.group)}>{r.customerName}<small>{r.startTime}?{formatEndTime(r.startTime)}</small><small>{formatStatusLabel(r.status)}</small></button>)}</div> })}</div>)}</div><div className="mobile-schedule">{times.map((time) => { const game = availability.data.games.find(g => g.type === selectedGame); const items = reservations.filter((r) => r.startTime === time && r.gameType === selectedGame); const slotAvailability = game ? getAvailabilityAtTime(selectedGame, today, time, reservations, game) : null; return <div className="mobile-slot" key={time}><div><strong>{time}</strong><span>{slotAvailability && game ? slotAvailability.available + ' / ' + game.resources.length + ' available' : 'Availability unavailable'}</span></div>{items.map((r) => <button key={r.id} onClick={() => onSelect(r.group)}><span>{r.startTime}?{formatEndTime(r.startTime)} ? {r.customerName} ? {game?.name ?? getGameByType(selectedGame).name}</span><StatusBadge status={r.status} /></button>)}</div> })}</div></section>
}

function BookingForm({ busy, form, setForm, error, onClose, onSave, title }: { busy: boolean; form: FormState; setForm: (f: FormState) => void; error: string; onClose: () => void; onSave: () => void; title: string }) {
  const field = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value })
  return <div className="sheet-backdrop" onMouseDown={onClose}><aside className="booking-form-sheet" onMouseDown={(e) => e.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">Reception booking</p><h2>{title}</h2><p className="pay-note">1-hour sessions. Any minute from 10:00 to 01:00. After midnight belongs to the next calendar day.</p><div className="form-grid"><label className="field field--full"><span className="field__label">Customer name</span><input className="field__input" value={form.customerName} onChange={(e) => field('customerName', e.target.value)} /></label><label className="field"><span className="field__label">Game</span><select className="field__input" value={form.gameType} onChange={(e) => field('gameType', e.target.value as GameType)}>{GAME_TYPES.map((g) => <option value={g} key={g}>{getGameByType(g).name}</option>)}</select></label><label className="field"><span className="field__label">Date</span><input className="field__input" type="date" value={form.date} onChange={(e) => field('date', e.target.value)} /></label><label className="field"><span className="field__label">Time</span><input className="field__input" type="time" step="60" required value={form.time} onChange={(e) => field('time', e.target.value)} /></label><label className="field"><span className="field__label">Status</span><select className="field__input" value={form.status} onChange={(e) => field('status', e.target.value as FormState['status'])}><option value="PENDING_PAYMENT">Pending payment</option><option value="CONFIRMED">Paid / confirmed</option></select></label><div className="form-divider field--full"><span>Optional second session</span></div><label className="field"><span className="field__label">Game</span><select className="field__input" value={form.secondGameType} onChange={(e) => field('secondGameType', e.target.value as GameType)}>{GAME_TYPES.map((g) => <option value={g} key={g}>{getGameByType(g).name}</option>)}</select></label><label className="field"><span className="field__label">Time</span><input className="field__input" type="time" step="60" value={form.secondTime} onChange={(e) => field('secondTime', e.target.value)} /><small>Leave blank for one session.</small></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="sheet-actions"><button className="button button--primary" disabled={busy} onClick={onSave}>{busy ? 'Saving...' : 'Save booking'}</button><button className="button button--secondary" onClick={onClose}>Cancel</button></div></aside></div>
}
export default AdminPage
