import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks.js'
import { logout, selectAuth } from '../../features/auth/authSlice.js'
import styles from './AdminLayout.module.css'

const LogoIcon = () => (
  <svg
    className={styles.logoMark}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    strokeWidth="1.8"
    stroke="currentColor"
    fill="none"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7.5 4.5v9L12 21 4.5 16.5v-9L12 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9l3.5 2-3.5 2-3.5-2 3.5-2z" />
  </svg>
)

function AdminLayout() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { admin } = useAppSelector(selectAuth)

  const handleLogout = () => {
    dispatch(logout())
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <LogoIcon />
          <div className={styles.brandInfo}>
            <span className={styles.brandTitle}>Ansar Quiz</span>
            <span className={styles.brandSubtitle}>панель администратора</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
            }
          >
            Квизы
          </NavLink>
          <NavLink
            to="/admin/players"
            className={({ isActive }) =>
              isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
            }
          >
            Участники
          </NavLink>
          <NavLink
            to="/admin/leaderboard"
            className={({ isActive }) =>
              isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
            }
          >
            Лидерборд
          </NavLink>
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{admin?.username ?? 'Администратор'}</span>
            <span className={styles.userRole}>главный ведущий викторин</span>
          </div>
          <button type="button" className={styles.logoutButton} onClick={handleLogout}>
            Выйти
          </button>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout

