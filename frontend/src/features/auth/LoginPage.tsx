import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Bot, Building2, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { USE_MOCK, errorMessage } from '@/api/client';
import { Field } from '@/components/ui';

const DEMO = [
  { email: 'admin@crmai.example', label: 'Admin · team & roles' },
  { email: 'marketing.manager@crmai.example', label: 'Marketing manager' },
  { email: 'marketing.exec@crmai.example', label: 'Marketing executive' },
  { email: 'sales.manager@crmai.example', label: 'Sales manager' },
  { email: 'sales.exec@crmai.example', label: 'Sales executive' },
];

export function AuthArt() {
  return (
    <div className="auth-art">
      <div className="brand" style={{ color: '#fff' }}>
        <img src="/logo.svg" alt="" style={{ background: '#fff', borderRadius: 8, padding: 2 }} />CRMAI
      </div>
      <div className="stack" style={{ gap: 26 }}>
        <h2>An AI agent that works your CRM — and knows when to hand over.</h2>
        <div className="feat"><Bot /><div><b>Understands every chat.</b><br />Creates leads and follow-ups from conversations through approved tools.</div></div>
        <div className="feat"><ShieldCheck /><div><b>Humans own the risky calls.</b><br />Refunds, complaints and low-confidence turns go to your team's queue.</div></div>
        <div className="feat"><Building2 /><div><b>One platform, many companies.</b><br />Each workspace has its own customers, knowledge and channels.</div></div>
      </div>
      <p style={{ opacity: .75, fontSize: 13 }}><Sparkles size={14} style={{ verticalAlign: -2 }} /> University group project prototype</p>
    </div>
  );
}

export function LoginPage() {
  const { me, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState(USE_MOCK ? 'marketing.manager@crmai.example' : '');
  const [password, setPassword] = useState(USE_MOCK ? 'password123' : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await login(email, password);
      nav(loc.state?.from ?? '/', { replace: true });
    } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <AuthArt />
      <div className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ marginTop: 4 }}>Welcome back to your staff console.</p>
          </div>
          <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></Field>
          {err && <div className="alert alert-error" role="alert">{err}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="muted" style={{ textAlign: 'center' }}>New company? <Link to="/signup">Create a workspace</Link></p>
          {USE_MOCK && (
            <div className="card card-pad stack-sm" style={{ background: 'var(--surface-2)' }}>
              <span className="strong small">Demo accounts (password: password123)</span>
              {DEMO.map((d) => (
                <button type="button" key={d.email} className="btn btn-sm" style={{ justifyContent: 'space-between' }}
                  onClick={() => { setEmail(d.email); setPassword('password123'); }}>
                  <span>{d.email}</span><span className="muted">{d.label}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
