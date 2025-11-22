import { useCallback, useRef, useState } from 'react'
import { getQueue } from '../../../api/playerAnswers.js'
import { fetchQuestions } from '../../../api/questions.js'

export function useGameQueue() {
  const [queues, setQueues] = useState({}) // gameId -> { queue: [], questionId: number }
  const [currentQuestions, setCurrentQuestions] = useState({}) // gameId -> question preview
  const isMountedRef = useRef(true)

  const refreshQueue = useCallback(async (gameId) => {
    const normalizedId = Number(gameId)
    if (!normalizedId || Number.isNaN(normalizedId)) {
      return
    }
    try {
      const data = await getQueue(normalizedId)
      if (!isMountedRef.current) {
        return
      }
      const questionId = data.questionId || null
      setQueues((prev) => ({
        ...prev,
        [normalizedId]: {
          queue: data.queue || [],
          questionId,
        },
      }))
      
      // Если есть questionId, но нет currentQuestion, загружаем информацию о вопросе
      if (questionId) {
        setCurrentQuestions((prev) => {
          if (prev[normalizedId]) {
            return prev
          }
          // Загружаем вопрос асинхронно
          fetchQuestions(normalizedId)
            .then((questionsData) => {
              if (!isMountedRef.current) {
                return
              }
              const question = questionsData?.items?.find((q) => q.id === questionId)
              if (question) {
                setCurrentQuestions((prevInner) => {
                  if (prevInner[normalizedId]) {
                    return prevInner
                  }
                  return {
                    ...prevInner,
                    [normalizedId]: question,
                  }
                })
              }
            })
            .catch(() => {
              // Пропускаем ошибки загрузки вопроса
            })
          return prev
        })
      }
    } catch {
      // пропускаем ошибки загрузки очереди
    }
  }, [])

  const updateQueue = useCallback((gameId, queueData) => {
    const normalizedId = Number(gameId)
    if (!normalizedId || Number.isNaN(normalizedId)) {
      return
    }
    setQueues((prev) => ({
      ...prev,
      [normalizedId]: {
        queue: queueData.queue || [],
        questionId: queueData.questionId || prev[normalizedId]?.questionId || null,
      },
    }))
  }, [])

  const setCurrentQuestion = useCallback((gameId, question) => {
    const normalizedId = Number(gameId)
    if (!normalizedId || Number.isNaN(normalizedId)) {
      return
    }
    if (!question) {
      return
    }
    setCurrentQuestions((prev) => ({
      ...prev,
      [normalizedId]: question,
    }))
  }, [])

  return {
    queues,
    currentQuestions,
    refreshQueue,
    updateQueue,
    setCurrentQuestion,
    setQueues,
    setCurrentQuestions,
  }
}

