import { http } from './http.js'

export const submitAnswer = async ({ playerId, questionId, answerId }) => {
  const response = await http.post('/player-answers', {
    playerId,
    questionId,
    answerId,
  })
  return response.data
}
