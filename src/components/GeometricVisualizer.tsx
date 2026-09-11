import React from 'react';
import { StepCalculation } from '../types';

interface GeometricVisualizerProps {
  steps: StepCalculation[];
  baseStake: number;
  baseWin: number;
  currentStepIndex?: number;
}

export const GeometricVisualizer: React.FC<GeometricVisualizerProps> = ({
  steps,
  baseStake,
  baseWin,
}) => {
  const maxCost = steps.length > 0 ? steps[steps.length - 1].cumulativeCost : 100;
  const maxWin = steps.length > 0 ? Math.max(...steps.map((s) => s.grossWin), baseWin) : 200;

  // Generate SVG path points for the capital exposure curve
  const svgWidth = 460;
  const svgHeight = 180;
  const paddingX = 30;
  const paddingY = 20;

  const points = steps.map((s, idx) => {
    const x = paddingX + (idx / Math.max(1, steps.length - 1)) * (svgWidth - 2 * paddingX);
    const y = svgHeight - paddingY - (s.cumulativeCost / maxCost) * (svgHeight - 2 * paddingY);
    return { x, y, step: s.step, cost: s.cumulativeCost, win: s.grossWin, roi: s.roiPercentage };
  });

  const pathD =
    points.length > 0
      ? `M ${points[0].x} ${points[0].y} ` +
        points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(' ')
      : 'M 0 180 Q 100 180, 200 100 T 400 20';

  const inflectionIdx = Math.floor(points.length / 2);
  const inflectionPoint = points[inflectionIdx] || { x: 230, y: 90 };

  return (
    <div className="relative w-full h-full flex flex-col justify-between overflow-hidden p-6 sm:p-8 bg-[#0A0B10]">
      {/* Background Dot Matrix */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#3B82F6 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Top micro metadata */}
      <div className="relative z-10 flex justify-between items-center text-xs font-mono text-[#64748B]">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#3B82F6] rounded-full"></span>
          CURVA DI SCALARE E PUNTO DI INFLESSIONE
        </span>
        <span className="text-[#3B82F6]">Capitale Max Esposto: €{maxCost.toFixed(2)}</span>
      </div>

      {/* SVG Canvas */}
      <div className="relative z-10 flex-1 flex items-center justify-center my-4">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full max-w-xl h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#3B82F6" stopOpacity="1" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={svgHeight - paddingY}
            x2={svgWidth - paddingX}
            y2={svgHeight - paddingY}
            stroke="#2D3139"
            strokeWidth="1"
          />
          <line
            x1={paddingX}
            y1={paddingY}
            x2={paddingX}
            y2={svgHeight - paddingY}
            stroke="#2D3139"
            strokeWidth="1"
          />

          {/* Horizontal guide dashed lines */}
          <line
            x1={paddingX}
            y1={svgHeight / 2}
            x2={svgWidth - paddingX}
            y2={svgHeight / 2}
            stroke="#2D3139"
            strokeWidth="1"
            strokeDasharray="2 4"
          />

          {/* Area fill */}
          {points.length > 0 && (
            <path
              d={`${pathD} L ${points[points.length - 1].x} ${svgHeight - paddingY} L ${points[0].x} ${svgHeight - paddingY} Z`}
              fill="url(#areaGradient)"
            />
          )}

          {/* Main Curve */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#curveGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Dashed projection line */}
          <path
            d={`M 0 160 Q ${inflectionPoint.x / 2} 160, ${inflectionPoint.x} ${inflectionPoint.y} T ${svgWidth} 10`}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="1"
            strokeDasharray="2 4"
            opacity="0.3"
          />

          {/* Points */}
          {points.map((p, idx) => (
            <g key={idx} className="group cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r={idx === inflectionIdx ? 5 : 3.5}
                fill={idx === points.length - 1 ? '#EF4444' : '#3B82F6'}
                stroke="#0A0B10"
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y - 8}
                fill="#94A3B8"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
                className="opacity-70 group-hover:opacity-100"
              >
                €{p.cost}
              </text>
            </g>
          ))}

          {/* Inflection Point highlight */}
          {inflectionPoint && (
            <g>
              <circle
                cx={inflectionPoint.x}
                cy={inflectionPoint.y}
                r="7"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="1.5"
                className="animate-ping opacity-60"
              />
              <text
                x={Math.min(inflectionPoint.x + 12, svgWidth - 140)}
                y={inflectionPoint.y - 12}
                fill="#3B82F6"
                fontFamily="monospace"
                fontSize="9.5"
                fontWeight="bold"
                letterSpacing="0.05em"
              >
                PUNTO DI INFLESSIONE (α)
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* 4 Phases Breakdown in geometric style */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-auto">
        <div className="border-t-2 border-[#3B82F6] pt-2 bg-[#0F1117]/60 p-2 rounded-xs border-x border-b border-[#2D3139]/40">
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono">
            Fase 1
          </div>
          <div className="text-xs font-semibold text-white">Copertura Base</div>
          <div className="text-[10px] text-[#94A3B8] font-mono mt-0.5">
            Stake €{baseStake} // Under
          </div>
        </div>

        <div className="border-t-2 border-[#3B82F6] pt-2 bg-[#0F1117]/60 p-2 rounded-xs border-x border-b border-[#2D3139]/40">
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono">
            Fase 2
          </div>
          <div className="text-xs font-semibold text-white">Incremento α</div>
          <div className="text-[10px] text-[#3B82F6] font-mono mt-0.5">Scale 1.15x - 1.4x</div>
        </div>

        <div className="border-t-2 border-orange-400 pt-2 bg-[#0F1117]/60 p-2 rounded-xs border-x border-b border-[#2D3139]/40 opacity-90">
          <div className="text-[10px] text-orange-400 uppercase tracking-wider font-mono">
            Fase 3
          </div>
          <div className="text-xs font-semibold text-white">Saturazione</div>
          <div className="text-[10px] text-[#94A3B8] font-mono mt-0.5">Costo &gt; €100</div>
        </div>

        <div className="border-t-2 border-red-500 pt-2 bg-[#0F1117]/60 p-2 rounded-xs border-x border-b border-[#2D3139]/40 opacity-90">
          <div className="text-[10px] text-red-400 uppercase tracking-wider font-mono">Fase 4</div>
          <div className="text-xs font-semibold text-white">Rischio Singola</div>
          <div className="text-[10px] text-[#94A3B8] font-mono mt-0.5">Hedging o Cashout</div>
        </div>
      </div>
    </div>
  );
};
