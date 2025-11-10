import pool from '../plugins/db.js'

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function sanitizeAnswers(raw) {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const text = sanitizeText(item.text)
      if (!text) {
        return null
      }
      return {
        text,
        isTrue: Boolean(item.isTrue),
      }
    })
    .filter(Boolean)
}

export async function createQuestion(request, reply) {
  const { gameId, text, imageUrl, answers } = request.body ?? {}
  const preparedText = sanitizeText(text)
  const preparedGameId = Number(gameId)
  if (!preparedText || Number.isNaN(preparedGameId)) {
    reply.code(400).send({ message: 'Некорректные данные' })
    return
  }
  const preparedImage = typeof imageUrl === 'string' ? imageUrl.trim() : null
  const cleanedAnswers = sanitizeAnswers(answers)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const questionResult = await client.query(
      'INSERT INTO questions (question_text, game_id, image_url) VALUES ($1, $2, $3) RETURNING id, question_text, game_id, image_url, created_at',
      [preparedText, preparedGameId, preparedImage?.length ? preparedImage : null],
    )
    const question = questionResult.rows[0]
    let createdAnswers = []
    if (cleanedAnswers.length > 0) {
      const inserts = await Promise.all(
        cleanedAnswers.map((item) =>
          client.query(
            'INSERT INTO answers (question_id, answer_text, is_true) VALUES ($1, $2, $3) RETURNING id, answer_text, is_true',
            [question.id, item.text, item.isTrue],
          ),
        ),
      )
      createdAnswers = inserts.map((result) => result.rows[0])
    }
    await client.query('COMMIT')
    reply.code(201).send({
      ...question,
      answers: createdAnswers,
    })
  } catch (error) {
    await client.query('ROLLBACK')
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  } finally {
    client.release()
  }
}

export async function listQuestions(request, reply) {
  const gameIdFromParams = request.params?.gameId
  const gameIdFromQuery = request.query?.gameId
  const preparedGameId = Number(gameIdFromParams ?? gameIdFromQuery)
  if (Number.isNaN(preparedGameId)) {
    reply.code(400).send({ message: 'Не передан gameId' })
    return
  }
  try {
    const questionsResult = await pool.query(
      'SELECT id, question_text, image_url, created_at FROM questions WHERE game_id = $1 ORDER BY created_at ASC',
      [preparedGameId],
    )
    const questionIds = questionsResult.rows.map((item) => item.id)
    let answersMap = new Map()
    if (questionIds.length > 0) {
      const answersResult = await pool.query(
        'SELECT id, question_id, answer_text, is_true FROM answers WHERE question_id = ANY($1::int[]) ORDER BY id ASC',
        [questionIds],
      )
      answersMap = answersResult.rows.reduce((acc, row) => {
        const current = acc.get(row.question_id) ?? []
        current.push({
          id: row.id,
          text: row.answer_text,
          isTrue: row.is_true,
        })
        acc.set(row.question_id, current)
        return acc
      }, new Map())
    }
    const items = questionsResult.rows.map((question) => ({
      id: question.id,
      text: question.question_text,
      imageUrl: question.image_url,
      createdAt: question.created_at,
      answers: answersMap.get(question.id) ?? [],
    }))
    reply.send({
      gameId: preparedGameId,
      total: items.length,
      items,
    })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

export async function deleteQuestion(request, reply) {
  const id = Number(request.params?.id)
  if (Number.isNaN(id)) {
    reply.code(400).send({ message: 'Некорректный идентификатор' })
    return
  }
  try {
    const result = await pool.query(
      'DELETE FROM questions WHERE id = $1 RETURNING id',
      [id],
    )
    if (result.rowCount === 0) {
      reply.code(404).send({ message: 'Вопрос не найден' })
      return
    }
    reply.send({ id: id })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}