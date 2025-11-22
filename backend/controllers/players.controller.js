import pool from '../plugins/db.js'
import { getCurrentQuestion } from '../services/gameState.service.js'

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

export async function createPlayer(request, reply) {
  const { username, groupName, gameId } = request.body ?? {}
  const preparedUsername = sanitizeText(username)
  const preparedGroup = sanitizeText(groupName)
  const preparedGameId = Number(gameId)
  if (!preparedUsername || Number.isNaN(preparedGameId)) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  try {
    const game = await pool.query('SELECT id, status, is_question_closed FROM games WHERE id = $1', [
      preparedGameId,
    ])
    if (game.rowCount === 0) {
      reply.code(404).send({ message: 'Игра не найдена' })
      return
    }
    if (game.rows[0].status === 'finished') {
      reply.code(409).send({ message: 'Игра уже завершена' })
      return
    }
    if (game.rows[0].status === 'draft') {
      reply.code(409).send({ message: 'Комната ещё не открыта ведущим' })
      return
    }
    const result = await pool.query(
      'INSERT INTO players (username, group_name, game_id) VALUES ($1, $2, $3) RETURNING id, username, group_name, game_id, score, joined_at',
      [preparedUsername, preparedGroup || null, preparedGameId],
    )
    const payload = {
      id: result.rows[0].id,
      username: result.rows[0].username,
      groupName: result.rows[0].group_name,
      gameId: result.rows[0].game_id,
      score: result.rows[0].score,
      joinedAt: result.rows[0].joined_at,
      gameStatus: game.rows[0].status,
      isQuestionClosed: game.rows[0].is_question_closed,
    }
    const currentQuestion = await getCurrentQuestion(preparedGameId)
    if (currentQuestion.status === 'running' && currentQuestion.question) {
      payload.currentQuestion = {
        question: currentQuestion.question,
        index: currentQuestion.index,
        total: currentQuestion.total,
        isClosed: Boolean(currentQuestion.isClosed),
      }
    }
    // Инвалидация кэша игроков
    const { invalidatePlayerCache } = await import('../services/cache.service.js')
    await invalidatePlayerCache(preparedGameId)

    if (request.server?.io) {
      const gameRoom = `game:${preparedGameId}`
      request.server.io.to(gameRoom).emit('player:joined', payload)
    }
    reply.code(201).send(payload)
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

export async function listPlayers(request, reply) {
  const gameIdFromParams = request.params?.gameId
  const gameIdFromQuery = request.query?.gameId
  const preparedGameId = Number(gameIdFromParams ?? gameIdFromQuery)
  if (Number.isNaN(preparedGameId)) {
    reply.code(400).send({ message: 'Не передан gameId' })
    return
  }
  const cacheKey = `players:${preparedGameId}`
  
  try {
    const { cached, invalidatePlayerCache } = await import('../services/cache.service.js')
    
    const result = await cached(cacheKey, async () => {
      const result = await pool.query(
        'SELECT id, username, group_name, score, joined_at FROM players WHERE game_id = $1 ORDER BY score DESC, joined_at ASC',
        [preparedGameId],
      )
      return {
        gameId: preparedGameId,
        total: result.rowCount,
        items: result.rows.map((row) => ({
          id: row.id,
          username: row.username,
          groupName: row.group_name,
          score: row.score,
          joinedAt: row.joined_at,
        })),
      }
    }, 30) // Кэш на 30 секунд (часто обновляется из-за очков)

    reply.send(result)
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

export async function updatePlayerScore(request, reply) {
  const playerId = Number(request.params?.id)
  const { score } = request.body ?? {}
  const preparedScore = Number(score)
  if (Number.isNaN(playerId) || Number.isNaN(preparedScore)) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  // CHECK constraint требует score >= 0
  if (preparedScore < 0) {
    reply.code(400).send({ message: 'Счет не может быть отрицательным' })
    return
  }
  try {
    const result = await pool.query(
      'UPDATE players SET score = $1 WHERE id = $2 RETURNING id, username, group_name, game_id, score, joined_at',
      [preparedScore, playerId],
    )
    if (result.rowCount === 0) {
      reply.code(404).send({ message: 'Игрок не найден' })
      return
    }
    const payload = {
      id: result.rows[0].id,
      username: result.rows[0].username,
      groupName: result.rows[0].group_name,
      gameId: result.rows[0].game_id,
      score: result.rows[0].score,
      joinedAt: result.rows[0].joined_at,
    }
    // Инвалидация кэша игроков
    const { invalidatePlayerCache } = await import('../services/cache.service.js')
    await invalidatePlayerCache(payload.gameId)

    if (request.server?.io) {
      const gameRoom = `game:${payload.gameId}`
      request.server.io.to(gameRoom).emit('player:scoreUpdated', payload)
    }
    reply.send(payload)
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

export async function deletePlayer(request, reply) {
  const playerId = Number(request.params?.id)
  if (Number.isNaN(playerId)) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  try {
    // Получаем gameId перед удалением для инвалидации кэша
    const gameResult = await pool.query('SELECT game_id FROM players WHERE id = $1', [playerId])
    if (gameResult.rowCount === 0) {
      reply.code(404).send({ message: 'Игрок не найден' })
      return
    }
    const gameId = gameResult.rows[0].game_id

    const result = await pool.query(
      'DELETE FROM players WHERE id = $1 RETURNING id',
      [playerId],
    )

    // Инвалидация кэша игроков
    const { invalidatePlayerCache } = await import('../services/cache.service.js')
    await invalidatePlayerCache(gameId)

    if (request.server?.io) {
      const gameRoom = `game:${gameId}`
      request.server.io.to(gameRoom).emit('player:left', { id: playerId })
    }

    reply.send({ id: playerId })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

