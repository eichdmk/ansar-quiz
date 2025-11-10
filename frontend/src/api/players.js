import { http } from './http.js'

export const fetchPlayers = async (gameId) => {
  const response = await http.get('/players', { params: { gameId } })
  return response.data
}

export const createPlayer = (payload) => http.post('/players', payload)

export const updatePlayerScore = (id, score) =>
  http.patch(`/players/${id}/score`, { score })

export const deletePlayer = (id) => http.delete(`/players/${id}`)

