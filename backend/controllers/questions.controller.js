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
    const positionResult = await client.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next FROM questions WHERE game_id = $1',
      [preparedGameId],
    )
    const nextPosition = positionResult.rows[0]?.next ?? 1
    const questionResult = await client.query(
      'INSERT INTO questions (question_text, game_id, image_url, position) VALUES ($1, $2, $3, $4) RETURNING id, question_text, game_id, image_url, created_at, position',
      [preparedText, preparedGameId, preparedImage?.length ? preparedImage : null, nextPosition],
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
    
    // Инвалидация кэша вопросов
    const { invalidateQuestionCache } = await import('../services/cache.service.js')
    await invalidateQuestionCache(preparedGameId)

    reply.code(201).send({
      id: question.id,
      text: question.question_text,
      imageUrl: question.image_url,
      createdAt: question.created_at,
      gameId: question.game_id,
      position: question.position,
      answers: createdAnswers.map((row) => ({
        id: row.id,
        text: row.answer_text,
        isTrue: row.is_true,
      })),
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
  const cacheKey = `questions:${preparedGameId}`
  
  try {
    const { cached } = await import('../services/cache.service.js')
    
    const result = await cached(cacheKey, async () => {
      const questionsResult = await pool.query(
        'SELECT id, question_text, image_url, created_at, position FROM questions WHERE game_id = $1 ORDER BY position ASC, created_at ASC',
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
        position: question.position,
        answers: answersMap.get(question.id) ?? [],
      }))
      return {
        gameId: preparedGameId,
        total: items.length,
        items,
      }
    }, 300) // Кэш на 5 минут (вопросы редко меняются)

    reply.send(result)
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
    // Сначала получаем gameId для инвалидации кеша
    const questionResult = await pool.query(
      'SELECT game_id FROM questions WHERE id = $1',
      [id],
    )
    if (questionResult.rowCount === 0) {
      reply.code(404).send({ message: 'Вопрос не найден' })
      return
    }
    const gameId = questionResult.rows[0].game_id

    // Удаляем вопрос
    const result = await pool.query(
      'DELETE FROM questions WHERE id = $1 RETURNING id',
      [id],
    )

    // Инвалидация кэша вопросов
    const { invalidateQuestionCache } = await import('../services/cache.service.js')
    await invalidateQuestionCache(gameId, id)

    reply.send({ id: id })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Ошибка сервера' })
  }
}

function normalizeAnswersForUpdate(raw) {
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
        id: item.id ? Number(item.id) : null,
        text,
        isTrue: Boolean(item.isTrue),
      }
    })
    .filter(Boolean)
}

export async function updateQuestion(request, reply) {
  const questionId = Number(request.params?.id)
  if (Number.isNaN(questionId)) {
    reply.code(400).send({ message: 'Некорректный идентификатор' })
    return
  }

  const { text, imageUrl, answers } = request.body ?? {}
  const preparedText = sanitizeText(text)
  if (!preparedText) {
    reply.code(400).send({ message: 'Введите текст вопроса' })
    return
  }

  const normalizedAnswers = normalizeAnswersForUpdate(answers)
  
  // Разрешаем вопросы без вариантов ответа (пустой массив)
  if (normalizedAnswers.length === 0) {
    // Вопрос без вариантов - это допустимо
  } else {
    // Для вопросов с вариантами требуется минимум 2 варианта и один правильный
    if (normalizedAnswers.length < 2) {
      reply.code(400).send({ message: 'Нужно минимум два варианта ответа' })
      return
    }
    if (!normalizedAnswers.some((item) => item.isTrue)) {
      reply.code(400).send({ message: 'Отметьте правильный ответ' })
      return
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const questionResult = await client.query(
      'UPDATE questions SET question_text = $1, image_url = $2 WHERE id = $3 RETURNING id, question_text, image_url, created_at, game_id, position',
      [preparedText, imageUrl?.trim() || null, questionId],
    )

    if (questionResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Вопрос не найден' })
      return
    }

    const existingAnswersResult = await client.query(
      'SELECT id FROM answers WHERE question_id = $1',
      [questionId],
    )
    const existingIds = new Set(existingAnswersResult.rows.map((row) => row.id))
    const incomingIds = new Set(
      normalizedAnswers.filter((item) => item.id).map((item) => item.id),
    )

    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))
    if (toDelete.length > 0) {
      await client.query(
        'DELETE FROM answers WHERE question_id = $1 AND id = ANY($2::int[])',
        [questionId, toDelete],
      )
    }

    for (const answer of normalizedAnswers) {
      if (answer.id) {
        const updateResult = await client.query(
          'UPDATE answers SET answer_text = $1, is_true = $2 WHERE id = $3 AND question_id = $4',
          [answer.text, answer.isTrue, answer.id, questionId],
        )
        if (updateResult.rowCount === 0) {
          await client.query('ROLLBACK')
          reply
            .code(400)
            .send({ message: 'Ответ не найден или не принадлежит вопросу' })
          return
        }
      } else {
        await client.query(
          'INSERT INTO answers (question_id, answer_text, is_true) VALUES ($1, $2, $3)',
          [questionId, answer.text, answer.isTrue],
        )
      }
    }

    const updatedAnswersResult = await client.query(
      'SELECT id, answer_text, is_true FROM answers WHERE question_id = $1 ORDER BY id ASC',
      [questionId],
    )

    await client.query('COMMIT')

    const gameId = questionResult.rows[0].game_id

    // Инвалидация кэша вопросов
    const { invalidateQuestionCache } = await import('../services/cache.service.js')
    await invalidateQuestionCache(gameId, questionId)

    reply.send({
      id: questionResult.rows[0].id,
      text: questionResult.rows[0].question_text,
      imageUrl: questionResult.rows[0].image_url,
      createdAt: questionResult.rows[0].created_at,
      gameId: gameId,
      position: questionResult.rows[0].position,
      answers: updatedAnswersResult.rows.map((row) => ({
        id: row.id,
        text: row.answer_text,
        isTrue: row.is_true,
      })),
    })
  } catch (error) {
    await client.query('ROLLBACK')
    request.log.error(error)
    reply.code(500).send({ message: 'Не удалось обновить вопрос' })
  } finally {
    client.release()
  }
}

