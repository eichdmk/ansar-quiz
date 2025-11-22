import styles from '../Dashboard.module.css'

function VerbalQuestionQueuePanel({
  queue,
  gameId,
  questionId,
  pendingGameId,
  onSkipPlayer,
}) {
  if (!queue || queue.length === 0) {
    return null
  }

  const isPending = pendingGameId === gameId

  return (
    <div className={styles.answerStats}>
      <span className={styles.answerStatsTitle}>Очередь ответов ({queue.length})</span>
      <div className={styles.queueList}>
        {queue.map((item, idx) => (
          <div key={item.playerId} className={styles.queueItem}>
            <span className={styles.queuePosition}>{idx + 1}.</span>
            <span className={styles.queuePlayerName}>{item.username}</span>
            {item.groupName && (
              <span className={styles.queueGroupName}>({item.groupName})</span>
            )}
            {item.waitingForEvaluation && (
              <span className={styles.queueStatus}>Ожидает оценки</span>
            )}
            {item.isCorrect === true && (
              <span className={styles.queueStatusCorrect}>✓ Правильно</span>
            )}
            {item.isCorrect === false && (
              <span className={styles.queueStatusWrong}>✗ Неправильно</span>
            )}
            {(item.waitingForEvaluation || (item.isCorrect === null && item.isCorrect !== false && item.isCorrect !== true)) && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onSkipPlayer(gameId, item.playerId, questionId)}
                disabled={isPending}
                style={{ marginLeft: 'auto' }}
              >
                ⏭ Пропустить
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default VerbalQuestionQueuePanel

