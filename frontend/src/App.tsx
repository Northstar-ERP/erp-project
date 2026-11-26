import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';
import { LoadingState } from './components/ui';

// Pages are loaded on demand so the initial bundle stays small.
const AssetsPage = lazy(() => import('./pages/AssetsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const LeavePage = lazy(() => import('./pages/LeavePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AccountActivationPage = lazy(() => import('./pages/AccountActivationPage'));
const OrganizationPage = lazy(() => import('./pages/OrganizationPage'));
const AdminEmployeeDirectoryPage = lazy(() => import('./pages/AdminEmployeeDirectoryPage'));
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage'));
const BranchesPage = lazy(() => import('./pages/BranchesPage'));
const ManagersPage = lazy(() => import('./pages/ManagersPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectManagerProjectsPage = lazy(() => import('./pages/pm/ProjectManagerProjectsPage'));
const ProjectTeamPage = lazy(() => import('./pages/pm/ProjectTeamPage'));
const TaskManagementPage = lazy(() => import('./pages/pm/TaskManagementPage'));
const EmployeeAvailabilityPage = lazy(() => import('./pages/pm/EmployeeAvailabilityPage'));
const ScheduleCalendarPage = lazy(() => import('./pages/pm/ScheduleCalendarPage'));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="grid min-h-[50vh] place-items-center">
              <LoadingState label="Loading…" />
            </div>
          }
        >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/activate" element={<AccountActivationPage />} />
          <Route path="/activate/:token" element={<AccountActivationPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route
                path="/analytics"
                element={
                  <RoleRoute roles={['System Admin', 'HR Manager']}>
                    <AnalyticsPage />
                  </RoleRoute>
                }
              />

              {/* Dedicated Admin Management Routes */}
              <Route
                path="/admin/managers"
                element={
                  <RoleRoute roles={['System Admin']}>
                    <ManagersPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/admin/organizations"
                element={
                  <RoleRoute roles={['System Admin']}>
                    <OrganizationsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/admin/branches"
                element={
                  <RoleRoute roles={['System Admin']}>
                    <BranchesPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/admin/employees"
                element={
                  <RoleRoute roles={['System Admin']}>
                    <AdminEmployeeDirectoryPage />
                  </RoleRoute>
                }
              />

              {/* Dedicated Project Manager Routes */}
              <Route
                path="/pm/projects"
                element={
                  <RoleRoute roles={['System Admin', 'Department / Project Manager']}>
                    <ProjectManagerProjectsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pm/directory"
                element={
                  <RoleRoute roles={['System Admin', 'Department / Project Manager']}>
                    <AdminEmployeeDirectoryPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pm/team"
                element={
                  <RoleRoute roles={['System Admin', 'Department / Project Manager']}>
                    <ProjectTeamPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pm/tasks"
                element={
                  <RoleRoute roles={['System Admin', 'Department / Project Manager']}>
                    <TaskManagementPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pm/availability"
                element={
                  <RoleRoute roles={['System Admin', 'Department / Project Manager']}>
                    <EmployeeAvailabilityPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pm/calendar"
                element={
                  <RoleRoute roles={['System Admin', 'Department / Project Manager']}>
                    <ScheduleCalendarPage />
                  </RoleRoute>
                }
              />

              {/* Standard Enterprise Routes */}
              <Route
                path="/organization"
                element={
                  <RoleRoute roles={['HR Manager']}>
                    <OrganizationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/employees"
                element={
                  <RoleRoute roles={['HR Manager']}>
                    <OrganizationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/projects"
                element={
                  <RoleRoute
                    roles={[
                      'System Admin',
                      'HR Manager',
                      'Department / Project Manager',
                      'Employee',
                    ]}
                  >
                    <ProjectsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/assets"
                element={
                  <RoleRoute
                    roles={[
                      'System Admin',
                      'HR Manager',
                      'Department / Project Manager',
                      'Employee',
                      'IT',
                    ]}
                  >
                    <AssetsPage />
                  </RoleRoute>
                }
              />
              <Route path="/leave" element={<LeavePage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
