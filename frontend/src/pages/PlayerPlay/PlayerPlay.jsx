import { useCallback, useEffect, useState } from 'react'
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
  }, [])

  const completeGame = useCallback((message) => {
    setStatusMessage(message)
    setGameFinished(true)
    setCurrentQuestion(null)
    setQuestionIndex(null)
    setSelectedAnswer(null)
    setQuestionClosed(true)
    setAttemptLocked(true)
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
          completeGame('Игра завершена преподавателем')
        } else {
          setLoading(false)
          setCurrentQuestion(null)
          setQuestionIndex(null)
          setTotalQuestions(data?.total ?? 0)
          setStatusMessage('Ожидайте запуск игры')
          setQuestionClosed(Boolean(data?.isClosed))
          setAttemptLocked(Boolean(data?.isClosed))
        }
      })
      .catch((err) => {
        setLoading(false)
        setError(err?.message ?? 'Не удалось загрузить текущий вопрос')
      })
  }, [player, applyQuestion, completeGame])

  useEffect(() => {
    loadCurrentState()
  }, [loadCurrentState])

  useEffect(() => {
    if (!player) {
      return () => {}
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

    const handleQuestionClosed = (payload) => {
      if (payload.gameId !== player.gameId) {
        return
      }
      setQuestionClosed(true)
      setSelectedAnswer(null)
      setAttemptLocked(true)
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
          setQuestionClosed(false)
          setAttemptLocked(false)
        }
      }
    }

    socket.on('game:questionOpened', handleQuestionOpened)
    socket.on('game:finished', handleGameFinished)
    socket.on('game:questionClosed', handleQuestionClosed)
    socket.on('game:started', handleGameStarted)
    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off('game:questionOpened', handleQuestionOpened)
      socket.off('game:finished', handleGameFinished)
      socket.off('game:questionClosed', handleQuestionClosed)
      socket.off('game:started', handleGameStarted)
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
            : 'Игра завершена. Ожидайте преподавателя',
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <LightningIcon />
        <h1>{statusMessage}</h1>

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
                  className={`${styles.answerButton} ${
                    selectedAnswer === answer.id ? styles.answerSelected : ''
                  }`}
                  onClick={() => handleSelectAnswer(answer.id)}
                  disabled={sending}
                >
                  {answer.text}
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
            {activeQuestionNumber !== null && (
              <div className={styles.progress}>
                Вопрос {Math.min(activeQuestionNumber, totalQuestions)} из {totalQuestions}
              </div>
            )}
            {questionClosed && (
              <div className={styles.stateBox}>Ждём следующий вопрос от преподавателя…</div>
            )}
          </div>
        )}

        {gameFinished && player && (
          <div className={styles.playerInfo}>
            <span>{player.username}</span>
            <span>{player.groupName || 'Без группы'}</span>
            <span>ID игрока: {player.id}</span>
            <span>Спасибо за участие! Можно вернуться к преподавателю.</span>
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

