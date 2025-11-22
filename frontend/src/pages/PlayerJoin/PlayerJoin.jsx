import { useEffect, useMemo, useCallback, useState } from 'react'
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
import resolveImageUrl from '../../utils/resolveImageUrl.js'
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

  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const gameIdFromUrl = searchParams.get('gameId') || ''

  const [form, setForm] = useState({
    username: '',
    groupName: '',
  })

  const avatarPalette = useMemo(
    () => ['5A6FF1', 'FF7F57', '33B679', 'A65DEB', 'FFBA08', '00B4D8'],
    [],
  )

  const pickAvatarColor = useCallback(
    (value) => {
      const source = value || ''
      if (!source) {
        return avatarPalette[0]
      }
      const hash = [...source].reduce((acc, char) => acc + char.charCodeAt(0), 0)
      return avatarPalette[hash % avatarPalette.length]
    },
    [avatarPalette],
  )

  const getPlayerAvatarUrl = useCallback(
    (profile) => {
      if (!profile) {
        return ''
      }
      const candidate =
        profile.avatarUrl ||
        profile.avatar ||
        profile.photoUrl ||
        profile.imageUrl ||
        profile.image ||
        null
      if (candidate) {
        return resolveImageUrl(candidate)
      }
      const nameValue = profile.username || profile.name || 'Player'
      const background = pickAvatarColor(nameValue)
      return `https://ui-avatars.com/api/?bold=true&name=${encodeURIComponent(
        nameValue,
      )}&background=${background}&color=ffffff&size=128`
    },
    [pickAvatarColor],
  )

  const playerAvatarUrl = useMemo(() => getPlayerAvatarUrl(player), [player, getPlayerAvatarUrl])

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
    
    if (!gameIdFromUrl) {
      // Показываем сообщение, что нужно отсканировать QR-код
      return
    }
    
    const trimmed = {
      gameId: gameIdFromUrl.trim(),
      username: form.username.trim(),
      groupName: form.groupName.trim(),
    }
    
    if (!trimmed.username) {
      return
    }
    
    dispatch(joinGame(trimmed))
  }

  const handleReset = () => {
    dispatch(resetPlayer())
  }

  const joinSteps = useMemo(
    () => [
      {
        title: 'Отсканируйте QR-код',
        description: 'Ведущий показывает QR-код, который нужно отсканировать.',
      },
      {
        title: 'Введите имя',
        description: 'Введите своё имя и группу (если нужно).',
      },
      {
        title: 'Ожидайте старт',
        description: 'После подключения вы увидите вопросы автоматически.',
      },
    ],
    [],
  )

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.heading}>
          <QRIcon />
          <h1>Подключение к игре</h1>
          <p>
            Отсканируйте QR-код, который показал ведущий, и введите своё имя. После входа
            вопросы будут появляться автоматически.
          </p>
        </div>

        <div className={styles.steps}>
          {joinSteps.map((step, index) => (
            <div key={step.title} className={styles.stepItem}>
              <span className={styles.stepBadge}>{index + 1}</span>
              <div className={styles.stepContent}>
                <span className={styles.stepTitle}>{step.title}</span>
                <span className={styles.stepDescription}>{step.description}</span>
              </div>
            </div>
          ))}
        </div>

        {!gameIdFromUrl ? (
          <div className={styles.error}>
            Чтобы подключиться к игре, отсканируйте QR-код, который показал ведущий.
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {gameIdFromUrl && (
              <div className={styles.gameIdInfo}>
                <span>Подключение к игре №{gameIdFromUrl}</span>
              </div>
            )}

            <label className={styles.field}>
              <span>Имя</span>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="Как к вам обращаться"
                required
                disabled={isLoading}
                autoFocus
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

            <button type="submit" className={styles.primaryButton} disabled={isLoading || !gameIdFromUrl}>
              {isLoading ? 'Подключаем...' : 'Подключиться'}
            </button>
          </form>
        )}

        {isSuccess && !player && (
          <div className={styles.infoBox}>
            Если не произошло перехода автоматически, обновите страницу или повторите ввод.
          </div>
        )}

        {player && (
          <div className={styles.successBox}>
            <h2>Вы подключены!</h2>
            <p>
              Ожидайте, пока ведущий запустит вопрос. Вы будете видеть варианты ответов на этой
              странице и сможете отвечать напрямую.
            </p>
            <div className={styles.playerProfile}>
              <div className={styles.avatarRing}>
                <img
                  src={playerAvatarUrl}
                  alt={player.username ? `Профиль ${player.username}` : 'Профиль игрока'}
                  loading="lazy"
                />
              </div>
              <div className={styles.playerInfo}>
                <span className={styles.playerName}>{player.username}</span>
                <span className={styles.playerGroup}>{player.groupName || 'Без группы'}</span>
                <span className={styles.playerId}>ID игрока: {player.id}</span>
              </div>
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

