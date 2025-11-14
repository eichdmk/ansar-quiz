import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector, useAsyncStatus } from '../../app/hooks.js'
import {
  addGame,
  loadGames,
  removeGame,
  startGameFlow,
  stopGameFlow,
  goToNextQuestion,
  openGameLobby,
  resetGameLobby,
  restartExistingGame,
  selectGames,
  selectGamesError,
  selectGamesState,
  selectGamesStatus,
  updateGame,
} from '../../features/games/gamesSlice.js'
import { fetchPlayers } from '../../api/players.js'
import { useSocket } from '../../app/SocketProvider.jsx'
import { startQuestion } from '../../api/games.js'
import { getQueue } from '../../api/playerAnswers.js'
import resolveImageUrl from '../../utils/resolveImageUrl.js'
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
  const socket = useSocket()
  const games = useAppSelector(selectGames)
  const gamesState = useAppSelector(selectGamesState)
  const loadStatus = useAppSelector(selectGamesStatus)
  const globalError = useAppSelector(selectGamesError)
  const { isLoading, isError } = useAsyncStatus(loadStatus)

  const [name, setName] = useState('')
  const [localError, setLocalError] = useState(null)
  const [pendingGameId, setPendingGameId] = useState(null)
  const [answerStats, setAnswerStats] = useState({})
  const [currentQuestions, setCurrentQuestions] = useState({}) // gameId -> question preview
  const [queues, setQueues] = useState({}) // gameId -> queue array
  const trackedGameIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  const refreshPlayers = useCallback(async (gameId) => {
    const normalizedId = Number(gameId)
    if (!normalizedId || Number.isNaN(normalizedId)) {
      return
    }
    try {
      const data = await fetchPlayers(normalizedId)
      if (!isMountedRef.current) {
        return
      }
      const totalPlayers = data?.items?.length ?? data?.total ?? 0
      setAnswerStats((prev) => {
        const previous = prev[normalizedId] ?? { totalPlayers: 0, answers: {} }
        return {
          ...prev,
          [normalizedId]: {
            ...previous,
            totalPlayers,
            answers: previous.answers ?? {},
          },
        }
      })
    } catch {
      // пропускаем ошибки загрузки статистики игроков
    }
  }, [])

  const resetAnswers = useCallback((gameId) => {
    const normalizedId = Number(gameId)
    if (!normalizedId || Number.isNaN(normalizedId)) {
      return
    }
    setAnswerStats((prev) => {
      const previous = prev[normalizedId]
      if (!previous) {
        return {
          ...prev,
          [normalizedId]: {
            totalPlayers: 0,
            answers: {},
          },
        }
      }
      return {
        ...prev,
        [normalizedId]: {
          ...previous,
          answers: {},
        },
      }
    })
  }, [])

  const clearStatsForGame = useCallback((gameId) => {
    const normalizedId = Number(gameId)
    if (!normalizedId || Number.isNaN(normalizedId)) {
      return
    }
    setAnswerStats((prev) => {
      if (!prev[normalizedId]) {
        return prev
      }
      const next = { ...prev }
      delete next[normalizedId]
      return next
    })
  }, [])

  useEffect(() => {
    const activeGames = games.filter(
      (game) => game.status === 'running' || game.status === 'ready',
    )
    trackedGameIdsRef.current = new Set(activeGames.map((game) => Number(game.id)))
    setAnswerStats((prev) => {
      let changed = false
      const next = {}
      activeGames.forEach((game) => {
        const key = Number(game.id)
        if (prev[key]) {
          next[key] = prev[key]
        } else {
          changed = true
        }
      })
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev
      }
      return next
    })
    activeGames.forEach((game) => {
      refreshPlayers(game.id)
    })
  }, [games, refreshPlayers])

  useEffect(() => {
    if (loadStatus === 'idle') {
      dispatch(loadGames())
    }
  }, [dispatch, loadStatus])

  useEffect(() => {
    if (!socket) {
      return undefined
    }

    const handlePlayerAnswer = (payload) => {
      const gameId = Number(payload?.gameId)
      const playerId = payload?.playerId ?? payload?.id
      if (!gameId || !playerId) {
        return
      }
      setAnswerStats((prev) => {
        const previous = prev[gameId] ?? { totalPlayers: 0, answers: {} }
        return {
          ...prev,
          [gameId]: {
            ...previous,
            answers: {
              ...previous.answers,
              [String(playerId)]: {
                isCorrect: Boolean(payload.isCorrect),
              },
            },
          },
        }
      })
    }

    const handlePlayerJoined = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      refreshPlayers(gameId)
    }

    const handlePlayerLeft = () => {
      trackedGameIdsRef.current.forEach((gameId) => {
        refreshPlayers(gameId)
      })
    }

    const handleQuestionOpened = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      resetAnswers(gameId)
      // Очищаем preview если вопрос открыт (старый формат)
      setCurrentQuestions((prev) => {
        const next = { ...prev }
        delete next[gameId]
        return next
      })
    }

    const handleGameStarted = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      refreshPlayers(gameId)
      resetAnswers(gameId)
    }

    const handleGameOpened = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      refreshPlayers(gameId)
      resetAnswers(gameId)
    }

    const handleGameFinished = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      clearStatsForGame(gameId)
    }

    const handleQuestionPreview = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      setCurrentQuestions((prev) => ({
        ...prev,
        [gameId]: payload.question,
      }))
      // Обновляем состояние игры - вопрос в preview
      dispatch(updateGame({ id: gameId, is_question_closed: true }))
    }

    const handleQueueUpdated = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      setQueues((prev) => ({
        ...prev,
        [gameId]: payload.queue || [],
      }))
    }

    const handleQuestionReady = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      // Очищаем preview когда вопрос готов
      setCurrentQuestions((prev) => {
        const next = { ...prev }
        delete next[gameId]
        return next
      })
      // Обновляем состояние игры - вопрос больше не в preview
      dispatch(updateGame({ id: gameId, is_question_closed: false }))
    }

    socket.on('player:answer', handlePlayerAnswer)
    socket.on('player:joined', handlePlayerJoined)
    socket.on('player:left', handlePlayerLeft)
    socket.on('game:questionOpened', handleQuestionOpened)
    socket.on('game:questionPreview', handleQuestionPreview)
    socket.on('game:questionReady', handleQuestionReady)
    socket.on('player:queueUpdated', handleQueueUpdated)
    socket.on('game:started', handleGameStarted)
    socket.on('game:opened', handleGameOpened)
    socket.on('game:finished', handleGameFinished)
    socket.on('game:stopped', handleGameFinished)
    socket.on('game:closed', handleGameFinished)

    return () => {
      socket.off('player:answer', handlePlayerAnswer)
      socket.off('player:joined', handlePlayerJoined)
      socket.off('player:left', handlePlayerLeft)
      socket.off('game:questionOpened', handleQuestionOpened)
      socket.off('game:questionPreview', handleQuestionPreview)
      socket.off('game:questionReady', handleQuestionReady)
      socket.off('player:queueUpdated', handleQueueUpdated)
      socket.off('game:started', handleGameStarted)
      socket.off('game:opened', handleGameOpened)
      socket.off('game:finished', handleGameFinished)
      socket.off('game:stopped', handleGameFinished)
      socket.off('game:closed', handleGameFinished)
    }
  }, [socket, refreshPlayers, resetAnswers, clearStatsForGame])

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

  const handleOpen = (game) => {
    setLocalError(null)
    setPendingGameId(game.id)
    dispatch(openGameLobby(game.id))
      .unwrap()
      .catch((error) => {
        setLocalError(error ?? 'Не удалось открыть комнату')
      })
      .finally(() => {
        setPendingGameId(null)
      })
  }

  const handleLaunch = (game) => {
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

  const handleCancelLobby = (game) => {
    setLocalError(null)
    setPendingGameId(game.id)
    dispatch(resetGameLobby(game.id))
      .unwrap()
      .catch((error) => {
        setLocalError(error ?? 'Не удалось закрыть комнату')
      })
      .finally(() => {
        setPendingGameId(null)
      })
  }

  const handleRestart = (game) => {
    setLocalError(null)
    setPendingGameId(game.id)
    dispatch(restartExistingGame(game.id))
      .unwrap()
      .catch((error) => {
        setLocalError(error ?? 'Не удалось перезапустить игру')
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

  const handleStartQuestion = async (game) => {
    setLocalError(null)
    setPendingGameId(game.id)
    try {
      await startQuestion(game.id)
      // Загружаем очередь после старта вопроса
      try {
        const queueData = await getQueue(game.id)
        setQueues((prev) => ({
          ...prev,
          [game.id]: queueData.queue || [],
        }))
      } catch {
        // Игнорируем ошибки загрузки очереди
      }
    } catch (error) {
      setLocalError(error?.response?.data?.message ?? error?.message ?? 'Не удалось запустить вопрос')
    } finally {
      setPendingGameId(null)
    }
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
            placeholder="Например: Топ 5 причин почему js лучше пайтона"
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
            {games.map((game) => {
              const stats = answerStats[Number(game.id)] ?? { totalPlayers: 0, answers: {} }
              const totalPlayersInGame = stats.totalPlayers ?? 0
              const answersRecord = stats.answers ?? {}
              const answeredCount = Object.keys(answersRecord).length
              const wrongCount = Object.values(answersRecord).filter(
                (item) => item && item.isCorrect === false,
              ).length
              const pendingCount = Math.max(totalPlayersInGame - answeredCount, 0)
              const shouldShowAnswerStats =
                game.status === 'running' && (totalPlayersInGame > 0 || answeredCount > 0)
              const currentQuestion = currentQuestions[Number(game.id)]
              const queue = queues[Number(game.id)] || []
              const isQuestionInPreview = game.status === 'running' && game.is_question_closed && currentQuestion

              return (
                <article
                  key={game.id}
                  className={`${styles.card} ${
                    game.status === 'running'
                      ? styles.cardRunning
                      : game.status === 'finished'
                        ? styles.cardFinished
                        : game.status === 'ready'
                          ? styles.cardReady
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
                            : game.status === 'ready'
                              ? 'Комната открыта'
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
                    {game.status === 'ready' && totalPlayersInGame > 0 && (
                      <div className={styles.answerStats}>
                        <span className={styles.answerStatsTitle}>Игроков в комнате</span>
                        <div className={styles.answerStatsRow}>
                          <span className={styles.answerStatsAnswered}>{totalPlayersInGame}</span>
                        </div>
                      </div>
                    )}
                    {isQuestionInPreview && (
                      <div className={styles.questionPreview}>
                        <span className={styles.answerStatsTitle}>Текущий вопрос (превью)</span>
                        <div className={styles.questionPreviewContent}>
                          <h4>{currentQuestion.text}</h4>
                          {currentQuestion.imageUrl && (
                            <div className={styles.questionPreviewImage}>
                              <img src={resolveImageUrl(currentQuestion.imageUrl)} alt="Изображение вопроса" />
                            </div>
                          )}
                          {queue.length > 0 && (
                            <div className={styles.queuePreview}>
                              <span className={styles.queueTitle}>Очередь ({queue.length}):</span>
                              <div className={styles.queueList}>
                                {queue.slice(0, 5).map((item, idx) => (
                                  <span key={item.playerId} className={styles.queueItem}>
                                    {idx + 1}. {item.username}
                                  </span>
                                ))}
                                {queue.length > 5 && <span>...</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {shouldShowAnswerStats && (
                      <div className={styles.answerStats}>
                        <span className={styles.answerStatsTitle}>Ответы текущего вопроса</span>
                        <div className={styles.answerStatsRow}>
                          <span className={styles.answerStatsWrong}>
                            Неверных: {wrongCount} из {Math.max(totalPlayersInGame, 0)}
                          </span>
                          <span className={styles.answerStatsAnswered}>
                            Ответили: {answeredCount} / {Math.max(totalPlayersInGame, 0)}
                          </span>
                          {pendingCount > 0 && (
                            <span className={styles.answerStatsPending}>
                              Не ответили: {pendingCount}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {queue.length > 0 && !isQuestionInPreview && (
                      <div className={styles.queueInfo}>
                        <span className={styles.answerStatsTitle}>Очередь ответов ({queue.length})</span>
                        <div className={styles.queueList}>
                          {queue.slice(0, 3).map((item, idx) => (
                            <span key={item.playerId} className={styles.queueItem}>
                              {idx + 1}. {item.username}
                            </span>
                          ))}
                          {queue.length > 3 && <span>...</span>}
                        </div>
                      </div>
                    )}
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
                    {game.status === 'draft' && (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => handleOpen(game)}
                        disabled={pendingGameId === game.id}
                      >
                        Открыть комнату
                      </button>
                    )}
                    {game.status === 'ready' && (
                      <button
                        type="button"
                        className={styles.successButton}
                        onClick={() => handleLaunch(game)}
                        disabled={pendingGameId === game.id}
                      >
                        Запустить
                      </button>
                    )}
                    {game.status === 'ready' && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleCancelLobby(game)}
                        disabled={pendingGameId === game.id}
                      >
                        Отменить комнату
                      </button>
                    )}
                    {game.status === 'running' && (
                      <button
                        type="button"
                        className={styles.warningButton}
                        onClick={() => handleStop(game)}
                        disabled={pendingGameId === game.id}
                      >
                        Завершить
                      </button>
                    )}
                    {game.status === 'running' && isQuestionInPreview && (
                      <button
                        type="button"
                        className={styles.successButton}
                        onClick={() => handleStartQuestion(game)}
                        disabled={pendingGameId === game.id}
                      >
                        Старт вопроса
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
                    {game.status === 'finished' && (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => handleRestart(game)}
                        disabled={pendingGameId === game.id}
                      >
                        Перезапустить игру
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
              )
            })}
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

