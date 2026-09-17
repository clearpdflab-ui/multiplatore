import React, { useState } from 'react';
import { LogIn, LogOut, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getSupabase } from '../services/supabaseClient';

export const AuthBar: React.FC = () => {
  const { configured, email, loading, error, signIn, signOut } = useAuth();
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [showPassForm, setShowPassForm] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="text-[11px] font-mono text-[#64748B] flex items-center gap-1.5">
        <User className="w-3.5 h-3.5" />
        <span>locale (login non configurato)</span>
      </div>
    );
  }

  if (loading) {
    return <div className="text-[11px] font-mono text-[#64748B]">…</div>;
  }

  if (email) {
    const doChangePassword = async () => {
      const sb = getSupabase();
      if (!sb || newPass.length < 8) {
        return;
      }
      setBusy(true);
      try {
        const { error: e } = await sb.auth.updateUser({ password: newPass });
        if (e) {
          throw new Error(e.message);
        }
        setPassMsg('Password aggiornata.');
        setNewPass('');
        setPassConfirm('');
        setShowPassForm(false);
      } catch (err) {
        setPassMsg(err instanceof Error ? err.message : 'Errore');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <span className="text-[11px] font-mono text-emerald-400 truncate max-w-40" title={email}>
          {email}
        </span>
        <button
          onClick={() => {
            setShowPassForm((v) => !v);
            setPassMsg(null);
          }}
          className="px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8] border border-[#2D3139] rounded-xs hover:text-white hover:bg-[#1A1D26]"
          title="Cambia la tua password (min 8 caratteri)"
        >
          Password
        </button>
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8] border border-[#2D3139] rounded-xs hover:text-white hover:bg-[#1A1D26]"
        >
          <LogOut className="w-3 h-3" /> Esci
        </button>
        {showPassForm && (
          <form
            className="flex items-center gap-1.5 basis-full justify-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (newPass !== passConfirm) {
                setPassMsg('Le due password non coincidono.');
                return;
              }
              void doChangePassword();
            }}
          >
            <input
              type="password"
              required
              minLength={8}
              placeholder="nuova (min 8)"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-28 bg-[#0A0B10] border border-[#2D3139] rounded-xs px-2 py-1 text-[11px] font-mono text-white focus:border-[#3B82F6] outline-none"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="ripeti"
              value={passConfirm}
              onChange={(e) => setPassConfirm(e.target.value)}
              className="w-28 bg-[#0A0B10] border border-[#2D3139] rounded-xs px-2 py-1 text-[11px] font-mono text-white focus:border-[#3B82F6] outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-2 py-1 text-[11px] font-mono uppercase bg-[#3B82F6] text-white rounded-xs disabled:opacity-50"
            >
              {busy ? '…' : 'OK'}
            </button>
          </form>
        )}
        {passMsg && (
          <span className="text-[10px] font-mono text-[#94A3B8] basis-full text-right">
            {passMsg}
          </span>
        )}
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
          className="flex items-center gap-1.5 flex-wrap justify-end"
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
      {error && (
        <span className="text-[10px] font-mono text-red-400 max-w-48 truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
};
