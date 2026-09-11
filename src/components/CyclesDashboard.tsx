import React, { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, Plus, Trash2, Wallet, X } from 'lucide-react';
import { pendingLegKeys, spentByCycle, useCycles } from '../hooks/useCycles';
import { useBooks } from '../hooks/useBooks';
import {
  bankrollTargets,
  expectedBleed,
  resolveWithFallback,
  sizeTicket,
  spendLimitForLock,
} from '../engine/harmony';
import { buildTerminationLegs, exposureSummary, findSharedLegs } from '../engine/cycles';
import { bestCoverSide, type CoverOddsRow } from '../engine/coverOddsFeed';
import { fetchCoverSuggestions } from '../services/ldlOddsApi';
import { matchEventByTeams } from '../engine/resultsFeed';
import { fetchResults } from '../services/resultsApi';
import type { CycleTicketKind, TicketLeg } from '../types';

const inputCls =
  'w-full bg-[#0A0B10] border border-[#2D3139] rounded-xs px-2 py-1.5 text-xs font-mono text-white focus:border-[#3B82F6] outline-none';
const labelCls = 'text-[10px] uppercase tracking-wider text-[#64748B] font-mono mb-1 block';
const cardCls = 'bg-[#0F1117] border border-[#2D3139] rounded-xs p-3 sm:p-4';
const btnPrimary =
  'px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-[#3B82F6] text-white rounded-xs hover:bg-[#2563EB] disabled:opacity-50';
const btnGhost =
  'px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8] border border-[#2D3139] rounded-xs hover:text-white hover:bg-[#1A1D26] disabled:opacity-50';

interface LegRow {
  odds: string;
  market: 'OVER' | 'UNDER';
  label: string;
  ldlEventId?: string; // F5: valorizzato quando la gamba viene da "usa" sulle quote LDL
  externalEventId?: string; // F5: id scoretrend risolto in background per il tracking risultati
}

const emptyLeg = (): LegRow => ({ odds: '1.32', market: 'UNDER', label: '' });

function parseLegs(rows: LegRow[]): { legs?: TicketLeg[]; error?: string } {
  const legs: TicketLeg[] = [];
  for (let i = 0; i < rows.length; i++) {
    const q = Number(rows[i].odds);
    if (!Number.isFinite(q) || q <= 1) {
      return { error: `Gamba ${i + 1}: quota non valida (>1)` };
    }
    legs.push({
      odds: q,
      market: rows[i].market,
      label: rows[i].label.trim() || undefined,
      ldlEventId: rows[i].ldlEventId,
      externalEventId: rows[i].externalEventId,
    });
  }
  if (legs.length < 1 || legs.length > 30) {
    return { error: 'N gambe 1–30' };
  }
  return { legs };
}

