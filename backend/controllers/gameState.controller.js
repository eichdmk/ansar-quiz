import { getCurrentQuestion } from '../services/gameState.service.js'

export async function getCurrentGameQuestion(request, reply) {
  const gameId = Number(request.params?.id)
  if (Number.isNaN(gameId)) {
    reply.code(400).send({ message: 'Некорректный идентификатор игры' })
    return
  }
  try {
    const data = await getCurrentQuestion(gameId)
    if (data.status === 'not_found') {
      reply.code(404).send({ message: 'Игра не найдена' })
      return
    }
    reply.send(data)
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Не удалось получить состояние игры' })
  }
}
