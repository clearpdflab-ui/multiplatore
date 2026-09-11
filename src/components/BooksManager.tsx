import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Download,
  History,
  Plus,
  Save,
  Upload,
  X,
} from 'lucide-react';
import { bonusTableToCsv, parseBonusCsv, useBooks } from '../hooks/useBooks';
import { DEFAULT_BOOK } from '../engine/books';
import type { Book } from '../types';

function emptyTable(): Record<number, number> {
  return { ...DEFAULT_BOOK.bonusTable };
}

interface Draft {
  name: string;
  bonusCap: string;
  minStake: string;
  maxPayout: string; // '' = illimitato
  maxLegs: string;
  multiDaysLimit: string; // '' = nessun limite
  overEligible: boolean;
  competitions: string; // csv
  apiBookKey: string;
  isActive: boolean;
  table: Record<number, number>;
}

function draftFromBook(b: Book): Draft {
  return {
    name: b.name,
    bonusCap: String(b.bonusCap),
    minStake: String(b.minStake),
    maxPayout: b.maxPayout === null ? '' : String(b.maxPayout),
    maxLegs: String(b.maxLegs),
    multiDaysLimit: b.multiDaysLimit == null ? '' : String(b.multiDaysLimit),
    overEligible: b.overEligible,
    competitions: b.competitions.join(', '),
    apiBookKey: b.apiBookKey ?? '',
    isActive: b.isActive,
    table: { ...b.bonusTable },
  };
}

function newDraft(): Draft {
  return {
    name: '',
    bonusCap: '500',
    minStake: '1',
    maxPayout: '',
    maxLegs: '30',
    multiDaysLimit: '',
    overEligible: true,
    competitions: 'all',
    apiBookKey: '',
    isActive: true,
    table: emptyTable(),
  };
}

const inputCls =
  'w-full bg-[#0A0B10] border border-[#2D3139] rounded-xs px-2 py-1.5 text-xs font-mono text-white focus:border-[#3B82F6] outline-none';
const labelCls = 'text-[10px] uppercase tracking-wider text-[#64748B] font-mono mb-1 block';

