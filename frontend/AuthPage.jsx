import { useEffect, useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff, LogIn, Plane, UserPlus } from 'lucide-react';
import axios from 'axios';

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [socialMessage, setSocialMessage] = useState('');
  const [socialProvider, setSocialProvider] = useState('');
  const [destinationIndex, setDestinationIndex] = useState(0);
  const destinations = [
    { city: 'Mumbai', code: 'BOM', note: 'Coastal weekends', color: '#dff3f7' },
    { city: 'Bengaluru', code: 'BLR', note: 'Tech and culture', color: '#e0f2fe' },
    { city: 'Kolkata', code: 'CCU', note: 'A city of stories', color: '#fef3c7' }
  ];

  useEffect(() => {
    const timer = window.setInterval(() => setDestinationIndex(index => (index + 1) % destinations.length), 4500);
    return () => window.clearInterval(timer);
  }, [destinations.length]);

  const validate = field => {
    if (field === 'full_name') return form.full_name.trim().length >= 2;
    if (field === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    if (field === 'password') return form.password.length >= 6;
    return true;
  };
  const updateField = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setTouched(current => ({ ...current, [field]: true }));
    setError('');
  };

  const submit = async event => {
    event.preventDefault();
    setTouched({ full_name: mode === 'register', email: true, password: true });
    if ((mode === 'register' && !validate('full_name')) || !validate('email') || !validate('password')) {
      setError('Please correct the highlighted fields before continuing.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await axios.post(`http://localhost:5000${endpoint}`, form);
      onLogin(response.data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <div className="auth-brand"><span className="brand-mark"><Plane size={21} /></span><strong>SKYWINGS</strong><span>FLIGHT PORTAL</span></div>
        <p className="eyebrow">YOUR NEXT ADVENTURE</p>
        <h1>Where will you go next?</h1>
        <p>Search live flight schedules, reserve a seat, and keep every booking in one place.</p>
        <div className="destination-carousel" style={{ '--destination-bg': destinations[destinationIndex].color }} aria-live="polite"><div><span>POPULAR DESTINATION</span><strong>{destinations[destinationIndex].city} <small>({destinations[destinationIndex].code})</small></strong><p>{destinations[destinationIndex].note}</p></div><div className="carousel-dots">{destinations.map((destination, index) => <button key={destination.code} type="button" aria-label={`Show ${destination.city}`} className={index === destinationIndex ? 'active' : ''} onClick={() => setDestinationIndex(index)} />)}</div></div>
      </section>
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-heading">
          {mode === 'login' ? <LogIn size={22} /> : <UserPlus size={22} />}
          <div>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>{mode === 'login' ? 'Log in to manage your travel.' : 'Register before booking a flight.'}</p>
          </div>
        </div>
        {mode === 'register' && <label className={`floating-field ${touched.full_name ? (validate('full_name') ? 'valid' : 'invalid') : ''}`}><span>Full name</span><input required value={form.full_name} onChange={event => updateField('full_name', event.target.value)} onBlur={() => setTouched(current => ({ ...current, full_name: true }))} aria-invalid={touched.full_name && !validate('full_name')} />{touched.full_name && (validate('full_name') ? <Check size={17} /> : <AlertCircle size={17} />)}</label>}
        <label className={`floating-field ${touched.email ? (validate('email') ? 'valid' : 'invalid') : ''}`}><span>Email address</span><input required type="email" value={form.email} onChange={event => updateField('email', event.target.value)} onBlur={() => setTouched(current => ({ ...current, email: true }))} aria-invalid={touched.email && !validate('email')} />{touched.email && (validate('email') ? <Check size={17} /> : <AlertCircle size={17} />)}</label>
        <label className={`floating-field ${touched.password ? (validate('password') ? 'valid' : 'invalid') : ''}`}><span>Password</span><input required minLength="6" type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => updateField('password', event.target.value)} onBlur={() => setTouched(current => ({ ...current, password: true }))} aria-invalid={touched.password && !validate('password')} /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>{touched.password && (validate('password') ? <Check size={17} /> : <AlertCircle size={17} />)}</label>
        {mode === 'login' && <button className="forgot-link" type="button" onClick={() => setSocialMessage('Password reset is not connected yet. Please contact support.')}>Forgot Password?</button>}
        {error && <div className="status error" role="alert">{error}</div>}
        <button className="btn primary-action auth-submit" disabled={submitting}>{submitting ? <><span className="loading-spinner" />Please wait...</> : mode === 'login' ? 'Log in' : 'Register'}</button>
        <div className="auth-divider"><span>or continue with</span></div>
        <div className="social-actions"><button type="button" onClick={() => { setSocialProvider('Google'); setSocialMessage(''); }}>G <span>Google</span></button><button type="button" onClick={() => { setSocialProvider('Apple'); setSocialMessage(''); }}>Apple</button></div>
        {socialMessage && <p className="auth-note" role="status">{socialMessage}</p>}
        <button className="text-button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Need an account? Register' : 'Already registered? Log in'}
        </button>
      </form>
      {socialProvider && <div className="social-confirmation" role="dialog" aria-modal="true" aria-labelledby="social-confirmation-title"><div className="social-confirmation-card"><button className="social-confirmation-close" type="button" aria-label="Close account confirmation" onClick={() => setSocialProvider('')}>×</button><div className="social-confirmation-icon">{socialProvider === 'Google' ? 'G' : 'Apple'}</div><p className="eyebrow">ACCOUNT CONFIRMATION</p><h2 id="social-confirmation-title">Continue with {socialProvider}?</h2><p className="muted">You selected {socialProvider} sign-in. Confirm the account you want to use to access SkyWings.</p><div className="social-account-preview"><span className="account-avatar">{(form.email || socialProvider).charAt(0).toUpperCase()}</span><div><strong>{form.email || `Your ${socialProvider} account`}</strong><small>{socialProvider} account</small></div></div><button className="btn primary-action" type="button" onClick={() => { setSocialMessage(`${socialProvider} authentication needs OAuth configuration. Use email login for now.`); setSocialProvider(''); }}>Confirm account</button><button className="text-button" type="button" onClick={() => setSocialProvider('')}>Use email instead</button></div></div>}
    </main>
  );
}
