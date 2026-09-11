import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import Logo from '../components/Logo'
import HomePage from '../pages/HomePage'
import GameBookingPage from '../pages/GameBookingPage'
import BookingReviewPage from '../pages/BookingReviewPage'
import BookingStatusPage from '../pages/BookingStatusPage'
import AdminPage from '../pages/AdminPage'
import AdminLoginPage from '../pages/AdminLoginPage'
import ProtectedAdminRoute from '../components/ProtectedAdminRoute'

function AppLayout() {
  const location = useLocation()
  const isAdminPage = location.pathname.startsWith('/admin')

  return (
    <div className={`app-wrapper ${isAdminPage ? 'app-wrapper--admin' : 'app-wrapper--customer'}`}>
        <header className="topbar">
          <div className="topbar__left">
            <Link to="/" className="topbar__brand" aria-label="Go to home page">
              <Logo compact />
            </Link>
          </div>

          <nav className="topbar__nav" aria-label="Main navigation">
            {!isAdminPage && (
              <Link to="/admin" className="topbar__link">
                Reception
              </Link>
            )}
            {isAdminPage && (
              <Link to="/" className="topbar__link">
                Book games
              </Link>
            )}
          </nav>
        </header>

        <div className="page-wrapper">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/book/:game" element={<GameBookingPage />} />
            <Route path="/booking/review" element={<BookingReviewPage />} />
            <Route path="/booking/:reference" element={<BookingStatusPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route element={<ProtectedAdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </div>
    </div>
  )
}

function AppRouter() {
  return <BrowserRouter><AppLayout /></BrowserRouter>
}

export default AppRouter
