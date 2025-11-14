import pool from '../plugins/db.js'

function toNumber(value) {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function mapPlayer(row) {
  return {
    id: row.id,
    username: row.username,
    groupName: row.group_name,
    gameId: row.game_id,
    score: row.score,
    joinedAt: row.joined_at,
  }
}

export async function submitAnswer(request, reply) {
  const { playerId, questionId, answerId } = request.body ?? {}
  const preparedPlayerId = toNumber(playerId)
  const preparedQuestionId = toNumber(questionId)
  const preparedAnswerId = toNumber(answerId)
  if (
    preparedPlayerId === null ||
    preparedQuestionId === null ||
    preparedAnswerId === null
  ) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const playerResult = await client.query(
      'SELECT id, game_id FROM players WHERE id = $1',
      [preparedPlayerId],
    )
    if (playerResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Игрок не найден' })
      return
    }
    const player = playerResult.rows[0]

    const gameResult = await client.query(
      'SELECT id, current_question_index, status, is_question_closed FROM games WHERE id = $1 FOR UPDATE',
      [player.game_id],
    )
    if (gameResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Игра не найдена' })
      return
    }
    const game = gameResult.rows[0]
    if (game.status !== 'running') {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Игра ещё не запущена или уже завершена' })
      return
    }

    if (game.is_question_closed) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вопрос уже завершён. Ожидайте следующий.' })
      return
    }

    const questionResult = await client.query(
      'SELECT id, game_id, position FROM questions WHERE id = $1',
      [preparedQuestionId],
    )
    if (questionResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Вопрос не найден' })
      return
    }
    const question = questionResult.rows[0]
    if (question.game_id !== player.game_id) {
      await client.query('ROLLBACK')
      reply.code(400).send({ message: 'Вопрос не относится к игре игрока' })
      return
    }

    const answerResult = await client.query(
      'SELECT id, question_id, is_true FROM answers WHERE id = $1',
      [preparedAnswerId],
    )
    if (answerResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Ответ не найден' })
      return
    }
    const answer = answerResult.rows[0]
    if (answer.question_id !== question.id) {
      await client.query('ROLLBACK')
      reply.code(400).send({ message: 'Ответ не относится к вопросу' })
      return
    }

    const currentIndex = Math.max(0, (question.position ?? 1) - 1)
    if (currentIndex !== game.current_question_index) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вопрос уже завершён' })
      return
    }

    const isCorrect = Boolean(answer.is_true)

    // Проверяем, что игрок в очереди и активен (имеет право отвечать)
    // Проверяем что игрок первый в очереди (position = 0)
    const queueCheckResult = await client.query(
      `SELECT aq.id, aq.position 
       FROM answer_queue aq
       WHERE aq.game_id = $1 AND aq.question_id = $2 AND aq.player_id = $3 AND aq.is_active = TRUE
       ORDER BY aq.position ASC, aq.joined_at ASC
       LIMIT 1`,
      [player.game_id, preparedQuestionId, preparedPlayerId],
    )

    if (queueCheckResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вы не можете отвечать на этот вопрос. Дождитесь своей очереди.' })
      return
    }

    // Проверяем что это действительно первый игрок в очереди
    const queueFirstResult = await client.query(
      `SELECT player_id FROM answer_queue 
       WHERE game_id = $1 AND question_id = $2 AND is_active = TRUE 
       ORDER BY position ASC, joined_at ASC LIMIT 1`,
      [player.game_id, preparedQuestionId],
    )

    if (queueFirstResult.rowCount === 0 || queueFirstResult.rows[0].player_id !== preparedPlayerId) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вы не можете отвечать на этот вопрос. Дождитесь своей очереди.' })
      return
    }

    const insertResult = await client.query(
      `INSERT INTO player_answers (player_id, question_id, answer_id, is_correct)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id, question_id)
       DO UPDATE SET answer_id = EXCLUDED.answer_id,
                     is_correct = EXCLUDED.is_correct,
                     answered_at = NOW()
       RETURNING id, answered_at, is_correct`,
      [preparedPlayerId, preparedQuestionId, preparedAnswerId, isCorrect],
    )

    let awarded = false
    let updatedPlayer = null

    if (isCorrect) {
      const playerScoreResult = await client.query(
        `UPDATE players
         SET score = score + 1
         WHERE id = $1
         RETURNING id, username, group_name, game_id, score, joined_at`,
        [preparedPlayerId],
      )
      updatedPlayer = playerScoreResult.rows[0]
      awarded = true

      await client.query(
        `UPDATE games
           SET is_question_closed = TRUE
         WHERE id = $1`,
        [player.game_id],
      )

      // Деактивируем всех в очереди
      await client.query(
        'UPDATE answer_queue SET is_active = FALSE WHERE game_id = $1 AND question_id = $2',
        [player.game_id, preparedQuestionId],
      )
    } else {
      // Неправильный ответ - деактивируем текущего игрока и передаем следующему
      await client.query(
        'UPDATE answer_queue SET is_active = FALSE WHERE id = $1',
        [queueCheckResult.rows[0].id],
      )
    }

    await client.query('COMMIT')

    if (request.server?.io) {
      request.server.io.emit('player:answer', {
        playerId: preparedPlayerId,
        questionId: preparedQuestionId,
        answerId: preparedAnswerId,
        isCorrect,
        gameId: player.game_id,
      })
      if (awarded && updatedPlayer) {
        request.server.io.emit('player:scoreUpdated', mapPlayer(updatedPlayer))
        request.server.io.emit('game:questionClosed', {
          gameId: player.game_id,
          questionId: preparedQuestionId,
          winner: mapPlayer(updatedPlayer),
        })
        // Очищаем очередь при правильном ответе
        await emitQueueUpdate(request.server.io, player.game_id, preparedQuestionId)
      } else if (!isCorrect) {
        // Неправильный ответ - передаем следующему
        await assignQuestionToNextInQueue(request.server.io, player.game_id, preparedQuestionId)
      }
    }

    reply.code(201).send({
      id: insertResult.rows[0].id,
      playerId: preparedPlayerId,
      questionId: preparedQuestionId,
      answerId: preparedAnswerId,
      isCorrect,
      awarded,
      answeredAt: insertResult.rows[0].answered_at,
      questionClosed: awarded && isCorrect,
    })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') {
      reply.code(409).send({ message: 'Ответ уже записан' })
      return
    }
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  } finally {
    client.release()
  }
}

