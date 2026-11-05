// SaaS self-service: a company creates its workspace and first admin account.
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/api/client';
import { Field } from '@/components/ui';
import { AuthArt } from './LoginPage';

const INDUSTRIES = ['Subscription services', 'Real estate', 'Retail', 'Education', 'Healthcare', 'Hospitality', 'Financial services', 'Other'];

export function SignupPage() {
  const { me, signup } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ company_name: '', industry: INDUSTRIES[0], full_name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await signup(f);
      nav('/settings', { replace: true });
    } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <AuthArt />
      <div className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <div>
            <h1>Create your workspace</h1>
            <p className="muted" style={{ marginTop: 4 }}>Set up CRMAI for your company in a minute.</p>
          </div>
          <Field label="Company name"><input className="input" value={f.company_name} onChange={set('company_name')} required minLength={2} /></Field>
          <Field label="Industry">
            <select className="select" value={f.industry} onChange={set('industry')}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select>
          </Field>
          <Field label="Your name"><input className="input" value={f.full_name} onChange={set('full_name')} required autoComplete="name" /></Field>
          <Field label="Work email"><input className="input" type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></Field>
          <Field label="Password" hint="At least 10 characters"><input className="input" type="password" value={f.password} onChange={set('password')} required minLength={10} autoComplete="new-password" /></Field>
          {err && <div className="alert alert-error" role="alert">{err}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
          <p className="muted" style={{ textAlign: 'center' }}>Already have an account? <Link to="/login">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}
