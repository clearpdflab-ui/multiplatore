import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, CheckSquare, Copy, Layers, ShieldCheck, Square } from 'lucide-react';
import type { GeneratedSlip } from '../types';
import { generateCustomSlips, getSlipBook } from '../utils/mathEngine';
import { requoteGate } from '../engine/requote';
import { useOperation } from '../store/useOperation';
import { Badge, Banner, Button, Card, EmptyState } from './ui';

interface PlaceViewProps {
  onOpenCerca: () => void;
  onOpenPrepara: () => void;
}

const PLACED_KEY = 'multiplatore:placed:v1';

function opHash(op: { matches: unknown[]; params: unknown }): string {
  const s = JSON.stringify([op.matches, op.params]);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return `op${Math.abs(h).toString(36)}`;
}

function loadPlaced(key: string): string[] {
  try {
    const raw = localStorage.getItem(PLACED_KEY);
    if (!raw) {
      return [];
    }
    const obj = JSON.parse(raw) as Record<string, string[]>;
    return Array.isArray(obj[key]) ? obj[key] : [];
  } catch {
    return [];
  }
}

function savePlaced(key: string, codes: string[]) {
  try {
    const raw = localStorage.getItem(PLACED_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    obj[key] = codes;
    localStorage.setItem(PLACED_KEY, JSON.stringify(obj));
  } catch {
    /* resta in memoria */
  }
}

function slipClipboardText(slip: GeneratedSlip): string {
  const isLay = slip.type === 'FINAL_LAY';
  const bi = getSlipBook(slip);
  const lines = [
    `📋 ${slip.title} [${slip.code}]`,
    `🕒 ${slip.timing}`,
    isLay
      ? `🏦 BANCA su Betfair: €${slip.stake.toFixed(2)} | resp. €${(slip.liability ?? 0).toFixed(2)} @${slip.finalMultiplier.toFixed(2)}`
      : `💰 Puntata: €${slip.stake.toFixed(2)}`,
    bi.books.length > 0
      ? bi.mixed
        ? `⚠ MISTO (${bi.books.join(', ')})`
        : `🏦 Su: ${bi.single}`
      : '',
    ...slip.items.map(
      (it) =>
        `${it.homeTeam}-${it.awayTeam} → ${it.market} @${it.odds.toFixed(2)}${it.book ? ` [${it.book}]` : ''}`,
    ),
  ].filter(Boolean);
  return lines.join('\n');
}

export const PlaceView: React.FC<PlaceViewProps> = ({ onOpenCerca, onOpenPrepara }) => {
  const { operation } = useOperation();
  const { matches, params } = operation;
  const [gateVerdict, setGateVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const key = useMemo(() => opHash(operation), [operation]);
  const [placed, setPlaced] = useState<string[]>(() => loadPlaced(key));

  useEffect(() => {
    setPlaced(loadPlaced(key));
    setGateVerdict(null);
  }, [key]);

  const togglePlaced = (code: string) => {
    setPlaced((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      savePlaced(key, next);
      return next;
    });
  };

  const copySlip = (slip: GeneratedSlip) => {
    void navigator.clipboard?.writeText(slipClipboardText(slip));
    setCopiedId(slip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const result = useMemo(() => {
    if (matches.length === 0) {
      return null;
    }
    return generateCustomSlips(
      matches,
      params.baseStake,
      params.targetProfit,
      params.asymmetricMode,
      params.enableBooster,
      params.boosterOdds,
      4,
      params.finalHedgeMode,
      {
        layOdds: params.layOdds,
        layCommissionPct: params.layCommissionPct,
        layStake: params.layStake,
        harmonized: params.harmonized,
        budget: params.budget,
        targetMode: params.targetMode,
        roiPct: params.roiPct,
        baseCap: params.baseCap,
      },
      params.line,
    );
  }, [matches, params]);

  if (!result || matches.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<Layers className="w-10 h-10" />}
          title="Niente da piazzare"
          text="Prepara prima una scala: cerca le partite, importale nel workbench e arma la scala. Poi torna qui per piazzare un ticket alla volta."
          actionLabel="Vai a Prepara"
          onAction={onOpenPrepara}
        />
      </div>
    );
  }

  const placeable = [result.motherSlip, ...result.coverageSlips].filter(
    (s) => s.status === 'ACTIVE' || s.status === 'PENDING',
  );
  const done = placeable.filter((s) => placed.includes(s.code)).length;
  const guaranteed = result.harmonization?.equalizedNet ?? result.netGainRealized ?? 0;
  const target =
    params.targetMode === 'roi' ? (result.harmonization?.targetUsed ?? 0) : params.targetProfit;

  const handleGate = () => {
    if (matches.length < 2) {
      setGateVerdict({ ok: false, text: 'STOP: servono almeno 2 partite.' });
      return;
    }
    const v = requoteGate({
      matches,
      baseStake: params.baseStake,
      targetProfit: params.targetProfit,
      targetMode: params.targetMode,
      roiPct: params.roiPct,
      baseCap: params.baseCap,
      layCommissionPct: params.layCommissionPct,
      layQuoteObserved: params.layOdds,
      finaleModes: [params.finalHedgeMode === 'lay_exchange' ? 'lay' : 'book'],
    });
    setGateVerdict(v.ok ? { ok: true, text: v.note } : { ok: false, text: v.detail });
  };

  return (
    <div className="space-y-4">
      {/* Tre numeri, stop */}
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div>
            <div className="text-[10px] uppercase text-[#64748B]">Garantito</div>
            <div className="text-lg sm:text-xl font-bold text-emerald-400">
              +€{guaranteed.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[#64748B]">Esposizione</div>
            <div className="text-lg sm:text-xl font-bold text-white">
              €{result.maxPotentialExposure.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[#64748B]">Target</div>
            <div className="text-lg sm:text-xl font-bold text-white">€{target.toFixed(2)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={handleGate}>
            <ShieldCheck className="w-3.5 h-3.5" /> Riverifica ora
          </Button>
          <span className="text-[11px] font-mono text-[#64748B]">
            {done}/{placeable.length} piazzati · riverifica dopo ogni modifica quote
          </span>
        </div>
        {gateVerdict && (
          <Banner
            tone={gateVerdict.ok ? 'ok' : 'bad'}
            title={gateVerdict.ok ? 'Via libera' : 'Stop'}
          >
            {gateVerdict.text}
          </Banner>
        )}
      </Card>

      {/* Schede piazzamento */}
      {placeable.map((slip) => {
        const bi = getSlipBook(slip);
        const isDone = placed.includes(slip.code);
        const isLay = slip.type === 'FINAL_LAY';
        return (
          <Card
            key={slip.code}
            accent={isDone ? 'none' : isLay ? 'violet' : 'emerald'}
            className={isDone ? 'opacity-60' : ''}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={isLay ? 'violet' : 'info'}>{slip.code}</Badge>
                  {bi.books.length > 0 &&
                    (bi.mixed ? (
                      <Badge tone="warn" title={`Gambe su più book: ${bi.books.join(', ')}`}>
                        Misto: {bi.books.join('+')}
                      </Badge>
                    ) : (
                      <Badge tone="info" title={`Ticket prenotato su ${bi.single}`}>
                        Su {bi.single}
                      </Badge>
                    ))}
                  {isDone && <Badge tone="ok">Piazzato ✓</Badge>}
                </div>
                <h3 className="text-white font-bold text-sm mt-1">{slip.title}</h3>
                <p className="text-[11px] font-mono text-[#64748B]">{slip.timing}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase font-mono text-[#64748B]">
                  {isLay ? 'Banca' : 'Punta'}
                </div>
                <div className="text-2xl font-bold font-mono text-white">
                  €{slip.stake.toFixed(2)}
                </div>
                {isLay && (
                  <div className="text-[11px] font-mono text-violet-300">
                    resp. €{(slip.liability ?? 0).toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              {slip.items.map((it, i) => (
                <div
                  key={`${it.matchId}-${i}`}
                  className="flex items-center justify-between gap-2 text-xs font-mono bg-[#141824] border border-[#20242C] rounded-xs px-2 py-1.5"
                >
                  <span className="truncate text-[#E0E2E7]">
                    {it.homeTeam}-{it.awayTeam} <span className="text-[#64748B]">{it.market}</span>
                    {it.book && <span className="text-sky-300"> [{it.book}]</span>}
                  </span>
                  <span className="font-bold text-white shrink-0">@{it.odds.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                small
                variant={isDone ? 'ghost' : 'success'}
                onClick={() => togglePlaced(slip.code)}
              >
                {isDone ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <CheckSquare className="w-3.5 h-3.5" />
                )}
                {isDone ? 'Annulla' : 'Piazzato ✓'}
              </Button>
              <Button small onClick={() => copySlip(slip)}>
                {copiedId === slip.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Copia
              </Button>
            </div>
          </Card>
        );
      })}

      {placeable.length === 0 && (
        <EmptyState
          icon={<Calendar className="w-10 h-10" />}
          title="Scala chiusa"
          text="Tutti gli esiti sono risolti: niente da piazzare. Cerca nuove partite per la prossima scala."
          actionLabel="Vai a Cerca"
          onAction={onOpenCerca}
        />
      )}
    </div>
  );
};
