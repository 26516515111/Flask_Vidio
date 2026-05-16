import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes for large file uploads
});

// Response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Enhance error message for common scenarios
    if (error.response) {
      // Server returned error response
      const data = error.response.data;
      if (data && typeof data === 'object' && data.error) {
        error.message = data.error;
      } else if (typeof data === 'string') {
        error.message = data;
      }
    } else if (error.request) {
      // Request made but no response received
      error.message = '网络请求超时，请检查网络连接后重试';
    }
    return Promise.reject(error);
  }
);

export default api;
