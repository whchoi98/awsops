'use client';

import { useState, useEffect } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    fetch('/awsops/api/steampipe?action=config')
      .then(r => r.json())
      .then(() => setVersion('v1.8'))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/awsops/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password, remember }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      // Redirect to dashboard on success
      window.location.href = '/awsops/';
    } catch {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
         style={{ backgroundColor: '#0B0E14', color: '#F8FAFC', fontFamily: "'Inter', sans-serif" }}>
      {/* Grid background */}
      <div className="fixed inset-0 z-0 pointer-events-none"
           style={{
             backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
             backgroundSize: '40px 40px'
           }} />

      {/* Ambient glow - cyan */}
      <div className="fixed rounded-full blur-3xl z-0"
           style={{
             top: '-20%', left: '-10%', width: '800px', height: '800px',
             background: 'radial-gradient(circle, rgba(6,232,249,0.15) 0%, rgba(6,232,249,0) 70%)',
             animation: 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite'
           }} />

      {/* Ambient glow - purple */}
      <div className="fixed rounded-full blur-3xl z-0"
           style={{
             bottom: '-20%', right: '-10%', width: '800px', height: '800px',
             background: 'radial-gradient(circle, rgba(138,43,226,0.15) 0%, rgba(138,43,226,0) 70%)',
             animation: 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite',
             animationDelay: '2s'
           }} />

      {/* Main content */}
      <main className="relative z-10 w-full max-w-[420px] p-4">
        <div className="rounded-xl p-10 w-full flex flex-col gap-8 relative overflow-hidden"
             style={{
               background: 'rgba(16,20,28,0.6)',
               backdropFilter: 'blur(32px)',
               WebkitBackdropFilter: 'blur(32px)',
               border: '1px solid rgba(255,255,255,0.08)',
               borderTop: '1px solid rgba(255,255,255,0.15)',
               boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
             }}>
          {/* Top edge glow */}
          <div className="absolute top-0 left-0 right-0 h-px"
               style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)' }} />

          {/* Header */}
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-2"
                 style={{
                   background: 'rgba(0,0,0,0.4)',
                   border: '1px solid rgba(255,255,255,0.1)',
                   boxShadow: '0 0 15px rgba(6,232,249,0.1)'
                 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 3L3 8.5V19.5L14 25L25 19.5V8.5L14 3Z" stroke="#06e8f9" strokeWidth="1.5" fill="none"/>
                <circle cx="14" cy="14" r="4" fill="#06e8f9" opacity="0.3"/>
                <circle cx="14" cy="14" r="2" fill="#06e8f9"/>
              </svg>
            </div>
            <h1 className="font-bold text-3xl tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              AWSops
            </h1>
            <p className="text-sm" style={{ color: '#8B949E' }}>System Authentication</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Error */}
            {error && (
              <div className={`rounded-lg p-3 text-sm ${error ? 'animate-shake' : ''}`}
                   style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)', color: '#FF3366' }}
                   onAnimationEnd={() => {}}>
                {error}
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium tracking-wide uppercase" style={{ color: '#8B949E' }}>
                Email Address
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B949E" strokeWidth="1.5">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="M2 7l10 7 10-7"/>
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="admin@awsops.internal"
                  className="w-full h-12 rounded-lg pl-10 pr-4 text-[15px]"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#F8FAFC',
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#06e8f9'; e.target.style.boxShadow = '0 0 12px rgba(6,232,249,0.2)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-[13px] font-medium tracking-wide uppercase" style={{ color: '#8B949E' }}>
                  Security Key
                </label>
              </div>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B949E" strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full h-12 rounded-lg pl-10 pr-4 text-[15px] tracking-widest"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#F8FAFC',
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#06e8f9'; e.target.style.boxShadow = '0 0 12px rgba(6,232,249,0.2)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Remember */}
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer"
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: remember ? '#06e8f9' : 'rgba(0,0,0,0.3)',
                  border: `1px solid ${remember ? '#06e8f9' : 'rgba(255,255,255,0.1)'}`,
                  accentColor: '#06e8f9',
                }}
              />
              <label htmlFor="remember" className="text-[13px] cursor-pointer select-none" style={{ color: '#8B949E' }}>
                Maintain secure tunnel
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg text-[15px] font-semibold tracking-widest uppercase mt-2 flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
              style={{
                background: '#06e8f9',
                color: '#000',
                fontFamily: "'Space Grotesk', sans-serif",
                boxShadow: '0 0 20px rgba(6,232,249,0.3)',
              }}
              onMouseOver={e => { (e.target as HTMLElement).style.boxShadow = '0 0 30px rgba(6,232,249,0.4)'; }}
              onMouseOut={e => { (e.target as HTMLElement).style.boxShadow = '0 0 20px rgba(6,232,249,0.3)'; }}
            >
              {loading ? (
                <span className="animate-spin w-5 h-5 border-2 border-black/30 border-t-black rounded-full" />
              ) : (
                <>
                  <span>Authenticate</span>
                  <span style={{ fontSize: '18px' }}>&rarr;</span>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-center gap-2 mt-4" style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: 'rgba(139,148,158,0.5)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }} />
            <span>SYSTEMS ONLINE {version && `• ${version.toUpperCase()}`}</span>
          </div>
        </div>
      </main>

      {/* Keyframes */}
      <style>{`
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
        .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
