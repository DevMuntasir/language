import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { MeetingErrorBoundary } from './components/MeetingErrorBoundary';

const JoinPage = lazy(async () => {
  const module = await import('./pages/JoinPage');
  return { default: module.JoinPage };
});

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/join/:roomId"
        element={(
          <MeetingErrorBoundary>
            <Suspense fallback={<main className="prejoin">Loading meeting…</main>}>
              <JoinPage />
            </Suspense>
          </MeetingErrorBoundary>
        )}
      />
      <Route path="*" element={<main className="not-found"><h1>Page not found</h1><a href="/">Return home</a></main>} />
    </Routes>
  );
}
