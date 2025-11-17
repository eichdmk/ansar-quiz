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
  const preparedAnswerId = answerId !== null && answerId !== undefined ? toNumber(answerId) : null
  
  if (preparedPlayerId === null || preparedQuestionId === null) {
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
      'SELECT id, game_id, position, question_type FROM questions WHERE id = $1',
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

    const questionType = question.question_type || 'multiple_choice'
    const isVerbalQuestion = questionType === 'verbal'

    let isCorrect = null
    let answer = null

    if (isVerbalQuestion) {
      // Вопрос без вариантов ответа (устный) - answerId не требуется, is_correct будет установлен администратором
      if (preparedAnswerId !== null) {
        await client.query('ROLLBACK')
        reply.code(400).send({ message: 'Для устного вопроса не требуется answerId' })
        return
      }
      // isCorrect остается null - будет установлен администратором через evaluateAnswer
    } else {
      // Вопрос с вариантами ответа - требуется answerId
      if (preparedAnswerId === null) {
        await client.query('ROLLBACK')
        reply.code(400).send({ message: 'Для вопроса с вариантами ответа требуется указать answerId' })
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
      answer = answerResult.rows[0]
      if (answer.question_id !== question.id) {
        await client.query('ROLLBACK')
        reply.code(400).send({ message: 'Ответ не относится к вопросу' })
        return
      }
      isCorrect = Boolean(answer.is_true)
    }

    const currentIndex = Math.max(0, (question.position ?? 1) - 1)
    if (currentIndex !== game.current_question_index) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вопрос уже завершён' })
      return
    }

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

    let insertResult
    if (isVerbalQuestion) {
      // Для устных вопросов создаем запись в verbal_question_responses
      insertResult = await client.query(
        `INSERT INTO verbal_question_responses (player_id, question_id, is_correct)
         VALUES ($1, $2, NULL)
         ON CONFLICT (player_id, question_id)
         DO UPDATE SET answered_at = NOW()
         RETURNING id, answered_at, is_correct`,
        [preparedPlayerId, preparedQuestionId],
      )
    } else {
      // Для вопросов с вариантами используем player_answers
      insertResult = await client.query(
        `INSERT INTO player_answers (player_id, question_id, answer_id, is_correct)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, question_id)
         DO UPDATE SET answer_id = EXCLUDED.answer_id,
                       is_correct = EXCLUDED.is_correct,
                       answered_at = NOW()
         RETURNING id, answered_at, is_correct`,
        [preparedPlayerId, preparedQuestionId, preparedAnswerId, isCorrect],
      )
    }

    let awarded = false
    let updatedPlayer = null

    // Для устных вопросов (isCorrect === null) администратор оценит ответ позже через evaluateAnswer
    // Здесь только создаем запись и оставляем игрока в очереди
    if (isVerbalQuestion) {
      // Устный вопрос - ждем оценки администратора
      // Игрок остается в очереди, администратор увидит его и оценит ответ
    } else if (isCorrect) {
      // Правильный ответ на вопрос с вариантами
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
      // Неправильный ответ на вопрос с вариантами - деактивируем текущего игрока и передаем следующему
      await client.query(
        'UPDATE answer_queue SET is_active = FALSE WHERE id = $1',
        [queueCheckResult.rows[0].id],
      )
    }

    await client.query('COMMIT')

    // Инвалидация кэша
    const { invalidateQueueCache, invalidatePlayerCache, invalidateGameCache } = await import('../services/cache.service.js')
    await invalidateQueueCache(player.game_id, preparedQuestionId)
    if (awarded) {
      await invalidatePlayerCache(player.game_id)
      // Инвалидируем кэш игры (обновлен is_question_closed)
      await invalidateGameCache(player.game_id)
    }

    if (request.server?.io) {
      request.server.io.emit('player:answer', {
        playerId: preparedPlayerId,
        questionId: preparedQuestionId,
        answerId: preparedAnswerId,
        isCorrect,
        gameId: player.game_id,
        waitingForEvaluation: isCorrect === null,
      })
      
      if (isVerbalQuestion) {
        // Устный вопрос - обновляем очередь, чтобы администратор увидел игрока
        await emitQueueUpdate(request.server.io, player.game_id, preparedQuestionId)
      } else if (awarded && updatedPlayer) {
        // Правильный ответ на вопрос с вариантами
        request.server.io.emit('player:scoreUpdated', mapPlayer(updatedPlayer))
        request.server.io.emit('game:questionClosed', {
          gameId: player.game_id,
          questionId: preparedQuestionId,
          winner: mapPlayer(updatedPlayer),
        })
        // Очищаем очередь при правильном ответе
        await emitQueueUpdate(request.server.io, player.game_id, preparedQuestionId)
      } else if (!isCorrect) {
        // Неправильный ответ на вопрос с вариантами - передаем следующему
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
      waitingForEvaluation: isCorrect === null,
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
  const cacheKey = `queue:${gameId}:${questionId}`
  
  // Пытаемся получить из кэша (но только если это не транзакция)
  if (client === pool) {
    const { get, set } = await import('../services/cache.service.js')
    const cached = await get(cacheKey)
    if (cached !== null) {
      return cached
    }
  }

  // Определяем тип вопроса
  const target = client.query ? client : pool
  const questionTypeResult = await target.query(
    'SELECT question_type FROM questions WHERE id = $1',
    [questionId],
  )
  const questionType = questionTypeResult.rowCount > 0 
    ? (questionTypeResult.rows[0].question_type || 'multiple_choice')
    : 'multiple_choice'
  const isVerbalQuestion = questionType === 'verbal'

  // Используем соответствующую таблицу в зависимости от типа вопроса
  const result = await target.query(
    `SELECT aq.id, aq.player_id, aq.position, aq.joined_at,
            p.username, p.group_name, p.score,
            ${isVerbalQuestion 
              ? 'vqr.is_correct' 
              : 'pa.is_correct'} as is_correct
     FROM answer_queue aq
     JOIN players p ON aq.player_id = p.id
     ${isVerbalQuestion
       ? 'LEFT JOIN verbal_question_responses vqr ON vqr.player_id = aq.player_id AND vqr.question_id = aq.question_id'
       : 'LEFT JOIN player_answers pa ON pa.player_id = aq.player_id AND pa.question_id = aq.question_id'}
     WHERE aq.game_id = $1 AND aq.question_id = $2 AND aq.is_active = TRUE
     ORDER BY aq.position ASC, aq.joined_at ASC`,
    [gameId, questionId],
  )
  const queue = result.rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    position: row.position,
    joinedAt: row.joined_at,
    username: row.username,
    groupName: row.group_name,
    score: row.score,
    isCorrect: row.is_correct !== null ? Boolean(row.is_correct) : null,
    waitingForEvaluation: row.is_correct === null,
  }))

  // Сохраняем в кэш только если это не транзакция
  if (client === pool) {
    const { set } = await import('../services/cache.service.js')
    await set(cacheKey, queue, 10) // Кэш на 10 секунд (очередь часто меняется)
  }

  return queue
}

