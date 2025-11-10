import { http } from './http.js'

export const uploadQuestionImage = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await http.post('/uploads/question-image', formData)
  return response.data
}

