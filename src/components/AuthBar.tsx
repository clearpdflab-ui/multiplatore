import React, { useState } from 'react';
import { LogIn, LogOut, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const AuthBar: React.FC = () => {
  const { configured, email, loading, error, signIn, signOut } = useAuth();
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!configured) {
    return (
      <div className="text-[11px] font-mono text-[#64748B] flex items-center gap-1.5">
        <User className="w-3.5 h-3.5" />
        <span>locale (login non configurato)</span>
      </div>
    );
  }

  if (loading) return <div className="text-[11px] font-mono text-[#64748B]">…</div>;

  if (email) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-emerald-400 truncate max-w-40" title={email}>
          {email}
        </span>
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8] border border-[#2D3139] rounded-xs hover:text-white hover:bg-[#1A1D26]"
        >
          <LogOut className="w-3 h-3" /> Esci
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8] border border-[#2D3139] rounded-xs hover:text-white hover:bg-[#1A1D26]"
        >
          <LogIn className="w-3 h-3" /> Login
        </button>
      ) : (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            signIn(mail.trim(), pass)
              .then(() => {
                setOpen(false);
                setMail('');
                setPass('');
              })
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          <input
            type="email"
            required
            placeholder="email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            className="w-32 bg-[#0A0B10] border border-[#2D3139] rounded-xs px-2 py-1 text-[11px] font-mono text-white focus:border-[#3B82F6] outline-none"
          />
          <input
            type="password"
            required
            placeholder="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-28 bg-[#0A0B10] border border-[#2D3139] rounded-xs px-2 py-1 text-[11px] font-mono text-white focus:border-[#3B82F6] outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-2 py-1 text-[11px] font-mono uppercase bg-[#3B82F6] text-white rounded-xs disabled:opacity-50"
          >
            {busy ? '…' : 'OK'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-1.5 py-1 text-[11px] font-mono text-[#64748B] hover:text-white"
          >
            ✕
          </button>
        </form>
      )}
      {error && <span className="text-[10px] font-mono text-red-400 max-w-48 truncate" title={error}>{error}</span>}
    </div>
  );
};