export const CyclesDashboard: React.FC = () => {
  const {
    cycles,
    tickets,
    loading,
    error,
    usingFallback,
    createCycle,
    closeCycle,
    deleteCycle,
    topUpCycle,
    refillMother,
    addTicket,
    settleTicket,
    voidTicketLeg,
    ticketsByCycle,
    spentOf,
  } = useCycles();
  const { books } = useBooks();

  const [bankroll, setBankroll] = useState('3000');
  const [worstCost, setWorstCost] = useState('450');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // nuovo ciclo
  const [newName, setNewName] = useState('');
  const [newS0, setNewS0] = useState('2');
  const [newUnder, setNewUnder] = useState('1.32');

  // nuovo ticket
  const [kind, setKind] = useState<CycleTicketKind>('COVERAGE');
  const [bookId, setBookId] = useState<string>('');
  const [legRows, setLegRows] = useState<LegRow[]>([emptyLeg()]);
  const [bleed, setBleed] = useState('0');

  // F5 — coperture suggerite da liberidalavoro.it/OddsScasser /puntapunta
  // (madre Under 3.5 @ Lottomatica[16], copertura Over 3.5 @ Sisal[23],
  // quota madre nella fascia del metodo 1.25–1.49, ordinati per rating).
  const LDL_SITES_MADRE = [16];
  const LDL_SITES_COPERTURA = [23];
  const [ldlRows, setLdlRows] = useState<CoverOddsRow[]>([]);
  const [ldlLoading, setLdlLoading] = useState(false);
  const [ldlSource, setLdlSource] = useState<'edge' | 'mock' | null>(null);
  const [ldlError, setLdlError] = useState<string | null>(null);

  async function loadLdlOdds() {
    setLdlLoading(true);
    setLdlError(null);
    try {
      const r = await fetchCoverSuggestions({
        sites1: LDL_SITES_MADRE,
        sites2PuntaPunta: LDL_SITES_COPERTURA,
        oddsMin: 1.25,
        oddsMax: 1.49,
        dateTo: new Date(Date.now() + 48 * 3600_000).toISOString(),
      });
      setLdlRows(r.matches);
      setLdlSource(r.source);
      if (r.errors.length) {
        setLdlError(r.errors.join('; '));
      }
    } catch (e) {
      setLdlRows([]);
      setLdlSource(null);
      setLdlError(e instanceof Error ? e.message : String(e));
    } finally {
      setLdlLoading(false);
    }
  }

  function applyLdlRow(row: CoverOddsRow, side: 'under' | 'over') {
    const best = bestCoverSide(row, side);
    if (!best) {
      return;
    }
    setLegRows((rows) => [
      ...rows,
      {
        odds: String(best.odds),
        market: side === 'under' ? 'UNDER' : 'OVER',
        label: `${row.home}-${row.away}`,
        ldlEventId: row.eventId,
      },
    ]);
    // risoluzione scoretrend best-effort in background, non blocca l'inserimento
    void fetchResults().then((res) => {
      const raw = res.matches.map((m) => ({ eventid: m.eventId, home: m.home, away: m.away }));
      const match = matchEventByTeams(raw, row.home, row.away);
      if (match) {
        setLegRows((rows) =>
          rows.map((r) =>
            r.ldlEventId === row.eventId ? { ...r, externalEventId: match.eventid } : r,
          ),
        );
      }
    });
  }

  // terminazione + top-up
  const [termN, setTermN] = useState('5');
  const [termOver, setTermOver] = useState('3.0');
  const [topUp, setTopUp] = useState('');

  const bankrollNum = Number(bankroll) || 0;
  const worstNum = Number(worstCost) || 0;
  const tBank = bankrollTargets(bankrollNum).tBase;

  const active = useMemo(() => cycles.filter((c) => c.status === 'active'), [cycles]);
  const ledgers = useMemo(
    () => active.map((c) => ({ id: c.id, spent: spentOf(c.id) })),
    [active, tickets, cycles], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const summary = useMemo(
    () => exposureSummary(ledgers, bankrollNum, worstNum),
    [ledgers, bankrollNum, worstNum],
  );
  const conflicts = useMemo(
    () =>
      findSharedLegs(
        active.map((c) => ({ cycleId: c.id, legKeys: pendingLegKeys(tickets, c.id) })),
      ),
    [active, tickets],
  );

  const selected = cycles.find((c) => c.id === selectedId) ?? null;
  const selTickets = selected ? ticketsByCycle(selected.id) : [];
  const spent = selected ? spentOf(selected.id) : 0;
  const target = selected ? Math.max(selected.targetBase, tBank) : tBank;

  const book = books.find((b) => b.id === (bookId || books[0]?.id)) ?? books[0];
  const parsed = useMemo(() => parseLegs(legRows), [legRows]);
  const preview = useMemo(() => {
    if (!parsed.legs || !book) {
      return null;
    }
    try {
      return sizeTicket({ legs: parsed.legs, book, spent, bleed: Number(bleed) || 0, target });
    } catch {
      return null;
    }
  }, [parsed, book, spent, bleed, target]);

  // Calcolatore terminazione: full coverage -> N corto -> lock -> stop.
  const termination = useMemo((): {
    res: ReturnType<typeof resolveWithFallback>;
    ceiling: number | null;
    error: string | null;
  } => {
    if (!selected || !book) {
      return { res: null, ceiling: null, error: null };
    }
    const over = Number(termOver);
    const n = Number(termN);
    if (!Number.isFinite(over) || over <= 1) {
      return { res: null, ceiling: null, error: 'Over non valido' };
    }
    const rest = selected.motherEvents.map((m) => m.odds);
    const full = [
      { odds: over, market: 'OVER' as const },
      ...rest.map((q) => ({ odds: q, market: 'UNDER' as const })),
    ];
    const short = buildTerminationLegs(over, rest, n);
    const candidates: { label: string; legs: TicketLeg[]; book?: typeof book }[] = [
      { label: `copertura full N=${full.length}`, legs: full, book },
    ];
    if (short) {
      candidates.push({ label: `terminazione N=${n}`, legs: short, book });
    }
    candidates.push({ label: 'lock @2.75', legs: [{ odds: 2.75, market: 'OVER' as const }], book });
    const bleedNum = Number(bleed) || 0;
    const res = resolveWithFallback({
      candidates,
      spent,
      bleed: bleedNum,
      targetBase: target,
      minStake: book.minStake,
    });
    const ceiling = spendLimitForLock(150, 2.75, target, bleedNum);
    return { res, ceiling, error: null };
  }, [selected, book, termOver, termN, bleed, spent, target]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    setErr(null);
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore');
    }
  }

  if (loading) {
    return <div className="text-xs font-mono text-[#64748B]">Caricamento cicli…</div>;
  }

  return (
    <div className="space-y-4">
      {usingFallback && (
        <div className="text-[11px] font-mono text-amber-400 border border-amber-400/30 bg-amber-400/5 rounded-xs px-3 py-2">
          Solo locale (nessuna sessione Supabase): i cicli restano su questo browser. Fai login per
          la sync cloud.
        </div>
      )}
      {(msg || err || error) && (
        <div
          className={`text-[11px] font-mono rounded-xs px-3 py-2 border ${err || error ? 'text-red-400 border-red-400/30 bg-red-400/5' : 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5'}`}
        >
          {err ?? error ?? msg}
        </div>
      )}

      {/* Exposure meter */}
      <section className={cardCls}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>Bankroll € (T={tBank}€)</label>
            <input
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              className={`${inputCls} w-28`}
              inputMode="decimal"
            />
          </div>
          <div>
            <label className={labelCls}>Worst cost ciclo €</label>
            <input
              value={worstCost}
              onChange={(e) => setWorstCost(e.target.value)}
              className={`${inputCls} w-28`}
              inputMode="decimal"
            />
          </div>
          <div className="font-mono text-xs text-white">
            Exposure <span className="text-[#3B82F6]">{summary.exposure}€</span>
            {' · '}attivi {summary.active}/{summary.nMax}
            {' · '}U {(summary.utilization * 100).toFixed(0)}%{' · '}
            {summary.ok ? (
              <span className="text-emerald-400">apertura OK</span>
            ) : (
              <span className="text-red-400">{summary.reason}</span>
            )}
          </div>
        </div>
        {conflicts.length > 0 && (
          <div className="mt-2 text-[11px] font-mono text-red-400 flex flex-col gap-1">
            {conflicts.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Shared leg “{c.key}” in {c.cycleIds.length} cicli ({c.cycleIds.join(', ')}) —
                correlazione vietata
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Lista cicli + nuovo ciclo */}
      <section className={cardCls}>
        <h2 className="text-sm font-semibold text-white mb-2">
          Cicli ({active.length} attivi / {cycles.length})
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {cycles.length === 0 && (
            <span className="text-[11px] font-mono text-[#64748B]">Nessun ciclo. Creane uno.</span>
          )}
          {cycles.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`px-2.5 py-1.5 text-xs font-mono rounded-xs border ${c.id === selectedId ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'text-[#94A3B8] border-[#2D3139] hover:text-white'} ${c.status === 'closed' ? 'opacity-50' : ''}`}
            >
              {c.name} · {spentByCycle(tickets, c.id)}€{c.status === 'closed' ? ' · chiuso' : ''}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelCls}>Nome</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ciclo 1"
              className={`${inputCls} w-32`}
            />
          </div>
          <div>
            <label className={labelCls}>S0 €</label>
            <input
              value={newS0}
              onChange={(e) => setNewS0(e.target.value)}
              className={`${inputCls} w-20`}
              inputMode="decimal"
            />
          </div>
          <div>
            <label className={labelCls}>Under madre</label>
            <input
              value={newUnder}
              onChange={(e) => setNewUnder(e.target.value)}
              className={`${inputCls} w-20`}
              inputMode="decimal"
            />
          </div>
          <button
            className={btnPrimary}
            onClick={() => {
              const q = Number(newUnder) || 1.32;
              const mother = Array.from({ length: 30 }, (_, i) => ({
                odds: q,
                market: 'UNDER' as const,
                label: `M${i + 1}`,
              }));
              void run(async () => {
                const c = await createCycle({
                  name: newName || `Ciclo ${cycles.length + 1}`,
                  s0: Number(newS0) || 2,
                  targetBase: tBank,
                  motherEvents: mother,
                });
                setSelectedId(c.id);
                setNewName('');
              }, 'Ciclo creato (madre 30 eventi)');
            }}
          >
            <span className="flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Nuovo ciclo
            </span>
          </button>
        </div>
      </section>

      {selected && (
        <>
          {/* Dettaglio ciclo */}
          <section className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-white">
                {selected.name} · speso {spent}€ · T {target}€ · madre{' '}
                {selected.motherEvents.length}/30
              </h2>
              <div className="flex gap-1.5">
                <button
                  className={btnGhost}
                  onClick={() => {
                    const pool =
                      selected.motherEvents.length > 0
                        ? [...selected.motherEvents]
                        : [{ odds: 1.32, market: 'UNDER' as const, label: 'NEW' }];
                    void run(async () => refillMother(selected.id, pool), 'Refill-30 eseguito');
                  }}
                >
                  Refill-30
                </button>
                <button
                  className={btnGhost}
                  onClick={() => void run(async () => closeCycle(selected.id), 'Ciclo chiuso')}
                >
                  <span className="flex items-center gap-1">
                    <Check className="w-3 h-3" /> Chiudi
                  </span>
                </button>
                <button
                  className={btnGhost}
                  onClick={() =>
                    void run(async () => {
                      await deleteCycle(selected.id);
                      setSelectedId(null);
                    }, 'Ciclo eliminato')
                  }
                >
                  <span className="flex items-center gap-1 text-red-400">
                    <Trash2 className="w-3 h-3" /> Elimina
                  </span>
                </button>
              </div>
            </div>

            {/* Top-up */}
            <div className="flex items-end gap-2 mb-3">
              <div>
                <label className={labelCls}>Top-up bankroll €</label>
                <input
                  value={topUp}
                  onChange={(e) => setTopUp(e.target.value)}
                  className={`${inputCls} w-28`}
                  inputMode="decimal"
                  placeholder="es. 500"
                />
              </div>
              <button
                className={btnGhost}
                onClick={() =>
                  void run(async () => {
                    await topUpCycle(selected.id, Number(topUp));
                    setTopUp('');
                  }, 'Top-up registrato')
                }
              >
                <span className="flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> Top-up
                </span>
              </button>
              <span className="text-[10px] font-mono text-[#64748B]">
                Bankroll rif. ciclo: {selected.bankrollStart}€
              </span>
            </div>

            {/* Ledger ticket */}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-[#64748B] uppercase text-[10px] text-left">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Tipo</th>
                    <th className="py-1 pr-2">N</th>
                    <th className="py-1 pr-2">Finale</th>
                    <th className="py-1 pr-2">Stake</th>
                    <th className="py-1 pr-2">Lordo</th>
                    <th className="py-1 pr-2">Stato</th>
                    <th className="py-1 pr-2">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {selTickets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-2 text-[#64748B]">
                        Nessun ticket. Piazza la madre o una copertura.
                      </td>
                    </tr>
                  )}
                  {selTickets.map((t) => (
                    <tr key={t.id} className="border-t border-[#2D3139] text-white">
                      <td className="py-1.5 pr-2">{t.idx}</td>
                      <td className="py-1.5 pr-2">{t.kind}</td>
                      <td className="py-1.5 pr-2">{t.legs.length}</td>
                      <td className="py-1.5 pr-2">{t.finale.toFixed(2)}</td>
                      <td className="py-1.5 pr-2">{t.stake.toFixed(2)}€</td>
                      <td className="py-1.5 pr-2">{(t.stake * t.finale).toFixed(2)}€</td>
                      <td className="py-1.5 pr-2">
                        <span
                          className={
                            t.status === 'pending'
                              ? 'text-amber-400'
                              : t.status === 'won'
                                ? 'text-emerald-400'
                                : t.status === 'lost'
                                  ? 'text-red-400'
                                  : 'text-[#64748B]'
                          }
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">
                        {t.status === 'pending' ? (
                          <div className="flex flex-wrap gap-1">
                            <button
                              className={btnGhost}
                              onClick={() =>
                                void run(async () => settleTicket(t.id, 'won'), 'Ticket vinto')
                              }
                            >
                              W
                            </button>
                            <button
                              className={btnGhost}
                              onClick={() =>
                                void run(async () => settleTicket(t.id, 'lost'), 'Ticket perso')
                              }
                            >
                              L
                            </button>
                            <button
                              className={btnGhost}
                              onClick={() =>
                                void run(
                                  async () => settleTicket(t.id, 'void'),
                                  'Ticket void (rimborso)',
                                )
                              }
                            >
                              V
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#64748B]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Void singola gamba (pending) */}
            {selTickets
              .filter((t) => t.status === 'pending')
              .map((t) => (
                <div
                  key={t.id}
                  className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-mono"
                >
                  <span className="text-[#64748B]">Void gamba #{t.idx}:</span>
                  {t.legs.map((l, i) => (
                    <button
                      key={i}
                      title="Void questa gamba (ricalcolo su N-1)"
                      className="px-1.5 py-0.5 border border-[#2D3139] rounded-xs text-[#94A3B8] hover:text-white hover:border-red-400/50"
                      onClick={() =>
                        void run(
                          async () => voidTicketLeg(t.id, i, book),
                          `Gamba ${i + 1} voidata (N=${t.legs.length - 1})`,
                        )
                      }
                    >
                      {l.label ?? `${l.market ?? ''}@${l.odds}`} <X className="inline w-3 h-3" />
                    </button>
                  ))}
                </div>
              ))}
          </section>

          {/* Nuovo ticket */}
          <section className={cardCls}>
            <h2 className="text-sm font-semibold text-white mb-2">
              Piazza ticket (1 attivo per ciclo)
            </h2>
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div>
                <label className={labelCls}>Tipo</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as CycleTicketKind)}
                  className={`${inputCls} w-36`}
                >
                  <option value="MOTHER">MOTHER</option>
                  <option value="COVERAGE">COVERAGE</option>
                  <option value="TERMINATION">TERMINATION</option>
                  <option value="LOCK">LOCK</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Book</label>
                <select
                  value={bookId || books[0]?.id || ''}
                  onChange={(e) => setBookId(e.target.value)}
                  className={`${inputCls} w-36`}
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Bleed EV €</label>
                <input
                  value={bleed}
                  onChange={(e) => setBleed(e.target.value)}
                  className={`${inputCls} w-24`}
                  inputMode="decimal"
                />
              </div>
              <div className="text-[11px] font-mono text-[#64748B]">
                bleed atteso catena:{' '}
                {expectedBleed(
                  selTickets.filter((t) => t.status === 'pending').map((t) => t.stake),
                )}
                €
              </div>
            </div>

            {/* F5 — quote suggerite liberidalavoro.it/OddsScasser */}
            <div className="mb-3 border border-[#2D3139] rounded-xs p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className={labelCls}>Coperture suggerite (Lottomatica→Sisal, rating)</span>
                <button
                  className={btnGhost}
                  onClick={() => void loadLdlOdds()}
                  disabled={ldlLoading}
                >
                  {ldlLoading ? 'Carico…' : 'Aggiorna quote LDL'}
                </button>
              </div>
              {ldlSource === 'mock' && (
                <div className="text-[10px] font-mono text-amber-400 mb-1">
                  dati mock (edge non raggiungibile o LDL_BEARER_TOKEN non impostato)
                </div>
              )}
              {ldlError && (
                <div className="text-[10px] font-mono text-red-400 mb-1">{ldlError}</div>
              )}
              {ldlRows.length === 0 ? (
                <div className="text-[11px] font-mono text-[#64748B]">Nessuna quota caricata.</div>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {ldlRows.map((row) => {
                    const u = bestCoverSide(row, 'under');
                    const o = bestCoverSide(row, 'over');
                    return (
                      <div
                        key={row.eventId}
                        className="flex items-center justify-between gap-2 text-[11px] font-mono text-white"
                      >
                        <span className="truncate">
                          {row.rating != null && (
                            <span className="text-emerald-400">[{row.rating.toFixed(3)}] </span>
                          )}
                          {row.home} - {row.away}
                          {row.league && <span className="text-[#64748B]"> · {row.league}</span>}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          {u && (
                            <button className={btnGhost} onClick={() => applyLdlRow(row, 'under')}>
                              U {u.odds.toFixed(2)}
                            </button>
                          )}
                          {o && (
                            <button className={btnGhost} onClick={() => applyLdlRow(row, 'over')}>
                              O {o.odds.toFixed(2)}
                            </button>
                          )}
                          {!u && !o && (
                            <span className="text-[#64748B]">nessuna quota @{row.line}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5 mb-2">
              {legRows.map((r, i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={r.odds}
                    onChange={(e) =>
                      setLegRows((rows) =>
                        rows.map((x, j) => (j === i ? { ...x, odds: e.target.value } : x)),
                      )
                    }
                    className={`${inputCls} w-24`}
                    inputMode="decimal"
                    placeholder="quota"
                  />
                  <select
                    value={r.market}
                    onChange={(e) =>
                      setLegRows((rows) =>
                        rows.map((x, j) =>
                          j === i ? { ...x, market: e.target.value as 'OVER' | 'UNDER' } : x,
                        ),
                      )
                    }
                    className={`${inputCls} w-28`}
                  >
                    <option value="UNDER">UNDER</option>
                    <option value="OVER">OVER</option>
                  </select>
                  <input
                    value={r.label}
                    onChange={(e) =>
                      setLegRows((rows) =>
                        rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    className={inputCls}
                    placeholder="label match (guard)"
                  />
                  <button
                    className={btnGhost}
                    onClick={() => setLegRows((rows) => rows.filter((_, j) => j !== i))}
                    disabled={legRows.length <= 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                className={btnGhost}
                onClick={() =>
                  setLegRows((rows) => (rows.length >= 30 ? rows : [...rows, emptyLeg()]))
                }
              >
                <span className="flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Gamba
                </span>
              </button>
            </div>
            {parsed.error && (
              <div className="text-[11px] font-mono text-red-400 mb-2">{parsed.error}</div>
            )}
            {preview && preview.feasible && (
              <div className="text-[11px] font-mono text-white mb-2">
                Preview: N={preview.n} finale {preview.finale.toFixed(2)} · stake neutra{' '}
                {preview.stakeNeutral.toFixed(2)}€{' → '}piazza{' '}
                <span className="text-[#3B82F6]">{preview.stake.toFixed(2)}€</span>
                {' · '}lordo {preview.lordo.toFixed(2)}€ · netto {preview.nettoNoBleed.toFixed(2)}€
              </div>
            )}
            <button
              className={btnPrimary}
              disabled={!parsed.legs || !preview?.feasible}
              onClick={() => {
                if (!parsed.legs || !preview || !book) {
                  return;
                }
                void run(
                  async () => {
                    await addTicket(selected.id, {
                      kind,
                      legs: parsed.legs as TicketLeg[],
                      stake: preview.stake,
                      finale: preview.finale,
                      target,
                      book,
                    });
                    setLegRows([emptyLeg()]);
                  },
                  `Ticket ${kind} piazzato: ${preview.stake.toFixed(2)}€`,
                );
              }}
            >
              Piazza {preview ? `${preview.stake.toFixed(2)}€` : ''}
            </button>
          </section>

          {/* Calcolatore terminazione */}
          <section className={cardCls}>
            <h2 className="text-sm font-semibold text-white mb-2">Calcolatore terminazione</h2>
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div>
                <label className={labelCls}>N corto (1–30)</label>
                <input
                  value={termN}
                  onChange={(e) => setTermN(e.target.value)}
                  className={`${inputCls} w-24`}
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className={labelCls}>Over prossimo evento</label>
                <input
                  value={termOver}
                  onChange={(e) => setTermOver(e.target.value)}
                  className={`${inputCls} w-24`}
                  inputMode="decimal"
                />
              </div>
              <div className="text-[11px] font-mono text-[#64748B]">
                Tetto lock: speso ≤{' '}
                {termination?.ceiling != null ? `${termination.ceiling.toFixed(2)}€` : '—'} (s_cap
                150€ @2.75)
              </div>
            </div>
            {termination?.error && (
              <div className="text-[11px] font-mono text-red-400">{termination.error}</div>
            )}
            {termination &&
              !termination.error &&
              (termination.res ? (
                <div className="text-[12px] font-mono text-white">
                  <Check className="inline w-3.5 h-3.5 text-emerald-400" /> {termination.res.label}:
                  stake <span className="text-[#3B82F6]">{termination.res.stake.toFixed(2)}€</span>
                  {' · '}finale {termination.res.finale.toFixed(2)}
                  {' · '}T {target}€ · netto {termination.res.nettoNoBleed.toFixed(2)}€
                </div>
              ) : (
                <div className="text-[12px] font-mono text-red-400 flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5" /> Nulla di piazzabile → STOP (mai perdita forzata)
                </div>
              ))}
          </section>
        </>
      )}
    </div>
  );
};
