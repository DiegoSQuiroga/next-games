import { BrowserRouter, Route, Routes } from 'react-router-dom'
import HomePage from '../pages/HomePage'
import GameBookingPage from '../pages/GameBookingPage'
import BookingReviewPage from '../pages/BookingReviewPage'
import BookingStatusPage from '../pages/BookingStatusPage'
import AdminPage from '../pages/AdminPage'

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/book/:game" element={<GameBookingPage />} />
        <Route path="/booking/review" element={<BookingReviewPage />} />
        <Route path="/booking/:reference" element={<BookingStatusPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
