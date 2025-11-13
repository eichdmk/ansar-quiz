import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks.js'
import { selectPlayer, resetPlayer } from '../../features/player/playerSlice.js'
import { useSocket } from '../../app/SocketProvider.jsx'
import { submitAnswer } from '../../api/playerAnswers.js'
import { fetchCurrentQuestion } from '../../api/games.js'
import resolveImageUrl from '../../utils/resolveImageUrl.js'
import styles from './PlayerPlay.module.css'

const LightningIcon = () => (
  <svg
    className={styles.icon}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    strokeWidth="1.5"
    stroke="currentColor"
    fill="none"
  >
    <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
  </svg>
)

function PlayerPlay() {
  const player = useAppSelector(selectPlayer)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const socket = useSocket()

  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(null)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Ожидайте запуск игры')
  const [gameFinished, setGameFinished] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [sending, setSending] = useState(false)
  const [questionClosed, setQuestionClosed] = useState(false)
  const [attemptLocked, setAttemptLocked] = useState(false)
  const [countdownValue, setCountdownValue] = useState(null)
  const countdownAudioRef = useRef({
    context: null,
    lastValue: null,
    disabled: false,
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
    if (!player) {
      navigate('/player', { replace: true })
    }
  }, [player, navigate])

  const applyQuestion = useCallback((payload) => {
    if (!payload) {
      return
    }
    setCurrentQuestion(payload.question)
    setQuestionIndex(payload.index)
    setTotalQuestions(payload.total ?? 0)
    setStatusMessage('Выберите ответ')
    setSelectedAnswer(null)
    setError(null)
    setGameFinished(false)
    setLoading(false)
    setQuestionClosed(Boolean(payload.isClosed))
    setAttemptLocked(Boolean(payload.isClosed))
    setCountdownValue(null)
  }, [])

  const completeGame = useCallback((message) => {
    setStatusMessage(message)
    setGameFinished(true)
    setCurrentQuestion(null)
    setQuestionIndex(null)
    setSelectedAnswer(null)
    setQuestionClosed(true)
    setAttemptLocked(true)
    setCountdownValue(null)
  }, [])

  const loadCurrentState = useCallback(() => {
    if (!player) {
      return
    }
    setLoading(true)
    fetchCurrentQuestion(player.gameId)
      .then((data) => {
        if (data.status === 'running' && data.question) {
          applyQuestion({
            question: data.question,
            index: data.index,
            total: data.total,
            isClosed: data.isClosed,
          })
        } else if (data.status === 'finished') {
          setLoading(false)
          completeGame('Игра завершена ведущим')
        } else if (data.status === 'ready') {
          setLoading(false)
          setCurrentQuestion(null)
          setQuestionIndex(null)
          setTotalQuestions(data?.total ?? 0)
          setStatusMessage('Комната открыта. Ожидайте старт')
          setQuestionClosed(true)
          setAttemptLocked(true)
          setCountdownValue(null)
        } else if (data.status === 'draft') {
          setLoading(false)
          setCurrentQuestion(null)
          setQuestionIndex(null)
          setTotalQuestions(data?.total ?? 0)
          setStatusMessage('Ожидайте приглашение от ведущего')
          setQuestionClosed(true)
          setAttemptLocked(true)
          setCountdownValue(null)
        } else {
          setLoading(false)
          setCurrentQuestion(null)
          setQuestionIndex(null)
          setTotalQuestions(data?.total ?? 0)
          setStatusMessage('Ожидайте запуск игры')
          setQuestionClosed(Boolean(data?.isClosed))
          setAttemptLocked(Boolean(data?.isClosed))
          setCountdownValue(null)
        }
      })
      .catch((err) => {
        setLoading(false)
        setError(err?.message ?? 'Не удалось загрузить текущий вопрос')
      })
  }, [player, applyQuestion, completeGame])

  const getOrCreateAudioContext = useCallback(() => {
    if (typeof window === 'undefined' || countdownAudioRef.current.disabled) {
      return null
    }
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) {
      countdownAudioRef.current.disabled = true
      return null
    }
    let context = countdownAudioRef.current.context
    if (!context) {
      context = new AudioContextConstructor()
      countdownAudioRef.current.context = context
      const resumeContext = () => {
        if (context.state === 'suspended') {
          context.resume().catch(() => {})
        }
      }
      const resumeEvents = ['click', 'touchstart', 'keydown']
      resumeEvents.forEach((eventName) => {
        window.addEventListener(eventName, resumeContext, { once: true })
      })
    }
    if (context.state === 'suspended') {
      context.resume().catch(() => {})
    }
    return context
  }, [])

  const playCountdownTone = useCallback(
    (value) => {
      if (typeof value !== 'number' || value < 0) {
        return
      }
      if (countdownAudioRef.current.lastValue === value) {
        return
      }
      const context = getOrCreateAudioContext()
      if (!context) {
        return
      }
      countdownAudioRef.current.lastValue = value
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()
      const now = context.currentTime
      const duration = value === 0 ? 0.5 : 0.3
      const frequencyBase = value === 0 ? 880 : 600
      const frequencyStep = 120
      const frequency = frequencyBase + Math.max(0, 5 - value) * frequencyStep

      gainNode.gain.setValueAtTime(0.0001, now)
      gainNode.gain.exponentialRampToValueAtTime(0.5, now + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration)

      oscillator.type = 'sawtooth'
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.connect(gainNode)
      gainNode.connect(context.destination)

      oscillator.start(now)
      oscillator.stop(now + duration)
      oscillator.onended = () => {
        oscillator.disconnect()
        gainNode.disconnect()
      }
    },
    [getOrCreateAudioContext],
  )

  useEffect(() => {
    if (countdownValue === null) {
      countdownAudioRef.current.lastValue = null
      return
    }
    if (typeof countdownValue === 'number' && countdownValue >= 0) {
      playCountdownTone(countdownValue)
    }
  }, [countdownValue, playCountdownTone])

  useEffect(
    () => () => {
      const { context } = countdownAudioRef.current
      if (context && typeof context.close === 'function') {
        context.close().catch(() => {})
      }
      countdownAudioRef.current.context = null
      countdownAudioRef.current.lastValue = null
    },
    [],
  )

  useEffect(() => {
    loadCurrentState()
  }, [loadCurrentState])

  useEffect(() => {
    if (!player) {
      return () => { }
    }

    const handleQuestionOpened = (payload) => {
      if (payload.gameId === player.gameId) {
        applyQuestion(payload)
      }
    }

    const handleGameFinished = (payload) => {
      if (payload.gameId === player.gameId) {
        completeGame('Игра завершена!')
      }
    }

    const handleGameOpened = (payload) => {
      if (payload.gameId !== player.gameId) {
        return
      }
      if (typeof payload.total === 'number') {
        setTotalQuestions(payload.total)
      }
      setCurrentQuestion(null)
      setQuestionIndex(null)
      setStatusMessage('Комната открыта. Ожидайте старт')
      setCountdownValue(null)
      setSelectedAnswer(null)
      setQuestionClosed(true)
      setAttemptLocked(true)
      setGameFinished(false)
    }

    const handleCountdown = (payload) => {
      if (payload.gameId !== player.gameId) {
        return
      }
      setCountdownValue(payload.value)
      if (payload.value > 0) {
        setStatusMessage(`Старт через ${payload.value}`)
      } else {
        setStatusMessage('Поехали!')
      }
      setCurrentQuestion(null)
      setQuestionIndex(null)
      setSelectedAnswer(null)
      setQuestionClosed(true)
      setAttemptLocked(true)
      setGameFinished(false)
    }

    const handleGameClosed = (payload) => {
      if (payload.gameId !== player.gameId) {
        return
      }
      setCountdownValue(null)
      setStatusMessage('Комната закрыта. Ожидайте приглашение')
      setCurrentQuestion(null)
      setQuestionIndex(null)
      setSelectedAnswer(null)
      setGameFinished(false)
      setQuestionClosed(true)
      setAttemptLocked(true)
    }

    const handleQuestionClosed = (payload) => {
      if (payload.gameId !== player.gameId) {
        return
      }
      setQuestionClosed(true)
      setSelectedAnswer(null)
      setAttemptLocked(true)
      setCountdownValue(null)
      if (payload.winner?.id === player.id) {
        setStatusMessage('Вы были первым! Балл начислен.')
      } else {
        setStatusMessage('Кто-то уже ответил правильно. Ждём новый вопрос.')
      }
    }

    const handleGameStarted = (payload) => {
      if (payload.gameId === player.gameId) {
        if (typeof payload.total === 'number') {
          setTotalQuestions(payload.total)
        }
        if (!payload.question) {
          setStatusMessage('Игра началась. Ожидайте первый вопрос')
          setCurrentQuestion(null)
          setQuestionIndex(null)
          setSelectedAnswer(null)
          setGameFinished(false)
          setQuestionClosed(true)
          setAttemptLocked(true)
          setCountdownValue(null)
        }
      }
    }

    socket.on('game:questionOpened', handleQuestionOpened)
    socket.on('game:finished', handleGameFinished)
    socket.on('game:questionClosed', handleQuestionClosed)
    socket.on('game:started', handleGameStarted)
    socket.on('game:opened', handleGameOpened)
    socket.on('game:countdown', handleCountdown)
    socket.on('game:closed', handleGameClosed)
    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off('game:questionOpened', handleQuestionOpened)
      socket.off('game:finished', handleGameFinished)
      socket.off('game:questionClosed', handleQuestionClosed)
      socket.off('game:started', handleGameStarted)
      socket.off('game:opened', handleGameOpened)
      socket.off('game:countdown', handleCountdown)
      socket.off('game:closed', handleGameClosed)
    }
  }, [socket, player, applyQuestion, completeGame])

  const handleSelectAnswer = (answerId) => {
    if (gameFinished || !currentQuestion || questionClosed || attemptLocked) {
      return
    }
    setSelectedAnswer(answerId)
  }

  const handleSubmit = async () => {
    if (!player || !currentQuestion || selectedAnswer === null || attemptLocked) {
      return
    }
    setSending(true)
    try {
      const response = await submitAnswer({
        playerId: player.id,
        questionId: currentQuestion.id,
        answerId: selectedAnswer,
      })
      setAttemptLocked(true)
      if (response.questionClosed) {
        setQuestionClosed(true)
      }
      if (response.gameFinished) {
        completeGame(
          response.awarded
            ? 'Вы завершили игру правильным ответом!'
            : 'Игра завершена. Ожидайте ведущего',
        )
      } else if (response.awarded && response.isCorrect) {
        setStatusMessage('Вы были первым! Балл начислен.')
      } else if (response.isCorrect) {
        setStatusMessage('Правильно, но кто-то ответил быстрее.')
        setQuestionClosed(true)
      } else {
        setStatusMessage('Ответ неверный. Вы больше не можете отвечать на этот вопрос.')
        setSelectedAnswer(null)
      }
      setError(null)
    } catch (err) {
      const message = err.response?.data?.message ?? err.message ?? 'Не удалось отправить ответ'
      if (message.includes('завершён')) {
        setStatusMessage('Этот вопрос уже закрыт. Ждём следующий.')
        setQuestionClosed(true)
      } else {
        setStatusMessage(message)
      }
      setSelectedAnswer(null)
      setAttemptLocked(true)
    } finally {
      setSending(false)
    }
  }

  const handleExitGame = () => {
    dispatch(resetPlayer())
    setCurrentQuestion(null)
    setQuestionIndex(null)
    setTotalQuestions(0)
    setSelectedAnswer(null)
    setGameFinished(false)
    setStatusMessage('Ожидайте запуск игры')
    setError(null)
    setQuestionClosed(false)
    setAttemptLocked(false)
    navigate('/player', { replace: true })
  }

  if (!player && !currentQuestion && !gameFinished) {
    return null
  }

  const activeQuestionNumber = questionIndex !== null ? questionIndex + 1 : null
  const progressPercent =
    activeQuestionNumber && totalQuestions > 0
      ? Math.min(100, Math.round((activeQuestionNumber / totalQuestions) * 100))
      : 0

  const statusTone = (() => {
    if (gameFinished) {
      return { label: 'Игра завершена', variant: 'done' }
    }
    if (questionClosed) {
      return { label: 'Вопрос закрыт', variant: 'closed' }
    }
    if (countdownValue !== null && countdownValue >= 0) {
      return { label: 'Скоро старт', variant: 'countdown' }
    }
    if (currentQuestion) {
      return { label: 'Вопрос в эфире', variant: 'active' }
    }
    return { label: 'Ожидаем запуск', variant: 'waiting' }
  })()

  const showPlayerBadge = player && statusTone.variant === 'waiting'

  return (
    <div className={styles.page}>
      {showPlayerBadge && (
        <div className={styles.playerBadgeWrapper}>
          <div className={styles.playerBadge}>
            <div className={styles.avatarRing}>
              <img
                src={playerAvatarUrl}
                alt={player.username ? `Профиль ${player.username}` : 'Профиль игрока'}
                loading="lazy"
              />
            </div>
            <div className={styles.playerMeta}>
              <span className={styles.playerName}>{player.username}</span>
              <span className={styles.playerGroup}>{player.groupName || 'Без группы'}</span>
              <span className={styles.playerId}>ID: {player.id}</span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.card}>
        <LightningIcon />
        <div className={`${styles.statusStrip} ${styles[`statusStrip_${statusTone.variant}`]}`}>
          <span>{statusTone.label}</span>
        </div>
        <h1>{statusMessage}</h1>

        {totalQuestions > 0 && (
          <div className={styles.progressBar}>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
            <span className={styles.progressLabel}>
              Вопрос {Math.min(activeQuestionNumber ?? 0, totalQuestions)} из {totalQuestions}
            </span>
          </div>
        )}

        {countdownValue !== null && !gameFinished && (
          <div className={styles.countdownWrapper}>
            <span className={styles.countdownNumber}>
              {countdownValue > 0 ? countdownValue : 'Старт!'}
            </span>
          </div>
        )}

        {loading && <div className={styles.stateBox}>Загружаем вопросы…</div>}
        {error && !loading && <div className={styles.stateBox}>{error}</div>}

        {!loading && !error && currentQuestion && !gameFinished && (
          <div className={styles.questionBlock}>
            <h2>{currentQuestion.text}</h2>
            {currentQuestion.imageUrl && (
              <div className={styles.preview}>
                <img src={resolveImageUrl(currentQuestion.imageUrl)} alt="Изображение вопроса" />
              </div>
            )}
            <div className={styles.answers}>
              {(currentQuestion.answers ?? []).map((answer) => (
                <button
                  key={answer.id}
                  type="button"
                  className={`${styles.answerButton} ${selectedAnswer === answer.id ? styles.answerSelected : ''
                    }`}
                  onClick={() => handleSelectAnswer(answer.id)}
                  disabled={sending || questionClosed || attemptLocked}
                >
                  <span>{answer.text}</span>

                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={
                selectedAnswer === null || sending || questionClosed || attemptLocked
              }
            >
              {sending ? 'Отправляем...' : 'Ответить'}
            </button>
            {questionClosed && (
              <div className={styles.stateBox}>Ждём следующий вопрос от ведущего</div>
            )}
          </div>
        )}

        {gameFinished && player && (
          <div className={styles.playerInfo}>
            <span>{player.username}</span>
            <span>{player.groupName || 'Без группы'}</span>
            <span>ID игрока: {player.id}</span>
            <span>Спасибо за участие!</span>
            <button type="button" className={styles.exitButton} onClick={handleExitGame}>
              Выйти из игры
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlayerPlay

