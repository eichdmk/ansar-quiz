import GameCardHeader from './GameCardHeader.jsx'
import GameCardStats from './GameCardStats.jsx'
import GameCardActions from './GameCardActions.jsx'
import GameQueuePanel from './GameQueuePanel.jsx'
import styles from '../Dashboard.module.css'

function GameCard({
  game,
  answerStats,
  currentQuestions,
  queues,
  pendingGameId,
  navigate,
  onEvaluateAnswer,
  onSkipPlayer,
  onOpen,
  onLaunch,
  onCancelLobby,
  onStop,
  onStartQuestion,
  onNextQuestion,
  onRestart,
  onDelete,
}) {
  const stats = answerStats[Number(game.id)] ?? { totalPlayers: 0, answers: {} }
  const totalPlayersInGame = stats.totalPlayers ?? 0
  const answersRecord = stats.answers ?? {}
  const answeredCount = Object.keys(answersRecord).length
  const wrongCount = Object.values(answersRecord).filter(
    (item) => item && item.isCorrect === false,
  ).length
  const pendingCount = Math.max(totalPlayersInGame - answeredCount, 0)
  const currentQuestion = currentQuestions[Number(game.id)]
  const isQuestionInPreview = game.status === 'running' && game.is_question_closed && currentQuestion

  const queueData = queues[Number(game.id)]
  const queue = queueData?.queue || []
  const questionId = queueData?.questionId || currentQuestion?.id

  const cardClassName = `${styles.card} ${
    game.status === 'running'
      ? styles.cardRunning
      : game.status === 'finished'
        ? styles.cardFinished
        : game.status === 'ready'
          ? styles.cardReady
          : ''
  }`

  return (
    <article key={game.id} className={cardClassName}>
      <div className={styles.cardInfo}>
        <GameCardHeader game={game} />
        <GameCardStats
          game={game}
          totalPlayersInGame={totalPlayersInGame}
          answeredCount={answeredCount}
          wrongCount={wrongCount}
          pendingCount={pendingCount}
          isQuestionInPreview={isQuestionInPreview}
          currentQuestion={currentQuestion}
        />
        {game.status === 'running' && !isQuestionInPreview && (
          <GameQueuePanel
            queue={queue}
            currentQuestion={currentQuestion}
            questionId={questionId}
            gameId={game.id}
            pendingGameId={pendingGameId}
            onEvaluateAnswer={onEvaluateAnswer}
            onSkipPlayer={onSkipPlayer}
          />
        )}
      </div>
      <GameCardActions
        game={game}
        isQuestionInPreview={isQuestionInPreview}
        pendingGameId={pendingGameId}
        navigate={navigate}
        handleOpen={onOpen}
        handleLaunch={onLaunch}
        handleCancelLobby={onCancelLobby}
        handleStop={onStop}
        handleStartQuestion={onStartQuestion}
        handleNextQuestion={onNextQuestion}
        handleRestart={onRestart}
        handleDelete={onDelete}
      />
    </article>
  )
}

export default GameCard

