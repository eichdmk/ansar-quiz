import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector, useAsyncStatus } from '../../app/hooks.js'
import {
  joinGame,
  resetPlayer,
  selectPlayer,
  selectPlayerError,
  selectPlayerStatus,
} from '../../features/player/playerSlice.js'
import { useSocket } from '../../app/SocketProvider.jsx'
import styles from './PlayerJoin.module.css'

const QRIcon = () => (
  <svg
    className={styles.icon}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    strokeWidth="1.5"
    stroke="currentColor"
    fill="none"
  >
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM14 14h6v6h-6zM4 14h6v6H4z" />
    <path d="M9 4v2M4 9h2M18 4v2M14 9h2M14 14h2M18 18v2M9 14v2M4 18h2" />
  </svg>
)

function PlayerJoin() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const player = useAppSelector(selectPlayer)
  const status = useAppSelector(selectPlayerStatus)
  const error = useAppSelector(selectPlayerError)
  const { isLoading, isSuccess } = useAsyncStatus(status)
  const socket = useSocket()

  const [form, setForm] = useState({
    gameId: '',
    username: '',
    groupName: '',
  })

  useEffect(() => {
    if (player) {
      navigate(`/player/play`, { replace: false })
    }
  }, [player, navigate])

  useEffect(() => {
    const handleGameStarted = (payload) => {
      if (player && payload.gameId === player.gameId) {
        navigate('/player/play', { replace: true })
      }
    }

    socket.on('game:started', handleGameStarted)
    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off('game:started', handleGameStarted)
    }
  }, [socket, player, navigate])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = {
      gameId: form.gameId.trim(),
      username: form.username.trim(),
      groupName: form.groupName.trim(),
    }
    if (!trimmed.gameId || !trimmed.username) {
      return
    }
    dispatch(joinGame(trimmed))
  }

  const handleReset = () => {
    dispatch(resetPlayer())
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.heading}>
          <QRIcon />
          <h1>Подключение к игре</h1>
          <p>
            Введите код игры, который показал преподаватель, а также своё имя и группу. После входа
            вопросы будут появляться автоматически.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Код игры</span>
            <input
              name="gameId"
              value={form.gameId}
              onChange={handleChange}
              placeholder="Например: 12"
              inputMode="numeric"
              required
              disabled={isLoading}
            />
          </label>

          <label className={styles.field}>
            <span>Имя</span>
            <input
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="Как к вам обращаться"
              required
              disabled={isLoading}
            />
          </label>

          <label className={styles.field}>
            <span>Группа</span>
            <input
              name="groupName"
              value={form.groupName}
              onChange={handleChange}
              placeholder="Например: FE-101 (необязательно)"
              disabled={isLoading}
            />
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.primaryButton} disabled={isLoading}>
            {isLoading ? 'Подключаем...' : 'Подключиться'}
          </button>
        </form>

        {isSuccess && !player && (
          <div className={styles.infoBox}>
            Если не произошло перехода автоматически, обновите страницу или повторите ввод.
          </div>
        )}

        {player && (
          <div className={styles.successBox}>
            <h2>Вы подключены!</h2>
            <p>
              Ожидайте, пока преподаватель запустит вопрос. Вы будете видеть варианты ответов на этой
              странице и сможете отвечать напрямую.
            </p>
            <div className={styles.playerInfo}>
              <span>{player.username}</span>
              <span>{player.groupName || 'Без группы'}</span>
              <span>ID игрока: {player.id}</span>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={handleReset}>
              Сменить пользователя
            </button>
            <Link to="/player/play" className={styles.linkToPlay}>
              Перейти к вопросам
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlayerJoin

