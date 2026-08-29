export type GameType = 'pool' | 'darts' | 'ping-pong' | 'shuffleboard'

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW'

export type ResourceId =
  | 'pool-1'
  | 'pool-2'
  | 'darts-1'
  | 'darts-2'
  | 'darts-3'
  | 'ping-pong-1'
  | 'shuffleboard-1'
  | 'shuffleboard-2'

export type PhysicalResource = {
  id: ResourceId
  gameType: GameType
  label: string
}

export type Game = {
  type: GameType
  name: string
  price: number
  resources: PhysicalResource[]
}

export type TimeSlot = {
  start: string // ISO datetime for the start of the session
  end: string // ISO datetime for the end of session
  label: string
}

export type Reservation = {
  id: string
  bookingGroupId: string
  gameType: GameType
  resourceId: ResourceId | null
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  status: BookingStatus
  customerName: string
  price: number
  createdAt: string
  paymentDeadline: string
  sessionStart: string
  sessionEnd: string
}

export type BookingGroup = {
  id: string
  bookingReference: string
  customerName: string
  reservations: Reservation[]
  totalPrice: number
  createdAt: string
  paymentDeadline: string
  paymentState: 'PENDING' | 'PAID'
}

export type BookingDraftSelection = {
  gameType: GameType
  date: string
  time: string
  quantity: 1 | 2
}
