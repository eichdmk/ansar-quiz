import resolveImageUrl from '../../../utils/resolveImageUrl.js'
import styles from '../Dashboard.module.css'

function GameCardStats({ 
  game, 
  totalPlayersInGame, 
  answeredCount, 
  wrongCount, 
  pendingCount,
  isQuestionInPreview,
  currentQuestion,
}) {
  const shouldShowAnswerStats =
    game.status === 'running' && (totalPlayersInGame > 0 || answeredCount > 0)

  return (
    <>
      {game.status === 'ready' && totalPlayersInGame > 0 && (
        <div className={styles.answerStats}>
          <span className={styles.answerStatsTitle}>Игроков в комнате</span>
          <div className={styles.answerStatsRow}>
            <span className={styles.answerStatsAnswered}>{totalPlayersInGame}</span>
          </div>
        </div>
      )}
      {isQuestionInPreview && currentQuestion && (
        <div className={styles.questionPreview}>
          <span className={styles.answerStatsTitle}>Текущий вопрос (превью)</span>
          <div className={styles.questionPreviewContent}>
            <h4>{currentQuestion.text}</h4>
            {currentQuestion.imageUrl && (
              <div className={styles.questionPreviewImage}>
                <img src={resolveImageUrl(currentQuestion.imageUrl)} alt="Изображение вопроса" />
              </div>
            )}
          </div>
        </div>
      )}
      {shouldShowAnswerStats && (
        <div className={styles.answerStats}>
          <span className={styles.answerStatsTitle}>Ответы текущего вопроса</span>
          <div className={styles.answerStatsRow}>
            <span className={styles.answerStatsWrong}>
              Неверных: {wrongCount} из {Math.max(totalPlayersInGame, 0)}
            </span>
            <span className={styles.answerStatsAnswered}>
              Ответили: {answeredCount} / {Math.max(totalPlayersInGame, 0)}
            </span>
            {pendingCount > 0 && (
              <span className={styles.answerStatsPending}>
                Не ответили: {pendingCount}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default GameCardStats

