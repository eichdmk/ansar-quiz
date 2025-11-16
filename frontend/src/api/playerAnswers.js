import { http } from './http.js'

export const submitAnswer = async ({ playerId, questionId, answerId }) => {
  const response = await http.post('/player-answers', {
    playerId,
    questionId,
    answerId,
  })
  return response.data
}

export const requestAnswer = async ({ playerId, gameId }) => {
  const response = await http.post('/player-answers/request-answer', {
    playerId,
    gameId,
  })
  return response.data
}

export const skipQuestion = async ({ playerId, questionId }) => {
  const response = await http.post('/player-answers/skip', {
    playerId,
    questionId,
  })
  return response.data
}

export const getQueue = async (gameId, questionId = null) => {
  const params = questionId ? { gameId, questionId } : { gameId }
  const response = await http.get('/player-answers/queue', { params })
  return response.data
}

export const evaluateAnswer = async ({ playerId, questionId, isCorrect }) => {
  const response = await http.post('/player-answers/evaluate', {
    playerId,
    questionId,
    isCorrect,
  })
  return response.data
}
