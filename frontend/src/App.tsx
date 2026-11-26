import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { AuthProvider } from './context/AuthContext';
import AssetsPage from './pages/AssetsPage';
// @ts-expect-error AnalyticsPage is implemented in JavaScript and has no declaration file.
import AnalyticsPage from './pages/AnalyticsPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import LeavePage from './pages/LeavePage';
import LoginPage from './pages/LoginPage';
import OrganizationPage from './pages/OrganizationPage';
import ProjectsPage from './pages/ProjectsPage';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/organization" element={<RoleRoute roles={['System Admin', 'HR Manager']}><OrganizationPage /></RoleRoute>} />
              <Route path="/projects" element={<RoleRoute roles={['System Admin', 'HR Manager', 'Department / Project Manager']}><ProjectsPage /></RoleRoute>} />
              <Route path="/assets" element={<RoleRoute roles={['System Admin', 'HR Manager', 'Department / Project Manager', 'Employee', 'IT']}><AssetsPage /></RoleRoute>} />
              <Route path="/leave" element={<LeavePage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
