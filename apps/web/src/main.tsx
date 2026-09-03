import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query'
import '@tt-calendar/ui/index.css'
import { App, setBackend, createHttpBackend } from '@tt-calendar/ui'
import { ErrorBoundary } from '@tt-calendar/ui/components/ErrorBoundary'

// Web 开发预览：注入 HTTP 后端（vite 代理 /api → data-server 8766）
setBackend(createHttpBackend('/api'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount) => failureCount < 3,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryErrorResetBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)
