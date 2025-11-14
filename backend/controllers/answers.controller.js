import pool from '../plugins/db.js'

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

export async function createAnswer(request, reply) {
  const { questionId, text, isTrue } = request.body ?? {}
  const preparedQuestionId = Number(questionId)
  const preparedText = sanitizeText(text)
  if (Number.isNaN(preparedQuestionId) || !preparedText) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  try {
    const question = await pool.query(
      'SELECT id FROM questions WHERE id = $1',
      [preparedQuestionId],
    )
    if (question.rowCount === 0) {
      reply.code(404).send({ message: 'Вопрос не найден' })
      return
    }
    const result = await pool.query(
      'INSERT INTO answers (question_id, answer_text, is_true) VALUES ($1, $2, $3) RETURNING id, question_id, answer_text, is_true',
      [preparedQuestionId, preparedText, Boolean(isTrue)],
    )
    
    // Инвалидация кэша вопросов (вопросы кешируются вместе с ответами)
    const questionResult = await pool.query('SELECT game_id FROM questions WHERE id = $1', [preparedQuestionId])
    if (questionResult.rowCount > 0) {
      const { invalidateQuestionCache } = await import('../services/cache.service.js')
      await invalidateQuestionCache(questionResult.rows[0].game_id, preparedQuestionId)
    }
    
    reply.code(201).send({
      id: result.rows[0].id,
      questionId: result.rows[0].question_id,
      text: result.rows[0].answer_text,
      isTrue: result.rows[0].is_true,
    })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

export async function updateAnswer(request, reply) {
  const answerId = Number(request.params?.id)
  const { text, isTrue } = request.body ?? {}
  const preparedText = sanitizeText(text)
  if (Number.isNaN(answerId) || !preparedText) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  try {
    const result = await pool.query(
      'UPDATE answers SET answer_text = $1, is_true = $2 WHERE id = $3 RETURNING id, question_id, answer_text, is_true',
      [preparedText, Boolean(isTrue), answerId],
    )
    if (result.rowCount === 0) {
      reply.code(404).send({ message: 'Ответ не найден' })
      return
    }
    
    // Инвалидация кэша вопросов (вопросы кешируются вместе с ответами)
    const questionId = result.rows[0].question_id
    const questionResult = await pool.query('SELECT game_id FROM questions WHERE id = $1', [questionId])
    if (questionResult.rowCount > 0) {
      const { invalidateQuestionCache } = await import('../services/cache.service.js')
      await invalidateQuestionCache(questionResult.rows[0].game_id, questionId)
    }
    
    reply.send({
      id: result.rows[0].id,
      questionId: result.rows[0].question_id,
      text: result.rows[0].answer_text,
      isTrue: result.rows[0].is_true,
    })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

export async function deleteAnswer(request, reply) {
  const answerId = Number(request.params?.id)
  if (Number.isNaN(answerId)) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  try {
    // Сначала получаем questionId для инвалидации кеша
    const answerResult = await pool.query('SELECT question_id FROM answers WHERE id = $1', [answerId])
    if (answerResult.rowCount === 0) {
      reply.code(404).send({ message: 'Ответ не найден' })
      return
    }
    const questionId = answerResult.rows[0].question_id
    
    const result = await pool.query(
      'DELETE FROM answers WHERE id = $1 RETURNING id',
      [answerId],
    )
    
    // Инвалидация кэша вопросов (вопросы кешируются вместе с ответами)
    const questionResult = await pool.query('SELECT game_id FROM questions WHERE id = $1', [questionId])
    if (questionResult.rowCount > 0) {
      const { invalidateQuestionCache } = await import('../services/cache.service.js')
      await invalidateQuestionCache(questionResult.rows[0].game_id, questionId)
    }
    
    reply.send({ id: answerId })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

export async function listAnswers(request, reply) {
  const questionIdFromParams = request.params?.questionId
  const questionIdFromQuery = request.query?.questionId
  const preparedQuestionId = Number(questionIdFromParams ?? questionIdFromQuery)
  if (Number.isNaN(preparedQuestionId)) {
    reply.code(400).send({ message: 'Не передан questionId' })
    return
  }
  try {
    const result = await pool.query(
      'SELECT id, answer_text, is_true FROM answers WHERE question_id = $1 ORDER BY id ASC',
      [preparedQuestionId],
    )
    reply.send({
      questionId: preparedQuestionId,
      total: result.rowCount,
      items: result.rows.map((row) => ({
        id: row.id,
        text: row.answer_text,
        isTrue: row.is_true,
      })),
    })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

