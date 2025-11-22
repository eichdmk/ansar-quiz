import pool from '../plugins/db.js'

function mapAnswer(row) {
  return {
    id: row.id,
    text: row.text,
  }
}

function mapQuestion(row) {
  let answersSource = row.answers ?? []
  if (typeof answersSource === 'string') {
    try {
      answersSource = JSON.parse(answersSource)
    } catch {
      answersSource = []
    }
  }
  if (!Array.isArray(answersSource)) {
    answersSource = []
  }
  return {
    id: row.id,
    text: row.text,
    imageUrl: row.image_url,
    position: row.position,
    questionType: row.question_type || 'multiple_choice',
    answers: answersSource.map(mapAnswer),
  }
}

export async function getQuestionCount(gameId, client = pool) {
  const target = client.query ? client : pool
  const result = await target.query('SELECT COUNT(*)::int AS total FROM questions WHERE game_id = $1', [gameId])
  return result.rows[0]?.total ?? 0
}

export async function getQuestionByIndex(gameId, index, client = pool) {
  const target = client.query ? client : pool
  const result = await target.query(
    `SELECT q.id,
            q.question_text AS text,
            q.image_url,
            q.position,
            q.question_type,
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
    [gameId, index],
  )
  if (result.rowCount === 0) {
    return null
  }
  return mapQuestion(result.rows[0])
}

export async function getCurrentQuestion(gameId, client = pool, playerId = null) {
  const target = client.query ? client : pool
  const gameResult = await target.query(
    'SELECT current_question_index, status, is_question_closed FROM games WHERE id = $1',
    [gameId],
  )
  if (gameResult.rowCount === 0) {
    return { status: 'not_found' }
  }
  const { current_question_index: index, status, is_question_closed: isClosed } = gameResult.rows[0]
  if (status !== 'running') {
    return { status }
  }
  const question = await getQuestionByIndex(gameId, index, target)
  if (!question) {
    return { status: 'finished' }
  }
  const total = await getQuestionCount(gameId, target)
  
  const result = {
    status,
    question,
    index,
    total,
    isClosed: Boolean(isClosed),
  }
  
  // Если передан playerId, проверяем его статус в очереди
  if (playerId !== null && playerId !== undefined) {
    const queueResult = await target.query(
      `SELECT aq.id, aq.position, aq.is_active,
              (SELECT COUNT(*)::int 
               FROM answer_queue aq2 
               WHERE aq2.game_id = $1 
                 AND aq2.question_id = $2 
                 AND aq2.is_active = TRUE 
                 AND (aq2.position < aq.position OR (aq2.position = aq.position AND aq2.joined_at < aq.joined_at))
              ) as players_before
       FROM answer_queue aq
       WHERE aq.game_id = $1 
         AND aq.question_id = $2 
         AND aq.player_id = $3
       LIMIT 1`,
      [gameId, question.id, playerId],
    )
    
    if (queueResult.rowCount > 0) {
      const queueData = queueResult.rows[0]
      const isActive = Boolean(queueData.is_active)
      const position = queueData.position
      const playersBefore = Number(queueData.players_before) || 0
      
      // Игрок имеет вопрос, если он первый в очереди (position = 0 и is_active = true)
      const hasQuestion = isActive && position === 0 && playersBefore === 0
      
      result.playerQueueStatus = {
        inQueue: isActive,
        hasQuestion,
        position: hasQuestion ? 0 : (playersBefore + 1), // Позиция для отображения (начинается с 1)
        queuePosition: position,
      }
    } else {
      // Игрок не в очереди
      result.playerQueueStatus = {
        inQueue: false,
        hasQuestion: false,
        position: null,
        queuePosition: null,
      }
    }
  }
  
  return result
}

export function emitQuestion(io, gameId, payload) {
  if (!io || !payload) {
    return
  }
  io.emit('game:questionOpened', {
    gameId,
    question: payload.question,
    index: payload.index,
    total: payload.total,
    isClosed: Boolean(payload.isClosed),
  })
}
