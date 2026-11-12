import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { AuthProvider } from './context/AuthContext';
import AssetsPage from './pages/AssetsPage';
import AttendancePage from './pages/AttendancePage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import LeavePage from './pages/LeavePage';
import LoginPage from './pages/LoginPage';
import AccountActivationPage from './pages/AccountActivationPage';
import OrganizationPage from './pages/OrganizationPage';
import AdminEmployeeDirectoryPage from './pages/AdminEmployeeDirectoryPage';
import OrganizationsPage from './pages/OrganizationsPage';
import BranchesPage from './pages/BranchesPage';
import ManagersPage from './pages/ManagersPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectManagerProjectsPage from './pages/pm/ProjectManagerProjectsPage';
import ProjectTeamPage from './pages/pm/ProjectTeamPage';
import TaskManagementPage from './pages/pm/TaskManagementPage';
import EmployeeAvailabilityPage from './pages/pm/EmployeeAvailabilityPage';
import ScheduleCalendarPage from './pages/pm/ScheduleCalendarPage';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/activate" element={<AccountActivationPage />} />
          <Route path="/activate/:token" element={<AccountActivationPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />

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
      </BrowserRouter>
    </AuthProvider>
  );
}
