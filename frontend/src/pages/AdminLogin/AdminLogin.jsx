import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks.js'
import { loginAdmin, selectAuth } from '../../features/auth/authSlice'
import styles from './AdminLogin.module.css'

const LockIcon = () => (
  <svg
    className={styles.icon}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    strokeWidth="1.7"
    stroke="currentColor"
    fill="none"
  >
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.3" />
  </svg>
)

function AdminLogin() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { token, status, error } = useAppSelector(selectAuth)

  const[form, setForm] = useState({
    username: '',
    password: ''
    })

  useEffect(() => {
    if (token) {
      const redirectPath = location.state?.from ?? '/admin'
      navigate(redirectPath, { replace: true })
    }
  }, [token, navigate, location.state])

  const isLoading = status === 'loading'

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.username.trim() || !form.password.trim()) {
      return
    }
    dispatch(loginAdmin({ username: form.username.trim(), password: form.password }))
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.heading}>
          <LockIcon />
          <h1>Вход администратора</h1>
          <p>Авторизуйтесь, чтобы управлять квизами и отслеживать участников</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Логин</span>
            <input
              type="text"
              name="username"
              placeholder="Введите логин"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
              disabled={isLoading}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Пароль</span>
            <input
              type="password"
              name="password"
              placeholder="Введите пароль"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              disabled={isLoading}
              required
            />
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? 'Проверяем данные…' : 'Войти'}
          </button>
        </form>

        <div className={styles.linkBlock}>
          <span>Вернуться к описанию платформы</span>
          <Link to="/">На главную</Link>
        </div>
      </div>
    </div>
  )
}

export default AdminLogin

