import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Day, Slot } from '../lib/types';
import { fmtTime, slotLabel } from '../lib/time';
import { useMediaQuery } from '../lib/useMediaQuery';

export interface CellSpec {
  className: string;
  content: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  style?: CSSProperties;
}

interface Props {
  days: Day[];
  slots: Slot[];
  renderCell: (day: Day, slot: Slot) => CellSpec;
}

function CellButton({ spec }: { spec: CellSpec }) {
  return (
    <button
      type="button"
      className={`cell ${spec.className}`}
      style={spec.style}
      onClick={spec.onClick}
      disabled={!spec.onClick}
      aria-label={spec.ariaLabel}
    >
      {spec.content}
    </button>
  );
}

function todayWeekday(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

/** Desktop: grade estilo planilha. Celular: abas por dia + lista de horários. */
export default function WeekView({ days, slots, renderCell }: Props) {
  const isMobile = useMediaQuery('(max-width: 719px)');
  const [picked, setPicked] = useState<number | null>(null);

  if (days.length === 0 || slots.length === 0) {
    return <p className="muted">Nenhum dia ou horário ativo. Configure em “Horários”.</p>;
  }

  if (isMobile) {
    const fallback = days.find((d) => d.weekday === todayWeekday()) ?? days[0];
    const day = days.find((d) => d.weekday === picked) ?? fallback;
    return (
      <div>
        <div className="day-tabs" role="tablist">
          {days.map((d) => (
            <button
              key={d.weekday}
              role="tab"
              aria-selected={d.weekday === day.weekday}
              className={d.weekday === day.weekday ? 'active' : ''}
              onClick={() => setPicked(d.weekday)}
            >
              {d.label.slice(0, 3)}
            </button>
          ))}
        </div>
        <h2 className="day-title">{day.label}</h2>
        <div className="slot-list">
          {slots.map((s) => (
            <div className="slot-row" key={s.id}>
              <span className="slot-time">{fmtTime(s.start_time)}</span>
              <CellButton spec={renderCell(day, s)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th className="corner">Horário</th>
            {days.map((d) => (
              <th key={d.weekday}>{d.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id}>
              <th className="time" scope="row">
                {slotLabel(s)}
              </th>
              {days.map((d) => (
                <td key={d.weekday}>
                  <CellButton spec={renderCell(d, s)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