export const BooksManager: React.FC = () => {
  const {
    books,
    versionsByBook,
    loading,
    error,
    usingFallback,
    refresh,
    createBook,
    updateBook,
    saveBonusVersion,
    rollbackToVersion,
    setBookActive,
  } = useBooks();

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(newDraft());
  const [csvText, setCsvText] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => books.find((b) => b.id === selectedId) ?? null,
    [books, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setDraft(draftFromBook(selected));
    } else if (selectedId === 'new') {
      setDraft(newDraft());
    }
    setMsg(null);
    setErr(null);
  }, [selectedId, selected]);

  const monotonicWarn = useMemo(() => {
    const ns = Object.keys(draft.table)
      .map(Number)
      .sort((a, b) => a - b);
    for (let i = 1; i < ns.length; i++) {
      if (draft.table[ns[i]] < draft.table[ns[i - 1]]) {
        return `Attenzione: bonus N=${ns[i]} (${draft.table[ns[i]]}%) < N=${ns[i - 1]} (${draft.table[ns[i - 1]]}%)`;
      }
    }
    return null;
  }, [draft.table]);

  const maxTable = useMemo(() => Math.max(...Object.values(draft.table)), [draft.table]);

  async function handleSave() {
    setMsg(null);
    setErr(null);
    const cap = Number(draft.bonusCap);
    if (!draft.name.trim()) {
      setErr('Nome book obbligatorio');
      return;
    }
    if (!Number.isFinite(cap) || cap <= 0) {
      setErr('Cap bonus non valido');
      return;
    }
    if (maxTable > cap) {
      setErr(`Il bonus massimo (${maxTable}%) supera il cap (${cap}%)`);
      return;
    }
    setSaving(true);
    try {
      const maxPayout = draft.maxPayout.trim() === '' ? null : Number(draft.maxPayout);
      if (maxPayout !== null && (!Number.isFinite(maxPayout) || maxPayout <= 0)) {
        throw new Error('Max payout non valido (vuoto = illimitato)');
      }
      const daysTrim = draft.multiDaysLimit.trim();
      const multiDaysLimit = daysTrim === '' ? null : Number(daysTrim);
      if (multiDaysLimit !== null && (!Number.isInteger(multiDaysLimit) || multiDaysLimit < 1)) {
        throw new Error('Max giorni multipla: intero >= 1 (vuoto = nessun limite)');
      }
      if (selectedId === 'new' || !selected) {
        const created = await createBook({
          name: draft.name.trim(),
          bonusCap: cap,
          minStake: Number(draft.minStake) || 1,
          maxPayout,
          maxLegs: Number(draft.maxLegs) || 30,
          multiDaysLimit,
          overEligible: draft.overEligible,
          competitions: draft.competitions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          apiBookKey: draft.apiBookKey.trim() || undefined,
          isActive: draft.isActive,
          bonusTable: { ...draft.table },
        });
        setSelectedId(created.id);
        setMsg(`Book "${created.name}" creato con prima versione bonus`);
      } else {
        await updateBook(selected.id, {
          name: draft.name.trim(),
          bonusCap: cap,
          minStake: Number(draft.minStake) || 1,
          maxPayout,
          maxLegs: Number(draft.maxLegs) || 30,
          multiDaysLimit,
          overEligible: draft.overEligible,
          competitions: draft.competitions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          apiBookKey: draft.apiBookKey.trim() || undefined,
          isActive: draft.isActive,
        });
        const active = (versionsByBook[selected.id] ?? [])[0];
        const changed = !active || JSON.stringify(active.tableData) !== JSON.stringify(draft.table);
        if (changed) {
          await saveBonusVersion(selected.id, { ...draft.table });
          setMsg('Book aggiornato + nuova versione bonus salvata');
        } else {
          setMsg('Book aggiornato (tabella invariata, nessuna nuova versione)');
        }
      }
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  }

  function handleExportCsv() {
    const blob = new Blob([bonusTableToCsv(draft.table)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bonus_${(draft.name || 'book').replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleImportCsv() {
    const res = parseBonusCsv(csvText);
    if (res.error || !res.table) {
      setErr(res.error ?? 'CSV non valido');
      return;
    }
    setDraft((d) => ({ ...d, table: res.table as Record<number, number> }));
    setMsg('Tabella importata dal CSV (verifica e salva)');
    setErr(null);
  }

  if (loading) {
    return <div className="text-xs font-mono text-[#64748B] p-4">Caricamento book…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#3B82F6]" /> Book &amp; Tabelle Bonus
        </h2>
        <button
          onClick={() => setSelectedId('new')}
          className="px-3 py-1.5 text-xs font-mono uppercase bg-[#3B82F6] text-white rounded-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Nuovo book
        </button>
      </div>

      {usingFallback && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-xs px-3 py-2 text-xs font-mono text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Supabase/sessione non disponibile: mostrato solo il book default (sola lettura). Fai login
          per gestire i book.
        </div>
      )}
      {error && (
        <div className="border border-red-500/40 bg-red-500/10 rounded-xs px-3 py-2 text-xs font-mono text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="border border-emerald-500/40 bg-emerald-500/10 rounded-xs px-3 py-2 text-xs font-mono text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4" /> {msg}
        </div>
      )}
      {err && (
        <div className="border border-red-500/40 bg-red-500/10 rounded-xs px-3 py-2 text-xs font-mono text-red-300 flex items-center gap-2">
          <X className="w-4 h-4" /> {err}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista */}
        <div className="border border-[#2D3139] bg-[#0F1117] rounded-xs p-3">
          <div className={labelCls}>Book registrati ({books.length})</div>
          <div className="flex flex-col gap-1.5">
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={`text-left px-2.5 py-2 rounded-xs border text-xs font-mono transition-colors ${
                  selectedId === b.id
                    ? 'border-[#3B82F6] bg-[#1A1D26] text-white'
                    : 'border-[#2D3139] text-[#94A3B8] hover:text-white hover:bg-[#1A1D26]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{b.name}</span>
                  <span className={b.isActive ? 'text-emerald-400' : 'text-[#64748B]'}>
                    {b.isActive ? '● attivo' : '○ off'}
                  </span>
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  cap {b.bonusCap}% · min {b.minStake}€ · max {b.maxLegs} gambe ·{' '}
                  {b.multiDaysLimit == null ? 'multiple ∞ gg' : `multiple ≤ ${b.multiDaysLimit}gg`}{' '}
                  · {b.overEligible ? 'Over ok' : 'no Over'} · v
                  {(versionsByBook[b.id] ?? []).length}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2 border border-[#2D3139] bg-[#0F1117] rounded-xs p-3">
          {!selected && selectedId !== 'new' && (
            <div className="text-xs font-mono text-[#64748B]">
              Seleziona un book o creane uno nuovo.
            </div>
          )}
          {(selected || selectedId === 'new') && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className={labelCls}>Nome</span>
                  <input
                    className={inputCls}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelCls}>Cap bonus %</span>
                  <input
                    className={inputCls}
                    value={draft.bonusCap}
                    onChange={(e) => setDraft({ ...draft, bonusCap: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelCls}>Min stake €</span>
                  <input
                    className={inputCls}
                    value={draft.minStake}
                    onChange={(e) => setDraft({ ...draft, minStake: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelCls}>Max payout € (vuoto=∞)</span>
                  <input
                    className={inputCls}
                    value={draft.maxPayout}
                    onChange={(e) => setDraft({ ...draft, maxPayout: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelCls}>Max gambe</span>
                  <input
                    className={inputCls}
                    value={draft.maxLegs}
                    onChange={(e) => setDraft({ ...draft, maxLegs: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelCls}>Max giorni multipla (vuoto=∞)</span>
                  <input
                    className={inputCls}
                    value={draft.multiDaysLimit}
                    onChange={(e) => setDraft({ ...draft, multiDaysLimit: e.target.value })}
                    placeholder="es. 7"
                  />
                </div>
                <div>
                  <span className={labelCls}>Competizioni (csv)</span>
                  <input
                    className={inputCls}
                    value={draft.competitions}
                    onChange={(e) => setDraft({ ...draft, competitions: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelCls}>API book key</span>
                  <input
                    className={inputCls}
                    value={draft.apiBookKey}
                    onChange={(e) => setDraft({ ...draft, apiBookKey: e.target.value })}
                  />
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="text-xs font-mono text-[#94A3B8] flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={draft.overEligible}
                      onChange={(e) => setDraft({ ...draft, overEligible: e.target.checked })}
                    />{' '}
                    Over ammesso
                  </label>
                  <label className="text-xs font-mono text-[#94A3B8] flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    />{' '}
                    Attivo
                  </label>
                </div>
              </div>

              <div>
                <span className={labelCls}>Tabella bonus % per N eventi (5–30)</span>
                <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
                  {Object.keys(draft.table)
                    .map(Number)
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <div key={n}>
                        <div className="text-[10px] font-mono text-[#64748B] text-center">
                          N={n}
                        </div>
                        <input
                          className={`${inputCls} text-center`}
                          value={draft.table[n]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              setDraft({ ...draft, table: { ...draft.table, [n]: v } });
                            }
                          }}
                        />
                      </div>
                    ))}
                </div>
                {monotonicWarn && (
                  <div className="text-[11px] font-mono text-amber-300 mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {monotonicWarn}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || usingFallback}
                  className="px-3 py-1.5 text-xs font-mono uppercase bg-[#3B82F6] text-white rounded-xs flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Save className="w-3.5 h-3.5" />{' '}
                  {saving ? 'Salvataggio…' : 'Salva (nuova versione bonus)'}
                </button>
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 text-xs font-mono uppercase border border-[#2D3139] text-[#94A3B8] rounded-xs flex items-center gap-1.5 hover:text-white"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
                <button
                  onClick={() => setShowCsv((s) => !s)}
                  className="px-3 py-1.5 text-xs font-mono uppercase border border-[#2D3139] text-[#94A3B8] rounded-xs flex items-center gap-1.5 hover:text-white"
                >
                  <Upload className="w-3.5 h-3.5" /> Import CSV
                </button>
              </div>

              {showCsv && (
                <div>
                  <span className={labelCls}>
                    CSV: righe "N,percentuale" (5–30, tutte obbligatorie)
                  </span>
                  <textarea
                    className={`${inputCls} h-28`}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={'5,6.0\n6,12.4\n…'}
                  />
                  <button
                    onClick={handleImportCsv}
                    className="mt-1.5 px-3 py-1.5 text-xs font-mono uppercase border border-[#3B82F6]/50 text-white rounded-xs"
                  >
                    Applica CSV alla tabella
                  </button>
                </div>
              )}

              {selected && (
                <div>
                  <span className={labelCls}>
                    <History className="w-3 h-3 inline mr-1" />
                    Storico versioni (append-only, rollback = nuova versione)
                  </span>
                  <div className="flex flex-col gap-1 max-h-40 overflow-auto">
                    {(versionsByBook[selected.id] ?? []).map((v, i) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8] border border-[#2D3139] rounded-xs px-2 py-1"
                      >
                        <span>
                          {new Date(v.validFrom).toLocaleString()}{' '}
                          {i === 0 && (
                            <span className="text-emerald-400 font-bold">· corrente</span>
                          )}
                        </span>
                        {i > 0 && (
                          <button
                            onClick={async () => {
                              setErr(null);
                              try {
                                await rollbackToVersion(selected.id, v.id);
                                setMsg('Rollback: nuova versione creata dai dati storici');
                                await refresh();
                              } catch (e) {
                                setErr(e instanceof Error ? e.message : 'Errore rollback');
                              }
                            }}
                            className="text-[#3B82F6] hover:text-white uppercase"
                          >
                            Ripristina
                          </button>
                        )}
                      </div>
                    ))}
                    {(versionsByBook[selected.id] ?? []).length === 0 && (
                      <div className="text-[11px] font-mono text-[#64748B]">
                        Nessuna versione remota (fallback locale).
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