export async function listPlayerAnswers(request, reply) {
  const playerId = toNumber(request.query?.playerId ?? request.params?.playerId)
  const gameId = toNumber(request.query?.gameId)
  if (playerId === null && gameId === null) {
    reply
      .code(400)
      .send({ message: 'Передай playerId или gameId для фильтрации' })
    return
  }
  try {
    let whereClause = ''
    const values = []
    if (playerId !== null) {
      whereClause = 'player_id = $1'
      values.push(playerId)
    } else {
      whereClause = 'game_id = $1'
      values.push(gameId)
    }
    const query = `
      SELECT
        pa.id,
        pa.player_id,
        pa.question_id,
        pa.answer_id,
        pa.is_correct,
        pa.answered_at,
        q.question_text,
        a.answer_text,
        p.username,
        p.group_name,
        q.game_id
      FROM player_answers pa
      JOIN players p ON pa.player_id = p.id
      JOIN questions q ON pa.question_id = q.id
      LEFT JOIN answers a ON pa.answer_id = a.id
      WHERE ${whereClause}
      ORDER BY pa.answered_at ASC
    `
    const result = await pool.query(query, values)
    reply.send({
      total: result.rowCount,
      items: result.rows.map((row) => ({
        id: row.id,
        playerId: row.player_id,
        questionId: row.question_id,
        answerId: row.answer_id,
        isCorrect: row.is_correct,
        answeredAt: row.answered_at,
        questionText: row.question_text,
        answerText: row.answer_text,
        username: row.username,
        groupName: row.group_name,
        gameId: row.game_id,
      })),
    })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

async function getQueueForQuestion(gameId, questionId, client = pool) {
  const target = client.query ? client : pool
  const result = await target.query(
    `SELECT aq.id, aq.player_id, aq.position, aq.joined_at,
            p.username, p.group_name, p.score
     FROM answer_queue aq
     JOIN players p ON aq.player_id = p.id
     WHERE aq.game_id = $1 AND aq.question_id = $2 AND aq.is_active = TRUE
     ORDER BY aq.position ASC, aq.joined_at ASC`,
    [gameId, questionId],
  )
  return result.rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    position: row.position,
    joinedAt: row.joined_at,
    username: row.username,
    groupName: row.group_name,
    score: row.score,
  }))
}

