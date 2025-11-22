import { useCallback, useRef, useState } from 'react'
import { fetchPlayers } from '../../../api/players.js'

export function useGameStats() {
  const [answerStats, setAnswerStats] = useState({})
  const isMountedRef = useRef(true)

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

  const updateAnswerStats = useCallback((gameId, playerId, isCorrect) => {
    const normalizedGameId = Number(gameId)
    const normalizedPlayerId = Number(playerId)
    if (!normalizedGameId || Number.isNaN(normalizedGameId) || !normalizedPlayerId || Number.isNaN(normalizedPlayerId)) {
      return
    }
    setAnswerStats((prev) => {
      const previous = prev[normalizedGameId] ?? { totalPlayers: 0, answers: {} }
      return {
        ...prev,
        [normalizedGameId]: {
          ...previous,
          answers: {
            ...previous.answers,
            [String(normalizedPlayerId)]: {
              isCorrect: Boolean(isCorrect),
            },
          },
        },
      }
    })
  }, [])

  return {
    answerStats,
    refreshPlayers,
    resetAnswers,
    clearStatsForGame,
    updateAnswerStats,
    setAnswerStats,
  }
}