async function assignQuestionToNextInQueue(io, gameId, questionId) {
  if (!io) {
    return
  }
  const client = await pool.connect()
  let clientReleased = false
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
        `SELECT q.id, q.question_text AS text, q.image_url, q.question_type,
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
            questionType: question.question_type || 'multiple_choice',
            answers: answers,
          },
        })
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('Error during rollback:', rollbackError)
    }
    console.error('Error assigning question to next in queue:', error)
    // Отправляем ошибку через socket для уведомления админа
    if (io) {
      io.emit('admin:error', {
        gameId,
        message: 'Ошибка при передаче вопроса следующему игроку',
        error: error.message,
      })
    }
  } finally {
    if (!clientReleased) {
      try {
        client.release()
        clientReleased = true
      } catch (releaseError) {
        // Игнорируем ошибку освобождения, если клиент уже освобожден
        console.error('Error releasing client (may already be released):', releaseError.message)
      }
    }
    // Всегда обновляем очередь через socket, даже если следующего игрока нет
    // Вызываем после освобождения клиента, так как emitQueueUpdate использует pool напрямую
    emitQueueUpdate(io, gameId, questionId).catch((err) => {
      console.error('Error emitting queue update:', err)
    })
  }
}

async function emitQueueUpdate(io, gameId, questionId, client = pool) {
  if (!io) {
    return
  }
  const queue = await getQueueForQuestion(gameId, questionId, client)
  
  // Инвалидация кэша очереди при обновлении
  if (client === pool) {
    const { invalidateQueueCache } = await import('../services/cache.service.js')
    await invalidateQueueCache(gameId, questionId)
  }
  
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
      `SELECT q.id, q.question_text AS text, q.image_url, q.question_type,
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

      // Инвалидация кэша очереди
      const { invalidateQueueCache } = await import('../services/cache.service.js')
      await invalidateQueueCache(preparedGameId, questionId)

      if (request.server?.io) {
        request.server.io.emit('player:questionAssigned', {
          gameId: preparedGameId,
          questionId,
          playerId: preparedPlayerId,
          question: {
            id: question.id,
            text: question.text,
            imageUrl: question.image_url,
            questionType: question.question_type || 'multiple_choice',
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
          questionType: question.question_type || 'multiple_choice',
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

      // Инвалидация кэша очереди
      const { invalidateQueueCache } = await import('../services/cache.service.js')
      await invalidateQueueCache(preparedGameId, questionId)

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

    // Инвалидация кэша очереди
    const { invalidateQueueCache } = await import('../services/cache.service.js')
    await invalidateQueueCache(player.game_id, preparedQuestionId)

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

export async function evaluateAnswer(request, reply) {
  const { playerId, questionId, isCorrect } = request.body ?? {}
  const preparedPlayerId = toNumber(playerId)
  const preparedQuestionId = toNumber(questionId)
  
  if (preparedPlayerId === null || preparedQuestionId === null || typeof isCorrect !== 'boolean') {
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

    // Проверяем игру
    const gameResult = await client.query(
      'SELECT id, status, is_question_closed FROM games WHERE id = $1 FOR UPDATE',
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
      reply.code(409).send({ message: 'Игра не запущена' })
      return
    }

    // Проверяем, что вопрос не закрыт
    if (game.is_question_closed) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вопрос уже закрыт' })
      return
    }

    // Проверяем тип вопроса - оценка разрешена только для устных вопросов
    const questionResult = await client.query(
      'SELECT id, question_type FROM questions WHERE id = $1',
      [preparedQuestionId],
    )
    if (questionResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Вопрос не найден' })
      return
    }
    const question = questionResult.rows[0]
    const questionType = question.question_type || 'multiple_choice'
    if (questionType !== 'verbal') {
      await client.query('ROLLBACK')
      reply.code(400).send({ message: 'Оценка разрешена только для устных вопросов (без вариантов ответа)' })
      return
    }

    // Проверяем, что игрок в очереди, активен и является первым в очереди
    // Объединяем проверку в один запрос для оптимизации
    const queueCheckResult = await client.query(
      `SELECT aq.id, aq.position,
         (SELECT aq2.player_id 
          FROM answer_queue aq2
          WHERE aq2.game_id = $1 AND aq2.question_id = $2 AND aq2.is_active = TRUE
          ORDER BY aq2.position ASC, aq2.joined_at ASC
          LIMIT 1) as first_player_id
       FROM answer_queue aq
       WHERE aq.game_id = $1 AND aq.question_id = $2 AND aq.player_id = $3 AND aq.is_active = TRUE
       LIMIT 1`,
      [player.game_id, preparedQuestionId, preparedPlayerId],
    )

    if (queueCheckResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Игрок не в очереди или уже не активен' })
      return
    }

    const queueData = queueCheckResult.rows[0]
    if (queueData.first_player_id !== preparedPlayerId) {
      await client.query('ROLLBACK')
      reply.code(409).send({ message: 'Вы можете оценить только ответ первого игрока в очереди' })
      return
    }

    // Проверяем, есть ли запись об ответе игрока в verbal_question_responses, если нет - создаем
    const answerResult = await client.query(
      'SELECT id, is_correct FROM verbal_question_responses WHERE player_id = $1 AND question_id = $2',
      [preparedPlayerId, preparedQuestionId],
    )
    
    let responseId
    if (answerResult.rowCount === 0) {
      // Создаем запись об ответе для устного вопроса
      const insertResult = await client.query(
        `INSERT INTO verbal_question_responses (player_id, question_id, is_correct)
         VALUES ($1, $2, NULL)
         RETURNING id`,
        [preparedPlayerId, preparedQuestionId],
      )
      responseId = insertResult.rows[0].id
    } else {
      const existingResponse = answerResult.rows[0]
      
      // Проверяем, что ответ еще не был оценен (is_correct должен быть NULL)
      if (existingResponse.is_correct !== null) {
        await client.query('ROLLBACK')
        reply.code(409).send({ message: 'Ответ уже был оценен' })
        return
      }
      responseId = existingResponse.id
    }

    // Обновляем оценку ответа в verbal_question_responses
    await client.query(
      'UPDATE verbal_question_responses SET is_correct = $1, evaluated_at = NOW() WHERE id = $2',
      [isCorrect, responseId],
    )

    let awarded = false
    let updatedPlayer = null

    if (isCorrect) {
      // Правильный ответ - начисляем балл и закрываем вопрос
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
      // Неправильный ответ - деактивируем текущего игрока
      await client.query(
        'UPDATE answer_queue SET is_active = FALSE WHERE id = $1',
        [queueData.id],
      )
    }

    await client.query('COMMIT')

    // Инвалидация кэша
    const { invalidateQueueCache, invalidatePlayerCache, invalidateGameCache } = await import('../services/cache.service.js')
    await invalidateQueueCache(player.game_id, preparedQuestionId)
    if (awarded) {
      await invalidatePlayerCache(player.game_id)
      // Инвалидируем кэш игры (обновлен is_question_closed)
      await invalidateGameCache(player.game_id)
    }

    // Отправляем socket события
    if (request.server?.io) {
      request.server.io.emit('player:answerEvaluated', {
        playerId: preparedPlayerId,
        questionId: preparedQuestionId,
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
        await emitQueueUpdate(request.server.io, player.game_id, preparedQuestionId)
      } else if (!isCorrect) {
        // Неправильный ответ - передаем следующему
        await assignQuestionToNextInQueue(request.server.io, player.game_id, preparedQuestionId)
      } else {
        // Обновляем очередь в любом случае
        await emitQueueUpdate(request.server.io, player.game_id, preparedQuestionId)
      }
    }

    reply.send({
      playerId: preparedPlayerId,
      questionId: preparedQuestionId,
      isCorrect,
      awarded,
      questionClosed: awarded && isCorrect,
    })
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

