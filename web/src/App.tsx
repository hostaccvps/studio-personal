import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RequireRole, homeFor } from './auth/guards';
import BackgroundFX from './components/BackgroundFX';
import InstallPrompt from './components/InstallPrompt';
import Layout from './components/Layout';
import OfflineBanner from './components/OfflineBanner';
import UpdateToast from './components/UpdateToast';
import AdminDashboard from './pages/AdminDashboard';
import AdminProfessors from './pages/AdminProfessors';
import AdminProfessorSchedule from './pages/AdminProfessorSchedule';
import AdminSlots from './pages/AdminSlots';
import Login from './pages/Login';
import MySchedule from './pages/MySchedule';
import SignUp from './pages/SignUp';

function Home() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="center-screen muted">Carregando…</div>;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(profile.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BackgroundFX />
      <OfflineBanner />
      <UpdateToast />
      <InstallPrompt />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/criar-conta" element={<SignUp />} />
          <Route path="/" element={<Home />} />
          <Route
            element={
              <RequireRole role="professor">
                <Layout />
              </RequireRole>
            }
          >
            <Route path="/minha-agenda" element={<MySchedule />} />
          </Route>
          <Route
            element={
              <RequireRole role="admin">
                <Layout />
              </RequireRole>
            }
          >
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/professores" element={<AdminProfessors />} />
            <Route path="/admin/professores/:id" element={<AdminProfessorSchedule />} />
            <Route path="/admin/horarios" element={<AdminSlots />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
