import { useEffect, useRef } from 'react'
import { updateGame } from '../../../features/games/gamesSlice.js'

export function useDashboardSocketHandlers({
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
}) {
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
      updateAnswerStats(gameId, playerId, payload.isCorrect)
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
      // Сохраняем текущий вопрос при открытии
      if (payload.question) {
        setCurrentQuestion(gameId, payload.question)
      }
      // Обновляем очередь при открытии вопроса
      refreshQueue(gameId)
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
      setCurrentQuestion(gameId, payload.question)
      // Обновляем состояние игры - вопрос в preview
      dispatch(updateGame({ id: gameId, is_question_closed: true }))
    }

    const handleQuestionReady = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      // НЕ удаляем currentQuestion - он нужен для определения типа вопроса
      // Обновляем состояние игры - вопрос больше не в preview
      dispatch(updateGame({ id: gameId, is_question_closed: false }))
    }

    const handleQueueUpdated = (payload) => {
      const gameId = Number(payload?.gameId)
      if (!gameId) {
        return
      }
      updateQueue(gameId, {
        queue: payload.queue || [],
        questionId: payload.questionId || null,
      })
    }

    socket.on('player:answer', handlePlayerAnswer)
    socket.on('player:joined', handlePlayerJoined)
    socket.on('player:left', handlePlayerLeft)
    socket.on('game:questionOpened', handleQuestionOpened)
    socket.on('game:questionPreview', handleQuestionPreview)
    socket.on('game:questionReady', handleQuestionReady)
    socket.on('game:started', handleGameStarted)
    socket.on('game:opened', handleGameOpened)
    socket.on('game:finished', handleGameFinished)
    socket.on('game:stopped', handleGameFinished)
    socket.on('game:closed', handleGameFinished)
    socket.on('player:queueUpdated', handleQueueUpdated)

    return () => {
      socket.off('player:answer', handlePlayerAnswer)
      socket.off('player:joined', handlePlayerJoined)
      socket.off('player:left', handlePlayerLeft)
      socket.off('game:questionOpened', handleQuestionOpened)
      socket.off('game:questionPreview', handleQuestionPreview)
      socket.off('game:questionReady', handleQuestionReady)
      socket.off('game:started', handleGameStarted)
      socket.off('game:opened', handleGameOpened)
      socket.off('game:finished', handleGameFinished)
      socket.off('game:stopped', handleGameFinished)
      socket.off('game:closed', handleGameFinished)
      socket.off('player:queueUpdated', handleQueueUpdated)
    }
  }, [
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
  ])
}

