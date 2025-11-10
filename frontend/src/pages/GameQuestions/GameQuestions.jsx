import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addQuestion,
  loadQuestions,
  removeQuestion,
  updateQuestion,
  selectQuestions,
  selectQuestionsError,
  selectQuestionsStatus,
} from '../../features/questions/questionsSlice.js'
import { useAppDispatch, useAppSelector, useAsyncStatus } from '../../app/hooks.js'
import { selectGames } from '../../features/games/gamesSlice.js'
import { uploadQuestionImage } from '../../api/uploads.js'
import resolveImageUrl from '../../utils/resolveImageUrl.js'
import styles from './GameQuestions.module.css'

const BackIcon = () => (
  <svg className={styles.smallIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <path
      d="M15.5 5.5 8 12l7.5 6.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const TrashIcon = () => (
  <svg className={styles.smallIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <path
      d="M6 8.5h12l-.8 9.6a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 8.5Zm3.5-2.5В4.7A1.7 1.7 0 0 1 11.2 3h1.6a1.7 1.7 0 0 1 1.7 1.7V6h4.4M5 6h14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function createDefaultAnswers() {
  return [
    { id: null, text: '', isTrue: false },
    { id: null, text: '', isTrue: false },
  ]
}

function GameQuestions() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const questions = useAppSelector(selectQuestions)
  const status = useAppSelector(selectQuestionsStatus)
  const error = useAppSelector(selectQuestionsError)
  const games = useAppSelector(selectGames)

  const { isLoading, isError } = useAsyncStatus(status)
  const currentGame = useMemo(
    () => games.find((game) => String(game.id) === gameId),
    [games, gameId],
  )

  const [questionText, setQuestionText] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [answers, setAnswers] = useState(createDefaultAnswers)
  const [isUploading, setIsUploading] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState(null)
  const [localError, setLocalError] = useState(null)

  useEffect(() => {
    if (gameId) {
      dispatch(loadQuestions(Number(gameId)))
    }
  }, [dispatch, gameId])

  const resetForm = () => {
    setQuestionText('')
    setImageUrl('')
    setAnswers(createDefaultAnswers())
    setLocalError(null)
    setIsUploading(false)
    setEditingQuestionId(null)
  }

  const handleAddAnswer = () => {
    setAnswers((prev) => [...prev, { id: null, text: '', isTrue: false }])
  }

  const handleAnswerChange = (index, field, value) => {
    setAnswers((prev) =>
      prev.map((answer, idx) =>
        idx === index
          ? {
              ...answer,
              [field]: field === 'text' ? value : value,
            }
          : answer,
      ),
    )
  }

  const handleSetCorrect = (index) => {
    setAnswers((prev) => prev.map((answer, idx) => ({ ...answer, isTrue: idx === index })))
  }

  const handleRemoveAnswer = (index) => {
    setAnswers((prev) => prev.filter((_, idx) => idx !== index))
  }

  const validateForm = () => {
    const trimmedText = questionText.trim()
    if (!trimmedText) {
      return 'Введите текст вопроса'
    }
    const preparedAnswers = answers
      .map((item) => ({
        id: item.id ?? null,
        text: item.text.trim(),
        isTrue: item.isTrue,
      }))
      .filter((item) => item.text.length > 0)
    if (preparedAnswers.length < 2) {
      return 'Добавьте как минимум два варианта ответа'
    }
    if (!preparedAnswers.some((item) => item.isTrue)) {
      return 'Отметьте правильный ответ'
    }
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setLocalError(validationError)
      return
    }
    setLocalError(null)

    const preparedAnswers = answers
      .map((item) => ({
        id: item.id ?? null,
        text: item.text.trim(),
        isTrue: item.isTrue,
      }))
      .filter((item) => item.text.length > 0)

    const payload = {
      gameId: Number(gameId),
      text: questionText.trim(),
      imageUrl: imageUrl.trim() || null,
      answers: preparedAnswers,
    }

    if (editingQuestionId) {
      dispatch(updateQuestion({ id: editingQuestionId, payload }))
        .unwrap()
        .then(() => resetForm())
        .catch((err) => {
          setLocalError(err ?? 'Не удалось обновить вопрос')
        })
      return
    }

    dispatch(addQuestion(payload))
      .unwrap()
      .then(() => resetForm())
      .catch((err) => {
        setLocalError(err ?? 'Не удалось создать вопрос')
      })
  }

  const handleDeleteQuestion = (id) => {
    dispatch(removeQuestion(id))
  }

  const handleUploadImage = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    setIsUploading(true)
    setLocalError(null)
    try {
      const { path } = await uploadQuestionImage(file)
      setImageUrl(path)
    } catch (err) {
      setLocalError(err?.message ?? 'Не удалось загрузить изображение')
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const handleRemoveImage = () => {
    setImageUrl('')
  }

  const startEditQuestion = (question) => {
    setEditingQuestionId(question.id)
    setQuestionText(question.text ?? '')
    setImageUrl(question.imageUrl ?? '')
    const normalizedAnswers = (question.answers ?? []).map((answer) => ({
      id: answer.id ?? null,
      text: answer.text ?? '',
      isTrue: Boolean(answer.isTrue),
    }))
    if (normalizedAnswers.length >= 2) {
      setAnswers(normalizedAnswers)
    } else {
      const filled = [...normalizedAnswers, ...createDefaultAnswers()]
      setAnswers(filled.slice(0, 2))
    }
  }

  const currentFormTitle = editingQuestionId ? 'Редактировать вопрос' : 'Добавить вопрос'
  const submitButtonText = editingQuestionId ? 'Сохранить изменения' : 'Сохранить вопрос'

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backButton} onClick={() => navigate('/admin')}>
        <BackIcon />
        Назад к списку квизов
      </button>

      <header className={styles.header}>
        <div>
          <h1>Вопросы квиза</h1>
          <p>{currentGame?.name ?? 'Квиз'}</p>
        </div>
      </header>

      <section className={styles.formCard}>
        <div className={styles.formHeader}>
          <h2>{currentFormTitle}</h2>
          {editingQuestionId && <span className={styles.editBadge}>Режим редактирования</span>}
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Текст вопроса</span>
            <textarea
              rows={3}
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              placeholder="Например: Какой метод отвечает за создание компонента в React?"
            />
          </label>

          <div className={styles.answersBlock}>
            <div className={styles.answersHeader}>
              <span>Варианты ответов</span>
              <button type="button" className={styles.textButton} onClick={handleAddAnswer}>
                Добавить ответ
              </button>
            </div>

            <div className={styles.answersList}>
              {answers.map((answer, index) => (
                <div key={answer.id ?? index} className={styles.answerRow}>
                  <input
                    type="text"
                    value={answer.text}
                    onChange={(event) => handleAnswerChange(index, 'text', event.target.value)}
                    placeholder={`Ответ ${index + 1}`}
                  />
                  <label className={styles.radio}>
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={answer.isTrue}
                      onChange={() => handleSetCorrect(index)}
                    />
                    <span>Правильный</span>
                  </label>
                  {answers.length > 2 && (
                    <button
                      type="button"
                      className={styles.removeAnswerButton}
                      onClick={() => handleRemoveAnswer(index)}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.uploadBlock}>
            <span>Загрузить изображение вопроса</span>
            <div className={styles.uploadControls}>
              <label className={styles.uploadButton}>
                Выбрать файл
                <input type="file" accept="image/*" onChange={handleUploadImage} disabled={isUploading} />
              </label>
              {isUploading && <span className={styles.uploadStatus}>Загружаем…</span>}
              {imageUrl && (
                <button type="button" className={styles.removeImageButton} onClick={handleRemoveImage}>
                  Удалить изображение
                </button>
              )}
            </div>
            {imageUrl && (
              <div className={styles.imagePreview}>
                <img src={resolveImageUrl(imageUrl)} alt="Превью вопроса" />
              </div>
            )}
          </div>

          {(localError || error) && <div className={styles.error}>{localError ?? error}</div>}

          <div className={styles.actionsRow}>
            <button type="submit" className={styles.submitButton}>
              {submitButtonText}
            </button>
            {editingQuestionId && (
              <button type="button" className={styles.cancelButton} onClick={resetForm}>
                Отмена
              </button>
            )}
          </div>
        </form>
      </section>

      <section className={styles.listSection}>
        <h2>Список вопросов</h2>
        {isLoading && <div className={styles.stateBox}>Загружаем вопросы…</div>}
        {isError && (
          <div className={styles.stateBox}>
            Не удалось загрузить вопросы. Попробуйте обновить страницу.
          </div>
        )}
        {!isLoading && !isError && questions.length === 0 && (
          <div className={styles.stateBox}>
            Пока нет ни одного вопроса. Добавьте первый через форму выше.
          </div>
        )}

        {!isLoading && !isError && questions.length > 0 && (
          <div className={styles.questionsList}>
            {questions.map((question) => (
              <article key={question.id} className={styles.questionCard}>
                <div className={styles.questionHeader}>
                  <div className={styles.questionTitleBlock}>
                    <h3>{question.text}</h3>
                    {question.imageUrl && (
                      <div className={styles.questionImageWrapper}>
                        <img src={resolveImageUrl(question.imageUrl)} alt="Изображение вопроса" />
                      </div>
                    )}
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => startEditQuestion(question)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => handleDeleteQuestion(question.id)}
                    >
                      <TrashIcon />
                      Удалить
                    </button>
                  </div>
                </div>

                <ul className={styles.answers}>
                  {(question.answers ?? []).map((answer) => (
                    <li
                      key={answer.id}
                      className={answer.isTrue ? `${styles.answer} ${styles.correct}` : styles.answer}
                    >
                      {answer.text}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default GameQuestions

