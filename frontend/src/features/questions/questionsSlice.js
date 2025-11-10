import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { createQuestion, deleteQuestion, fetchQuestions, updateQuestion as updateQuestionApi } from '../../api/questions.js'

export const loadQuestions = createAsyncThunk(
  'questions/loadQuestions',
  async (gameId, { rejectWithValue }) => {
    try {
      const data = await fetchQuestions(gameId)
      return { gameId, data }
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось загрузить вопросы'
      return rejectWithValue(message)
    }
  },
)

export const addQuestion = createAsyncThunk(
  'questions/addQuestion',
  async (payload, { rejectWithValue }) => {
    try {
      const data = await createQuestion(payload)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось создать вопрос'
      return rejectWithValue(message)
    }
  },
)

export const removeQuestion = createAsyncThunk(
  'questions/removeQuestion',
  async (id, { rejectWithValue }) => {
    try {
      await deleteQuestion(id)
      return id
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось удалить вопрос'
      return rejectWithValue(message)
    }
  },
)

export const updateQuestion = createAsyncThunk(
  'questions/updateQuestion',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const data = await updateQuestionApi(id, payload)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось обновить вопрос'
      return rejectWithValue(message)
    }
  },
)

const initialState = {
  items: [],
  status: 'idle',
  error: null,
  gameId: null,
}

const questionsSlice = createSlice({
  name: 'questions',
  initialState,
  reducers: {
    resetQuestions(state) {
      state.items = []
      state.status = 'idle'
      state.error = null
      state.gameId = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadQuestions.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadQuestions.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.items = action.payload.data.items ?? action.payload.data ?? []
        state.gameId = action.payload.gameId
      })
      .addCase(loadQuestions.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? 'Не удалось загрузить вопросы'
      })
      .addCase(addQuestion.pending, (state) => {
        state.error = null
      })
      .addCase(addQuestion.fulfilled, (state, action) => {
        state.items = [action.payload, ...state.items]
      })
      .addCase(addQuestion.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось создать вопрос'
      })
      .addCase(removeQuestion.fulfilled, (state, action) => {
        state.items = state.items.filter((question) => question.id !== action.payload)
      })
      .addCase(removeQuestion.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось удалить вопрос'
      })
      .addCase(updateQuestion.pending, (state) => {
        state.error = null
      })
      .addCase(updateQuestion.fulfilled, (state, action) => {
        state.items = state.items.map((question) =>
          question.id === action.payload.id ? action.payload : question,
        )
      })
      .addCase(updateQuestion.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось обновить вопрос'
      })
  },
})

export const { resetQuestions } = questionsSlice.actions

export const selectQuestionsState = (state) => state.questions
export const selectQuestions = (state) => state.questions.items
export const selectQuestionsStatus = (state) => state.questions.status
export const selectQuestionsError = (state) => state.questions.error

export default questionsSlice.reducer

