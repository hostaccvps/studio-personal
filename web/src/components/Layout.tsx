import { CalendarClock, Clock, KeyRound, LayoutGrid, LogOut, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { displayName } from '../lib/types';
import { PendingCountCtx } from '../lib/pendingCount';
import { supabase } from '../lib/supabase';
import ChangePasswordModal from './ChangePasswordModal';
import Logo from './Logo';

export default function Layout() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [pendingCount, setPendingCount] = useState(0);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'professor')
      .eq('approval_status', 'pendente')
      .then(({ count }) => setPendingCount(count ?? 0));
  }, [isAdmin]);

  return (
    <PendingCountCtx.Provider value={{ count: pendingCount, setCount: setPendingCount }}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-row">
            <span className="topbar-spacer" aria-hidden="true" />
            <Logo size={32} />
            <div className="user">
              <span className="user-name">{displayName(profile)}</span>
              <button className="icon-btn" onClick={() => setChangingPassword(true)} aria-label="Trocar minha senha">
                <KeyRound size={16} />
              </button>
              <button className="btn ghost small" onClick={() => void signOut()}>
                <LogOut size={15} aria-hidden="true" />
                Sair
              </button>
            </div>
          </div>
          <nav className="nav" aria-label="Navegação principal">
            {isAdmin ? (
              <>
                <NavLink to="/admin" end>
                  <LayoutGrid size={16} aria-hidden="true" />
                  Painel
                </NavLink>
                <NavLink to="/admin/professores">
                  <Users size={16} aria-hidden="true" />
                  Professores
                  {pendingCount > 0 && <span className="badge notice">{pendingCount}</span>}
                </NavLink>
                <NavLink to="/admin/horarios">
                  <Clock size={16} aria-hidden="true" />
                  Horários
                </NavLink>
              </>
            ) : (
              <NavLink to="/minha-agenda">
                <CalendarClock size={16} aria-hidden="true" />
                Minha agenda
              </NavLink>
            )}
          </nav>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </PendingCountCtx.Provider>
  );
}
