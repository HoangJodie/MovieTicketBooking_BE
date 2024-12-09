import { createBrowserRouter, Navigate } from 'react-router-dom'
import MovieManagement from '../pages/admin/MovieManagement'
import MovieDetails from '../pages/admin/MovieDetails'
import MovieDetail from '../pages/MovieDetail'
import SeatSelection from '../pages/SeatSelection'
import BookingConfirmation from '../pages/BookingConfirmation'
import { useAuth } from '../contexts/AuthContext'
import MainLayout from '../layouts/MainLayout'
import AdminLayout from '../layouts/AdminLayout'
import PrivateRoute from '../components/PrivateRoute'

// HOC để bảo vệ route admin
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth()
  
  if (loading) {
    return <div>Loading...</div>
  }
  
  if (!user || Number(user.role_id) !== 1) {
    return <Navigate to="/" />
  }
  
  return children
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        path: 'movies/:id',
        element: <MovieDetail />
      },
      {
        path: 'booking/:showtimeId',
        element: (
          <PrivateRoute>
            <SeatSelection />
          </PrivateRoute>
        )
      },
      {
        path: 'booking/:showtimeId/confirm',
        element: (
          <PrivateRoute>
            <BookingConfirmation />
          </PrivateRoute>
        )
      }
    ]
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      {
        path: 'movies',
        element: (
          <AdminRoute>
            <MovieManagement />
          </AdminRoute>
        ),
      },
      {
        path: 'movies/:id',
        element: (
          <AdminRoute>
            <MovieDetails />
          </AdminRoute>
        ),
      },
    ]
  }
])

export default router 