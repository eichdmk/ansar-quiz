import styles from '../Dashboard.module.css'

function VerbalQuestionEvaluationPanel({
  currentPlayer,
  gameId,
  questionId,
  pendingGameId,
  onEvaluateAnswer,
  onSkipPlayer,
}) {
  if (!currentPlayer || !currentPlayer.playerId) {
    return null
  }

  const isPending = pendingGameId === gameId

  return (
    <div className={styles.answerStats}>
      <span className={styles.answerStatsTitle}>Оценка ответа</span>
      <div className={styles.queueList}>
        <div className={styles.queueItem}>
          <span className={styles.queuePlayerName}>{currentPlayer.username}</span>
          {currentPlayer.groupName && (
            <span className={styles.queueGroupName}>({currentPlayer.groupName})</span>
          )}
          <div className={styles.queueActions}>
            <button
              type="button"
              className={styles.successButton}
              onClick={() => onEvaluateAnswer(gameId, currentPlayer.playerId, questionId, true)}
              disabled={isPending}
            >
              ✓ Правильно
            </button>
            <button
              type="button"
              className={styles.warningButton}
              onClick={() => onEvaluateAnswer(gameId, currentPlayer.playerId, questionId, false)}
              disabled={isPending}
            >
              ✗ Неправильно
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => onSkipPlayer(gameId, currentPlayer.playerId, questionId)}
              disabled={isPending}
            >
              ⏭ Пропустить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VerbalQuestionEvaluationPanel

