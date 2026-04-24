import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserDashboard from "./pages/user/UserDashboard";
import TrackTripPage from "./pages/user/TrackTripPage";
import DriverDashboard from "./pages/driver/DriverDashboard";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import DriversPage from "./pages/admin/DriversPage";
import AssignBusPage from "./pages/admin/AssignBusPage";
import StopsPage from "./pages/admin/StopsPage";
import BusesPage from "./pages/admin/BusesPage";
import RoutesPage from "./pages/admin/RoutesPage";
import RouteBuilderPage from "./pages/admin/routes/RouteBuilderPage";
import LiveMapPage from "./pages/admin/LiveMapPage";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";

function App() {
  const withShell = (node) => <div className="cpb-app-page">{node}</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={withShell(<Login />)} />
        <Route path="/register" element={withShell(<Register />)} />
        <Route
          path="/user"
          element={
            withShell(
              <ProtectedRoute allowedRoles={["user"]}>
                <UserDashboard />
              </ProtectedRoute>
            )
          }
        />
        <Route
          path="/track/:tripId"
          element={
            withShell(
              <ProtectedRoute>
                <TrackTripPage />
              </ProtectedRoute>
            )
          }
        />
        <Route
          path="/driver"
          element={
            withShell(
              <ProtectedRoute allowedRoles={["driver"]}>
                <DriverDashboard />
              </ProtectedRoute>
            )
          }
        />
        <Route
          path="/admin"
          element={
            withShell(
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminLayout />
              </ProtectedRoute>
            )
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="live-map" element={<LiveMapPage />} />
          <Route path="drivers" element={<DriversPage />} />
          <Route path="assign-bus" element={<AssignBusPage />} />
          <Route path="stops" element={<StopsPage />} />
          <Route path="buses" element={<BusesPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="route-builder" element={<RouteBuilderPage />} />
        </Route>
        <Route path="*" element={withShell(<NotFound />)} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
