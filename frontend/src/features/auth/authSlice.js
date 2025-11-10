import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { http, setAuthToken } from '../../api/http.js'

const tokenFromStorage = localStorage.getItem('quiz_admin_token')

export const loginAdmin = createAsyncThunk(
  'auth/loginAdmin',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await http.post('/auth/login', { username, password })
      return response.data
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось войти. Попробуй ещё раз.'
      return rejectWithValue(message)
    }
  },
)

const initialState = {
  token: tokenFromStorage,
  admin: null,
  status: 'idle',
  error: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.token = null
      state.admin = null
      state.status = 'idle'
      state.error = null
      setAuthToken(null)
    },
    setAdmin(state, action) {
      state.admin = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginAdmin.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loginAdmin.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.token = action.payload.token
        state.admin = action.payload.admin ?? null
        setAuthToken(action.payload.token)
      })
      .addCase(loginAdmin.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? 'Произошла ошибка авторизации'
      })
  },
})

export const { logout, setAdmin } = authSlice.actions

export const selectAuth = (state) => state.auth
export const selectIsAuthenticated = (state) => Boolean(state.auth.token)

export default authSlice.reducer

