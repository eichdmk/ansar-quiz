import VerbalQuestionEvaluationPanel from './VerbalQuestionEvaluationPanel.jsx'
import MultipleChoiceQueuePanel from './MultipleChoiceQueuePanel.jsx'
import VerbalQuestionQueuePanel from './VerbalQuestionQueuePanel.jsx'

function GameQueuePanel({
  queue,
  currentQuestion,
  questionId,
  gameId,
  pendingGameId,
  onEvaluateAnswer,
  onSkipPlayer,
}) {
  // Определяем тип вопроса по полю questionType
  const isValidQuestionId = questionId != null && !Number.isNaN(Number(questionId))
  
  // Проверяем, является ли вопрос устным
  // Используем только questionType из currentQuestion
  // Fallback: если questionType отсутствует, проверяем наличие вариантов ответа
  let isVerbalQuestion = false
  
  if (currentQuestion && isValidQuestionId && currentQuestion.id === Number(questionId)) {
    // Если currentQuestion есть и совпадает с questionId, используем его тип
    if (currentQuestion.questionType === 'verbal') {
      isVerbalQuestion = true
    } else if (currentQuestion.questionType === 'multiple_choice') {
      isVerbalQuestion = false
    } else {
      // Fallback: если questionType отсутствует, проверяем наличие вариантов ответа
      isVerbalQuestion = !currentQuestion.answers || currentQuestion.answers.length === 0
    }
  }
  
  // Если нет валидного questionId или нет очереди, ничего не показываем
  if (!isValidQuestionId || !queue || queue.length === 0) {
    return null
  }
  
  // Для устных вопросов: проверяем, нужно ли показывать панельку оценки
  if (isVerbalQuestion) {
    // Первый игрок в очереди (position = 0 или первый в массиве) - это тот, кто сейчас отвечает
    const currentPlayer = queue[0]
    // Для устных вопросов показываем панельку, если игрок еще не оценен
    // (isCorrect === null/undefined или waitingForEvaluation === true)
    const needsEvaluation = currentPlayer && 
      (currentPlayer.isCorrect === null || 
       currentPlayer.isCorrect === undefined || 
       currentPlayer.waitingForEvaluation === true)
    
    // Показываем панельку оценки для первого игрока в очереди
    if (needsEvaluation && currentPlayer && currentPlayer.playerId) {
      return (
        <VerbalQuestionEvaluationPanel
          currentPlayer={currentPlayer}
          gameId={gameId}
          questionId={questionId}
          pendingGameId={pendingGameId}
          onEvaluateAnswer={onEvaluateAnswer}
          onSkipPlayer={onSkipPlayer}
        />
      )
    }
    
    // Если устный вопрос, но панелька оценки не показана (все игроки оценены или нет игроков)
    return (
      <VerbalQuestionQueuePanel
        queue={queue}
        gameId={gameId}
        questionId={questionId}
        pendingGameId={pendingGameId}
        onSkipPlayer={onSkipPlayer}
      />
    )
  }
  
  // Для вопросов с вариантами показываем очередь
  return (
    <MultipleChoiceQueuePanel
      queue={queue}
      gameId={gameId}
      questionId={questionId}
      pendingGameId={pendingGameId}
      onSkipPlayer={onSkipPlayer}
    />
  )
}

export default GameQueuePanel

