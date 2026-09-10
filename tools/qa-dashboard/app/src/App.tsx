import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/Layout';
import { OverviewPage } from '@/pages/Overview';
import { RunsPage } from '@/pages/Runs';
import { RunDetailPage } from '@/pages/RunDetail';
import { TestExecutionPage } from '@/pages/TestExecution';
import { TestsPage } from '@/pages/Tests';
import { TestHistoryPage } from '@/pages/TestHistory';
import { SuiteDetailPage, SuitesPage } from '@/pages/Suites';
import { FailuresPage } from '@/pages/Failures';
import { FlakyPage } from '@/pages/Flaky';
import { HistoryPage } from '@/pages/History';
import { SettingsPage } from '@/pages/Settings';
import { EmptyState } from '@/components/States';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<OverviewPage />} />
              <Route path="runs" element={<RunsPage />} />
              <Route path="runs/:runId" element={<RunDetailPage />} />
              <Route path="executions/:runTestId" element={<TestExecutionPage />} />
              <Route path="suites" element={<SuitesPage />} />
              <Route path="suites/:suiteId" element={<SuiteDetailPage />} />
              <Route path="tests" element={<TestsPage />} />
              <Route path="tests/:testId" element={<TestHistoryPage />} />
              <Route path="failures" element={<FailuresPage />} />
              <Route path="flaky" element={<FlakyPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="overview" element={<Navigate to="/" replace />} />
              <Route path="*" element={<EmptyState title="Page not found" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
