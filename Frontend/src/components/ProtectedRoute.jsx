import { Navigate, useLocation } from "react-router-dom";
import { decodeJwtPayload, isJwtExpired } from "../utils/jwt";


/**
 * Protects routes by auth and optional role.
 * allowedRoles: e.g. ['admin'] or ['driver'] or ['user'] or ['admin','driver'].
 * If omitted, any authenticated user can access.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const payload = decodeJwtPayload(token);

  if (!payload || isJwtExpired(payload)) {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = payload.role;

  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
