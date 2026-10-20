import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Home from "./Home";
import Login from "./Login";
import Registration from "./Registration";
import ForgotPassword from "./ForgotPassword";
import AdminDashboard from "./AdminDashboard";
import UserProfile from "./components/home/UserProfile";
import Chat from "./components/home/Chat";

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = localStorage.getItem("ayurvedai_user");

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Registration />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

               <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat mode="chat" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/identify"
          element={
            <ProtectedRoute>
              <Chat mode="identify" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/herbs"
          element={
            <ProtectedRoute>
              <Chat mode="herbs" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/locator"
          element={
            <ProtectedRoute>
              <Chat mode="locator" />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;