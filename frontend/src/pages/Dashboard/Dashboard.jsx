import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector, useAsyncStatus } from '../../app/hooks.js'
import {
  addGame,
  loadGames,
  removeGame,
  startGameFlow,
  stopGameFlow,
  goToNextQuestion,
  selectGames,
  selectGamesError,
  selectGamesState,
  selectGamesStatus,
} from '../../features/games/gamesSlice.js'
import styles from './Dashboard.module.css'

const PlusIcon = () => (
  <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.7" />
    <path stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M12 8v8M8 12h8" />
  </svg>
)

const TrashIcon = () => (
  <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <path
      d="M6 8.5h12l-.8 9.6a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 8.5Zm3.5-2.5V4.7A1.7 1.7 0 0 1 11.2 3h1.6a1.7 1.7 0 0 1 1.7 1.7V6h4.4M5 6h14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function Dashboard() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const games = useAppSelector(selectGames)
  const gamesState = useAppSelector(selectGamesState)
  const loadStatus = useAppSelector(selectGamesStatus)
  const globalError = useAppSelector(selectGamesError)
  const { isLoading, isError } = useAsyncStatus(loadStatus)

  const [name, setName] = useState('')
  const [localError, setLocalError] = useState(null)
  const [pendingGameId, setPendingGameId] = useState(null)

  useEffect(() => {
    if (loadStatus === 'idle') {
      dispatch(loadGames())
    }
  }, [dispatch, loadStatus])

  const handleCreate = (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setLocalError('Введите название квиза')
      return
    }
    setLocalError(null)
    dispatch(addGame(trimmed)).unwrap().then(() => setName('')).catch((error) => {
      setLocalError(error ?? 'Не удалось создать квиз')
    })
  }

  const handleDelete = (id) => {
    dispatch(removeGame(id))
  }

  const handleStart = (game) => {
    setLocalError(null)
    setPendingGameId(game.id)
    dispatch(startGameFlow({ gameId: game.id }))
      .unwrap()
      .catch((error) => {
        setLocalError(error ?? 'Не удалось запустить игру')
      })
      .finally(() => {
        setPendingGameId(null)
      })
  }

  const handleStop = (game) => {
    setLocalError(null)
    setPendingGameId(game.id)
    dispatch(stopGameFlow(game.id))
      .unwrap()
      .catch((error) => {
        setLocalError(error ?? 'Не удалось остановить игру')
      })
      .finally(() => {
        setPendingGameId(null)
      })
  }

  const handleNextQuestion = (game) => {
    setLocalError(null)
    setPendingGameId(game.id)
    dispatch(goToNextQuestion(game.id))
      .unwrap()
      .catch((error) => {
        setLocalError(error ?? 'Не удалось переключить вопрос')
      })
      .finally(() => {
        setPendingGameId(null)
      })
  }

  const totalPages = useMemo(() => {
    if (gamesState.limit <= 0) {
      return 1
    }
    return Math.max(1, Math.ceil(gamesState.total / gamesState.limit))
  }, [gamesState.total, gamesState.limit])

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Квизы и игры</h1>
          <p>Создавайте новые квизы и управляйте существующими.</p>
        </div>
      </header>

      <form className={styles.form} onSubmit={handleCreate}>
        <label className={styles.field}>
          <span>Название нового квиза</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Фронтенд разработка — модуль 1"
          />
        </label>
        {(localError || globalError) && (
          <div className={styles.error}>{localError ?? globalError}</div>
        )}
        <button type="submit" className={styles.createButton}>
          <PlusIcon />
          Создать квиз
        </button>
      </form>

      <section className={styles.listSection}>
        <div className={styles.listHeader}>
          <h2>Все квизы</h2>
          <span className={styles.totalBadge}>{gamesState.total}</span>
        </div>

        {isLoading && (
          <div className={styles.stateBox}>Загружаем список квизов…</div>
        )}

        {isError && !isLoading && (
          <div className={styles.stateBox}>Не удалось загрузить квизы. Попробуйте обновить страницу.</div>
        )}

        {!isLoading && !isError && games.length === 0 && (
          <div className={styles.stateBox}>
            Пока нет ни одного квиза. Создайте первый, используя форму выше.
          </div>
        )}

        {!isLoading && !isError && games.length > 0 && (
          <div className={styles.list}>
            {games.map((game) => (
              <article
                key={game.id}
                className={`${styles.card} ${
                  game.status === 'running'
                    ? styles.cardRunning
                    : game.status === 'finished'
                    ? styles.cardFinished
                    : ''
                }`}
              >
                <div className={styles.cardInfo}>
                  <div className={styles.cardHeaderRow}>
                    <h3>{game.name}</h3>
                    <span className={`${styles.statusBadge} ${styles[`status_${game.status}`]}`}>
                      {game.status === 'running'
                        ? 'В процессе'
                        : game.status === 'finished'
                        ? 'Завершена'
                        : 'Черновик'}
                    </span>
                  </div>
                  <span className={styles.cardMeta}>
                    Создано{' '}
                    {new Intl.DateTimeFormat('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(game.created_at))}
                  </span>
                </div>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => navigate(`/admin/game/${game.id}`)}
                    disabled={pendingGameId === game.id}
                  >
                    Вопросы
                  </button>
                  {game.status !== 'running' ? (
                    <button
                      type="button"
                      className={styles.successButton}
                      onClick={() => handleStart(game)}
                      disabled={pendingGameId === game.id}
                    >
                      Запустить
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.warningButton}
                      onClick={() => handleStop(game)}
                      disabled={pendingGameId === game.id}
                    >
                      Остановить
                    </button>
                  )}
                  {game.status === 'running' && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => handleNextQuestion(game)}
                      disabled={pendingGameId === game.id}
                    >
                      Следующий вопрос
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => handleDelete(game.id)}
                    disabled={game.status === 'running' || pendingGameId === game.id}
                  >
                    <TrashIcon />
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className={styles.pagination}>
        <span>
          Страница {gamesState.page} из {totalPages}
        </span>
      </footer>
      {localError && <div className={styles.toastError}>{localError}</div>}
    </div>
  )
}

export default Dashboard