async function assignQuestionToNextInQueue(io, gameId, questionId) {
  if (!io) {
    return
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // Находим следующего в очереди
    const queueResult = await client.query(
      `SELECT aq.player_id, p.username, p.group_name
       FROM answer_queue aq
       JOIN players p ON aq.player_id = p.id
       WHERE aq.game_id = $1 AND aq.question_id = $2 AND aq.is_active = TRUE
       ORDER BY aq.position ASC, aq.joined_at ASC
       LIMIT 1`,
      [gameId, questionId],
    )

    if (queueResult.rowCount > 0) {
      const nextPlayer = queueResult.rows[0]
      
      // Отправляем вопрос следующему игроку
      const questionResult = await client.query(
        `SELECT q.id, q.question_text AS text, q.image_url,
                COALESCE(
                  json_agg(
                    json_build_object('id', a.id, 'text', a.answer_text)
                    ORDER BY a.id
                  ) FILTER (WHERE a.id IS NOT NULL),
                  '[]'::json
                ) AS answers
         FROM questions q
         LEFT JOIN answers a ON a.question_id = q.id
         WHERE q.id = $1
         GROUP BY q.id`,
        [questionId],
      )

      if (questionResult.rowCount > 0) {
        const question = questionResult.rows[0]
        const answers = question.answers || []
        
        io.emit('player:questionAssigned', {
          gameId,
          questionId,
          playerId: nextPlayer.player_id,
          question: {
            id: question.id,
            text: question.text,
            imageUrl: question.image_url,
            answers: answers,
          },
        })

        // Обновляем очередь
        await emitQueueUpdate(io, gameId, questionId, client)
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error assigning question to next in queue:', error)
  } finally {
    client.release()
  }
}

async function emitQueueUpdate(io, gameId, questionId, client = pool) {
  if (!io) {
    return
  }
  const queue = await getQueueForQuestion(gameId, questionId, client)
  io.emit('player:queueUpdated', {
    gameId,
    questionId,
    queue,
  })
}

export async function requestAnswer(request, reply) {
  const { playerId, gameId } = request.body ?? {}
  const preparedPlayerId = toNumber(playerId)
  const preparedGameId = toNumber(gameId)

  if (preparedPlayerId === null || preparedGameId === null) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Проверяем игрока
    const playerResult = await client.query(
      'SELECT id, game_id FROM players WHERE id = $1',
      [preparedPlayerId],
    )
    if (playerResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Игрок не найден' })
      return
    }
    const player = playerResult.rows[0]

    if (player.game_id !== preparedGameId) {
      await client.query('ROLLBACK')
      reply.code(400).send({ message: 'Игрок не относится к этой игре' })
      return
    }

    // Проверяем игру и текущий вопрос
    const gameResult = await client.query(
      'SELECT current_question_index, status, is_question_closed FROM games WHERE id = $1 FOR UPDATE',
      [preparedGameId],
    )
    if (gameResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Игра не найдена' })
      return
    }
    const game = gameResult.rows[0]

    if (game.status !== 'running') {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Игра не запущена' })
      return
    }

    if (game.is_question_closed) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вопрос еще не готов к ответу' })
      return
    }

    // Получаем текущий вопрос
    const questionResult = await client.query(
      `SELECT q.id, q.question_text AS text, q.image_url,
              COALESCE(
                json_agg(
                  json_build_object('id', a.id, 'text', a.answer_text)
                  ORDER BY a.id
                ) FILTER (WHERE a.id IS NOT NULL),
                '[]'::json
              ) AS answers
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
       WHERE q.game_id = $1
       GROUP BY q.id
       ORDER BY q.position ASC, q.id ASC
       LIMIT 1 OFFSET $2`,
      [preparedGameId, game.current_question_index],
    )

    if (questionResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Текущий вопрос не найден' })
      return
    }

    const question = questionResult.rows[0]
    const questionId = question.id

    // Проверяем, не в очереди ли уже игрок
    const existingQueueResult = await client.query(
      'SELECT id, position FROM answer_queue WHERE game_id = $1 AND question_id = $2 AND player_id = $3 AND is_active = TRUE',
      [preparedGameId, questionId, preparedPlayerId],
    )

    if (existingQueueResult.rowCount > 0) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вы уже в очереди' })
      return
    }

    // Проверяем, есть ли уже кто-то в очереди
    const queueResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM answer_queue WHERE game_id = $1 AND question_id = $2 AND is_active = TRUE',
      [preparedGameId, questionId],
    )
    const queueCount = queueResult.rows[0]?.count ?? 0

    if (queueCount === 0) {
      // Очередь пуста, игрок получает вопрос сразу
      const answers = question.answers || []
      
      // Добавляем в очередь как первого в той же транзакции
      await client.query(
        'INSERT INTO answer_queue (game_id, question_id, player_id, position) VALUES ($1, $2, $3, 0)',
        [preparedGameId, questionId, preparedPlayerId],
      )

      await client.query('COMMIT')

      if (request.server?.io) {
        request.server.io.emit('player:questionAssigned', {
          gameId: preparedGameId,
          questionId,
          playerId: preparedPlayerId,
          question: {
            id: question.id,
            text: question.text,
            imageUrl: question.image_url,
            answers: answers,
          },
        })

        await emitQueueUpdate(request.server.io, preparedGameId, questionId)
      }

      reply.send({
        assigned: true,
        question: {
          id: question.id,
          text: question.text,
          imageUrl: question.image_url,
          answers: answers,
        },
      })
    } else {
      // Добавляем в очередь
      const position = queueCount
      await client.query(
        'INSERT INTO answer_queue (game_id, question_id, player_id, position) VALUES ($1, $2, $3, $4)',
        [preparedGameId, questionId, preparedPlayerId, position],
      )

      await client.query('COMMIT')

      if (request.server?.io) {
        await emitQueueUpdate(request.server.io, preparedGameId, questionId)
      }

      reply.send({
        assigned: false,
        position: position + 1, // Позиция для отображения (начинается с 1)
      })
    }
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') {
      reply.code(409).send({ message: 'Вы уже в очереди' })
      return
    }
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  } finally {
    client.release()
  }
}

