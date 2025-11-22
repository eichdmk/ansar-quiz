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
import { useSocket } from '../../app/SocketProvider.jsx'
import { startQuestion } from '../../api/games.js'
import { evaluateAnswer, skipPlayerByAdmin } from '../../api/playerAnswers.js'
import CreateGameForm from './components/CreateGameForm.jsx'
import GameCard from './components/GameCard.jsx'
import { useGameStats } from './hooks/useGameStats.js'
import { useGameQueue } from './hooks/useGameQueue.js'
import { useDashboardSocketHandlers } from './hooks/useDashboardSocketHandlers.js'
import styles from './Dashboard.module.css'

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
  const trackedGameIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)

  // Кастомные хуки для управления состоянием
  const {
    answerStats,
    refreshPlayers,
    resetAnswers,
    clearStatsForGame,
    updateAnswerStats,
    setAnswerStats,
  } = useGameStats()

  const {
    queues,
    currentQuestions,
    refreshQueue: refreshQueueBase,
    updateQueue,
    setCurrentQuestion,
    setQueues,
    setCurrentQuestions,
  } = useGameQueue()

  // Используем refreshQueueBase напрямую
  const refreshQueue = refreshQueueBase

  // Используем хук для обработки socket событий
  useDashboardSocketHandlers({
    socket,
    dispatch,
    refreshPlayers,
    resetAnswers,
    clearStatsForGame,
    refreshQueue,
    updateAnswerStats,
    updateQueue,
    setCurrentQuestion,
    trackedGameIdsRef,
  })

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  // Присоединение к комнатам активных игр и выход из завершенных
  useEffect(() => {
    if (!socket) {
      return
    }

    if (!socket.connected) {
      socket.connect()
    }

    const activeGames = games.filter(
      (game) => game.status === 'running' || game.status === 'ready',
    )
    const activeGameIds = new Set(activeGames.map((game) => Number(game.id)))

    // Присоединяемся к комнатам активных игр как администратор
    activeGames.forEach((game) => {
      const gameId = Number(game.id)
      socket.emit('join:game', {
        gameId,
        role: 'admin',
      })
    })

    // Выходим из комнат завершенных игр
    const allGameIds = new Set(games.map((game) => Number(game.id)))
    const finishedGameIds = Array.from(allGameIds).filter((id) => !activeGameIds.has(id))

    return () => {
      // При размонтировании выходим из всех комнат
      activeGameIds.forEach((gameId) => {
        socket.emit('leave:game', { gameId })
      })
      finishedGameIds.forEach((gameId) => {
        socket.emit('leave:game', { gameId })
      })
    }
  }, [socket, games])

  // Инициализация статистики для активных игр
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
      if (game.status === 'running') {
        refreshQueue(game.id)
      }
    })
  }, [games, refreshPlayers, refreshQueue, setAnswerStats])

  useEffect(() => {
    if (loadStatus === 'idle') {
      dispatch(loadGames())
    }
  }, [dispatch, loadStatus])

  // Загружаем очередь для запущенных игр
  useEffect(() => {
    games.forEach((game) => {
      if (game.status === 'running') {
        refreshQueue(game.id)
      }
    })
  }, [games, refreshQueue])

  const handleEvaluateAnswer = useCallback(
    async (gameId, playerId, questionId, isCorrect) => {
      setPendingGameId(gameId)
      try {
        await evaluateAnswer({ playerId, questionId, isCorrect })
      } catch (error) {
        setLocalError(error?.response?.data?.message ?? error?.message ?? 'Не удалось оценить ответ')
        await refreshQueue(gameId)
      } finally {
        setTimeout(() => {
          setPendingGameId(null)
        }, 300)
      }
    },
    [refreshQueue],
  )

  const handleSkipPlayer = useCallback(
    async (gameId, playerId, questionId) => {
      setPendingGameId(gameId)
      try {
        await skipPlayerByAdmin({ playerId, questionId })
      } catch (error) {
        setLocalError(error?.response?.data?.message ?? error?.message ?? 'Не удалось пропустить игрока')
        await refreshQueue(gameId)
      } finally {
        setTimeout(() => {
          setPendingGameId(null)
        }, 300)
      }
    },
    [refreshQueue],
  )

  const handleCreate = (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setLocalError('Введите название квиза')
      return
    }
    setLocalError(null)
    dispatch(addGame(trimmed))
      .unwrap()
      .then(() => setName(''))
      .catch((error) => {
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

      <CreateGameForm
        name={name}
        error={localError}
        globalError={globalError}
        onChange={(event) => setName(event.target.value)}
        onSubmit={handleCreate}
      />

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
              <GameCard
                key={game.id}
                game={game}
                answerStats={answerStats}
                currentQuestions={currentQuestions}
                queues={queues}
                pendingGameId={pendingGameId}
                navigate={navigate}
                onEvaluateAnswer={handleEvaluateAnswer}
                onSkipPlayer={handleSkipPlayer}
                onOpen={handleOpen}
                onLaunch={handleLaunch}
                onCancelLobby={handleCancelLobby}
                onStop={handleStop}
                onStartQuestion={handleStartQuestion}
                onNextQuestion={handleNextQuestion}
                onRestart={handleRestart}
                onDelete={handleDelete}
              />
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
