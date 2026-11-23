import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageLoading } from './components/PageLoading';
import { CrewLayout } from './layouts/CrewLayout';
import { ManagementLayout } from './layouts/ManagementLayout';
import { PortalLanding, PermissionRoute, ProtectedRoute } from './routes/guards';

const CrewBookingPage = lazy(() =>
  import('./pages/CrewBookingPage').then((module) => ({ default: module.CrewBookingPage })),
);
const CrewCheckInPage = lazy(() =>
  import('./pages/CrewCheckInPage').then((module) => ({ default: module.CrewCheckInPage })),
);
const CrewCheckOutPage = lazy(() =>
  import('./pages/CrewCheckOutPage').then((module) => ({ default: module.CrewCheckOutPage })),
);
const CrewDormitoryPage = lazy(() =>
  import('./pages/CrewDormitoryPage').then((module) => ({ default: module.CrewDormitoryPage })),
);
const CrewHelpPage = lazy(() =>
  import('./pages/CrewHelpPage').then((module) => ({ default: module.CrewHelpPage })),
);
const CrewHomePage = lazy(() =>
  import('./pages/CrewHomePage').then((module) => ({ default: module.CrewHomePage })),
);
const CrewNotificationsPage = lazy(() =>
  import('./pages/CrewNotificationsPage').then((module) => ({ default: module.CrewNotificationsPage })),
);
const CrewProfilePage = lazy(() =>
  import('./pages/CrewProfilePage').then((module) => ({ default: module.CrewProfilePage })),
);
const CrewReservationDetailPage = lazy(() =>
  import('./pages/CrewReservationDetailPage').then((module) => ({
    default: module.CrewReservationDetailPage,
  })),
);
const CrewReservationsPage = lazy(() =>
  import('./pages/CrewReservationsPage').then((module) => ({ default: module.CrewReservationsPage })),
);
const CrewSearchPage = lazy(() =>
  import('./pages/CrewSearchPage').then((module) => ({ default: module.CrewSearchPage })),
);
const CrewSchedulePage = lazy(() =>
  import('./pages/CrewSchedulePage').then((module) => ({ default: module.CrewSchedulePage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const EmployeesPage = lazy(() =>
  import('./pages/EmployeesPage').then((module) => ({ default: module.EmployeesPage })),
);
const EmployeeDetailPage = lazy(() =>
  import('./pages/EmployeeDetailPage').then((module) => ({ default: module.EmployeeDetailPage })),
);
const ForbiddenPage = lazy(() =>
  import('./pages/FallbackPages').then((module) => ({ default: module.ForbiddenPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/FallbackPages').then((module) => ({ default: module.NotFoundPage })),
);
const FrontDeskPage = lazy(() =>
  import('./pages/FrontDeskPage').then((module) => ({ default: module.FrontDeskPage })),
);
const HousekeepingPage = lazy(() =>
  import('./pages/HousekeepingPage').then((module) => ({ default: module.HousekeepingPage })),
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const MaintenancePage = lazy(() =>
  import('./pages/MaintenancePage').then((module) => ({ default: module.MaintenancePage })),
);
const MasterDataPage = lazy(() =>
  import('./pages/MasterDataPage').then((module) => ({ default: module.MasterDataPage })),
);
const ManagementAvailabilityPage = lazy(() =>
  import('./pages/ManagementAvailabilityPage').then((module) => ({
    default: module.ManagementAvailabilityPage,
  })),
);
const ManagementCalendarPage = lazy(() =>
  import('./pages/ManagementCalendarPage').then((module) => ({
    default: module.ManagementCalendarPage,
  })),
);
const ManagementGalleryPage = lazy(() =>
  import('./pages/ManagementGalleryPage').then((module) => ({
    default: module.ManagementGalleryPage,
  })),
);
const ManagementInventoryPage = lazy(() =>
  import('./pages/ManagementInventoryPage').then((module) => ({
    default: module.ManagementInventoryPage,
  })),
);
const ManagementReservationsPage = lazy(() =>
  import('./pages/ManagementReservationsPage').then((module) => ({
    default: module.ManagementReservationsPage,
  })),
);
const NotificationDeliveriesPage = lazy(() =>
  import('./pages/NotificationDeliveriesPage').then((module) => ({
    default: module.NotificationDeliveriesPage,
  })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })),
);
const ResearchPage = lazy(() =>
  import('./pages/ResearchPage').then((module) => ({ default: module.ResearchPage })),
);
const RosterPage = lazy(() =>
  import('./pages/RosterPage').then((module) => ({ default: module.RosterPage })),
);
const UsersPage = lazy(() =>
  import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })),
);

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoading fullScreen />}>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <PortalLanding />
            </ProtectedRoute>
          }
        />

        <Route
          path="/crew"
          element={
            <ProtectedRoute>
              <CrewLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<CrewHomePage />} />
          <Route
            path="search"
            element={
              <PermissionRoute permission="availability.read">
                <CrewSearchPage />
              </PermissionRoute>
            }
          />
          <Route
            path="dormitories/:id"
            element={
              <PermissionRoute permission="dormitories.read">
                <CrewDormitoryPage />
              </PermissionRoute>
            }
          />
          <Route
            path="book"
            element={
              <PermissionRoute permission="reservations.create">
                <CrewBookingPage />
              </PermissionRoute>
            }
          />
          <Route
            path="reservations"
            element={
              <PermissionRoute permission="reservations.read">
                <CrewReservationsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="reservations/:id"
            element={
              <PermissionRoute permission="reservations.read">
                <CrewReservationDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="schedule"
            element={
              <PermissionRoute permission="reservations.read">
                <CrewSchedulePage />
              </PermissionRoute>
            }
          />
          <Route
            path="history"
            element={
              <PermissionRoute permission="reservations.read">
                <CrewReservationsPage mode="history" />
              </PermissionRoute>
            }
          />
          <Route
            path="check-in"
            element={
              <PermissionRoute permission="stays.read">
                <CrewCheckInPage />
              </PermissionRoute>
            }
          />
          <Route
            path="check-out"
            element={
              <PermissionRoute permission="stays.read">
                <CrewCheckOutPage />
              </PermissionRoute>
            }
          />
          <Route path="notifications" element={<CrewNotificationsPage />} />
          <Route path="profile" element={<CrewProfilePage />} />
          <Route path="help" element={<CrewHelpPage />} />
        </Route>

        <Route
          path="/manage"
          element={
            <ProtectedRoute>
              <ManagementLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/manage/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="reservations"
            element={
              <PermissionRoute permission="reservations.read">
                <ManagementReservationsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="availability"
            element={
              <PermissionRoute permission="availability.read">
                <ManagementAvailabilityPage />
              </PermissionRoute>
            }
          />
          <Route
            path="calendar"
            element={
              <PermissionRoute permission="reservations.read">
                <ManagementCalendarPage />
              </PermissionRoute>
            }
          />
          <Route
            path="front-desk"
            element={
              <PermissionRoute permission="stays.read">
                <FrontDeskPage />
              </PermissionRoute>
            }
          />
          <Route path="inventory" element={<ManagementInventoryPage />} />
          <Route
            path="research"
            element={
              <PermissionRoute permission="research.read">
                <ResearchPage />
              </PermissionRoute>
            }
          />
          <Route
            path="gallery"
            element={
              <PermissionRoute permission="photos.manage">
                <ManagementGalleryPage />
              </PermissionRoute>
            }
          />
          <Route
            path="housekeeping"
            element={
              <PermissionRoute permission="housekeeping.read">
                <HousekeepingPage />
              </PermissionRoute>
            }
          />
          <Route
            path="maintenance"
            element={
              <PermissionRoute permission="maintenance.read">
                <MaintenancePage />
              </PermissionRoute>
            }
          />
          <Route
            path="roster"
            element={
              <PermissionRoute permission="roster.read">
                <RosterPage />
              </PermissionRoute>
            }
          />
          <Route
            path="reports"
            element={
              <PermissionRoute permission="reports.read">
                <ReportsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="notification-deliveries"
            element={
              <PermissionRoute permission="notifications.manage">
                <NotificationDeliveriesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="master-data"
            element={
              <PermissionRoute permission="dormitories.read">
                <MasterDataPage />
              </PermissionRoute>
            }
          />
          <Route
            path="employees"
            element={
              <PermissionRoute permission="employees.read">
                <EmployeesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="employees/:id"
            element={
              <PermissionRoute permission="employees.read">
                <EmployeeDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="users"
            element={
              <PermissionRoute permission="users.read">
                <UsersPage />
              </PermissionRoute>
            }
          />
          <Route
            path="audit"
            element={
              <PermissionRoute permission="audit.read">
                <Navigate to="/manage/users?tab=audit" replace />
              </PermissionRoute>
            }
          />
          <Route
            path="settings"
            element={
              <PermissionRoute permission="settings.manage">
                <Navigate to="/manage/users?tab=settings" replace />
              </PermissionRoute>
            }
          />
          <Route path="profile" element={<CrewProfilePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
