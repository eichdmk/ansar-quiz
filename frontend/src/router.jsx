import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from './App.jsx'
import AdminLogin from './pages/AdminLogin/AdminLogin.jsx'
import AdminLayout from './layouts/AdminLayout/AdminLayout.jsx'
import Dashboard from './pages/Dashboard/Dashboard.jsx'
import GameQuestions from './pages/GameQuestions/GameQuestions.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import PlayerJoin from './pages/PlayerJoin/PlayerJoin.jsx'
import PlayerPlay from './pages/PlayerPlay/PlayerPlay.jsx'
import Leaderboard from './pages/Leaderboard/Leaderboard.jsx'
import GameHistory from './pages/GameHistory/GameHistory.jsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/player',
    element: <PlayerJoin />,
  },
  {
    path: '/player/play',
    element: <PlayerPlay />,
  },
  {
    path: 'admin/leaderboard',
    element: <Leaderboard />,
  },
  {
    path: '/admin/login',
    element: <AdminLogin />,
  },
  {
    path: '/admin',
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'game/:gameId',
        element: <GameQuestions />,
      },
      {
        path: 'history',
        element: <GameHistory />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

