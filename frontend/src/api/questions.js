import { http } from './http.js'

export const fetchQuestions = async (gameId) => {
  const response = await http.get('/questions', { params: { gameId } })
  return response.data
}

export const createQuestion = async (payload) => {
  const response = await http.post('/questions', payload)
  return response.data
}

export const updateQuestion = async (id, payload) => {
  const response = await http.put(`/questions/${id}`, payload)
  return response.data
}

export const deleteQuestion = async (id) => http.delete(`/questions/${id}`)