function prepareImportedQuestions(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('Передайте массив вопросов')
  }
  if (raw.length === 0) {
    return []
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Вопрос №${index + 1} имеет некорректный формат`)
    }
    const text = sanitizeText(item.text)
    if (!text) {
      throw new Error(`Вопрос №${index + 1}: укажите текст вопроса`)
    }
    const imageUrl = typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0 ? item.imageUrl.trim() : null
    const answers = sanitizeAnswers(item.answers)
    
    // Разрешаем вопросы без вариантов ответа (пустой массив)
    if (answers.length === 0) {
      // Вопрос без вариантов - это допустимо
    } else {
      // Для вопросов с вариантами требуется минимум 2 варианта и один правильный
      if (answers.length < 2) {
        throw new Error(`Вопрос "${text}": добавьте минимум два варианта ответа или оставьте массив пустым для вопроса без вариантов`)
      }
      if (!answers.some((answer) => answer.isTrue)) {
        throw new Error(`Вопрос "${text}": отметьте правильный ответ`)
      }
    }
    return {
      text,
      imageUrl,
      answers,
    }
  })
}

export async function importQuestions(request, reply) {
  const { gameId, questions } = request.body ?? {}
  const preparedGameId = Number(gameId)
  if (Number.isNaN(preparedGameId)) {
    reply.code(400).send({ message: 'Некорректный идентификатор квиза' })
    return
  }

  let preparedQuestions
  try {
    preparedQuestions = prepareImportedQuestions(questions)
  } catch (error) {
    reply.code(400).send({ message: error.message ?? 'Некорректные данные' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const gameResult = await client.query('SELECT id, name FROM games WHERE id = $1', [preparedGameId])
    if (gameResult.rowCount === 0) {
      await client.query('ROLLBACK')
      reply.code(404).send({ message: 'Квиз не найден' })
      return
    }

    await client.query('DELETE FROM questions WHERE game_id = $1', [preparedGameId])

    const insertedQuestions = []
    for (let index = 0; index < preparedQuestions.length; index += 1) {
      const current = preparedQuestions[index]
      const questionResult = await client.query(
        'INSERT INTO questions (question_text, game_id, image_url, position) VALUES ($1, $2, $3, $4) RETURNING id, question_text, image_url, created_at, position',
        [current.text, preparedGameId, current.imageUrl, index + 1],
      )
      const questionRow = questionResult.rows[0]
      const createdAnswers = []
      for (const answer of current.answers) {
        const answerResult = await client.query(
          'INSERT INTO answers (question_id, answer_text, is_true) VALUES ($1, $2, $3) RETURNING id, answer_text, is_true',
          [questionRow.id, answer.text, answer.isTrue],
        )
        createdAnswers.push({
          id: answerResult.rows[0].id,
          text: answerResult.rows[0].answer_text,
          isTrue: answerResult.rows[0].is_true,
        })
      }
      insertedQuestions.push({
        id: questionRow.id,
        text: questionRow.question_text,
        imageUrl: questionRow.image_url,
        createdAt: questionRow.created_at,
        position: questionRow.position,
        answers: createdAnswers,
      })
    }

    await client.query('COMMIT')

    // Инвалидация кэша вопросов
    const { invalidateQuestionCache } = await import('../services/cache.service.js')
    await invalidateQuestionCache(preparedGameId)

    reply.send({
      gameId: preparedGameId,
      total: insertedQuestions.length,
      questions: insertedQuestions,
    })
  } catch (error) {
    await client.query('ROLLBACK')
    request.log.error(error)
    reply.code(500).send({ message: 'Не удалось импортировать вопросы' })
  } finally {
    client.release()
  }
}

export async function exportQuestions(request, reply) {
  const gameIdFromParams = request.params?.gameId
  const gameIdFromQuery = request.query?.gameId
  const preparedGameId = Number(gameIdFromParams ?? gameIdFromQuery)
  if (Number.isNaN(preparedGameId)) {
    reply.code(400).send({ message: 'Не передан gameId' })
    return
  }

  try {
    const gameResult = await pool.query('SELECT id, name FROM games WHERE id = $1', [preparedGameId])
    if (gameResult.rowCount === 0) {
      reply.code(404).send({ message: 'Квиз не найден' })
      return
    }

    const questionsResult = await pool.query(
      'SELECT id, question_text, image_url, created_at, position FROM questions WHERE game_id = $1 ORDER BY position ASC, created_at ASC',
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

    const questions = questionsResult.rows.map((question) => ({
      id: question.id,
      text: question.question_text,
      imageUrl: question.image_url,
      createdAt: question.created_at,
      position: question.position,
      answers: answersMap.get(question.id) ?? [],
    }))

    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="questions-game-${preparedGameId}.json"`)
      .send({
        gameId: preparedGameId,
        gameName: gameResult.rows[0].name,
        questions,
      })
  } catch (error) {
    request.log.error(error)
    reply.code(500).send({ message: 'Не удалось экспортировать вопросы' })
  }
}