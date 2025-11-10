import { http } from './http.js'

export const fetchGames = async (params) => {
  const response = await http.get('/quiz', { params })
  return response.data
}

export const createGame = async (payload) => {
  const response = await http.post('/quiz', payload)
  return response.data
}

export const deleteGame = (id) => http.delete(`/quiz/${id}`)

export const startGame = async (id, payload) => {
  const response = await http.post(`/quiz/${id}/start`, payload)
  return response.data
}

export const stopGame = async (id) => {
  const response = await http.post(`/quiz/${id}/stop`)
  return response.data
}

export const fetchCurrentQuestion = async (gameId) => {
  const response = await http.get(`/game-state/${gameId}/current-question`)
  return response.data
}

export const advanceGameQuestion = async (gameId) => {
  const response = await http.post(`/quiz/${gameId}/next`)
  return response.data
}

