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