export async function skipQuestion(request, reply) {
  const { playerId, questionId } = request.body ?? {}
  const preparedPlayerId = toNumber(playerId)
  const preparedQuestionId = toNumber(questionId)

  if (preparedPlayerId === null || preparedQuestionId === null) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Проверяем игрока
    const playerResult = await client.query(
      'SELECT id, game_id FROM players WHERE id = $1',
      [preparedPlayerId],
    )
    if (playerResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Игрок не найден' })
      return
    }
    const player = playerResult.rows[0]

    // Проверяем, что игрок в очереди и активен, и что он первый в очереди
    const queueResult = await client.query(
      `SELECT aq.id, aq.position 
       FROM answer_queue aq
       WHERE aq.game_id = $1 AND aq.question_id = $2 AND aq.player_id = $3 AND aq.is_active = TRUE`,
      [player.game_id, preparedQuestionId, preparedPlayerId],
    )

    if (queueResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Игрок не в очереди' })
      return
    }

    // Проверяем что это действительно первый игрок в очереди
    const queueFirstResult = await client.query(
      `SELECT player_id FROM answer_queue 
       WHERE game_id = $1 AND question_id = $2 AND is_active = TRUE 
       ORDER BY position ASC, joined_at ASC LIMIT 1`,
      [player.game_id, preparedQuestionId],
    )

    if (queueFirstResult.rowCount === 0 || queueFirstResult.rows[0].player_id !== preparedPlayerId) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Только первый в очереди может пропустить вопрос' })
      return
    }

    // Деактивируем игрока в очереди
    await client.query(
      'UPDATE answer_queue SET is_active = FALSE WHERE id = $1',
      [queueResult.rows[0].id],
    )

    await client.query('COMMIT')

    if (request.server?.io) {
      request.server.io.emit('player:skipped', {
        gameId: player.game_id,
        questionId: preparedQuestionId,
        playerId: preparedPlayerId,
      })

      // Передаем вопрос следующему в очереди
      await assignQuestionToNextInQueue(request.server.io, player.game_id, preparedQuestionId)
    }

    reply.send({ message: 'Вопрос пропущен' })
  } catch (error) {
    await client.query('ROLLBACK')
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  } finally {
    client.release()
  }
}

export async function getQueue(request, reply) {
  const gameId = toNumber(request.query?.gameId ?? request.params?.gameId)
  const questionId = toNumber(request.query?.questionId)

  if (gameId === null) {
    reply.code(400).send({ message: 'Некорректный gameId' })
    return
  }

  try {
    let targetQuestionId = questionId

    // Если questionId не указан, получаем текущий вопрос игры
    if (targetQuestionId === null) {
      const gameResult = await pool.query(
        'SELECT current_question_index FROM games WHERE id = $1',
        [gameId],
      )
      if (gameResult.rowCount === 0) {
        reply.code(404).send({ message: 'Игра не найдена' })
        return
      }
      const currentIndex = gameResult.rows[0].current_question_index

      const questionResult = await pool.query(
        'SELECT id FROM questions WHERE game_id = $1 ORDER BY position ASC, id ASC LIMIT 1 OFFSET $2',
        [gameId, currentIndex],
      )
      if (questionResult.rowCount > 0) {
        targetQuestionId = questionResult.rows[0].id
      }
    }

    if (targetQuestionId === null) {
      reply.send({ gameId, queue: [] })
      return
    }

    const queue = await getQueueForQuestion(gameId, targetQuestionId)
    reply.send({ gameId, questionId: targetQuestionId, queue })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

