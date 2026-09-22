import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeFor } from '../auth/guards';
import Logo from '../components/Logo';
import { joinFullName, validateNamePart } from '../lib/nameUtils';

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function SignUp() {
  const { session, profile, loading, signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<'session' | 'no-session' | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session && profile) return <Navigate to={homeFor(profile.role)} replace />;
  if (success === 'session') return <Navigate to="/" replace />;

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const first = validateNamePart(firstName, 'Nome');
    if (first) errors.firstName = first;
    const last = validateNamePart(lastName, 'Sobrenome');
    if (last) errors.lastName = last;
    if (email.trim() === '') errors.email = 'Informe o e-mail.';
    if (password.length < 8) errors.password = 'A senha precisa ter pelo menos 8 caracteres.';
    if (password !== confirmPassword) errors.confirmPassword = 'As senhas não são iguais.';
    return errors;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setFormError(null);
    setBusy(true);
    const fullName = joinFullName(firstName, lastName);
    const { error, hasSession } = await signUp(email, password, fullName);
    setBusy(false);
    if (error) return setFormError(error);
    setSuccess(hasSession ? 'session' : 'no-session');
  }

  if (success === 'no-session') {
    return (
      <div className="center-screen">
        <div className="login-brand">
          <Logo size={72} />
        </div>
        <div className="card narrow">
          <h2>Cadastro enviado!</h2>
          <p className="muted">
            Se for solicitado, verifique seu e-mail para confirmar a conta. Depois é só entrar — o administrador ainda
            precisa liberar seu acesso.
          </p>
          <Link className="btn primary block" to="/login">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="login-brand">
        <Logo size={72} />
      </div>
      <form className="card narrow" onSubmit={(e) => void submit(e)}>
        <p className="muted login-sub">Crie sua conta. O administrador precisa aprovar antes de você acessar a agenda.</p>
        <label>
          Nome
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
        </label>
        {fieldErrors.firstName && <p className="error small">{fieldErrors.firstName}</p>}
        <label>
          Sobrenome
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
        </label>
        {fieldErrors.lastName && <p className="error small">{fieldErrors.lastName}</p>}
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        {fieldErrors.email && <p className="error small">{fieldErrors.email}</p>}
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {fieldErrors.password && <p className="error small">{fieldErrors.password}</p>}
        <label>
          Confirmar senha
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {fieldErrors.confirmPassword && <p className="error small">{fieldErrors.confirmPassword}</p>}
        {formError && <p className="error">{formError}</p>}
        <button className="btn primary block" disabled={busy}>
          <UserPlus size={16} aria-hidden="true" />
          {busy ? 'Criando conta…' : 'Criar conta'}
        </button>
        <p className="auth-links">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </form>
    </div>
  );
}
