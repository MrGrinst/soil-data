import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const RANGE_OPTIONS = [
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 }
];

function formatTimestamp(value) {
  if (!value) {
    return "No data";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function useDashboardData(hours) {
  const [state, setState] = useState({
    current: null,
    history: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setState((previous) => ({
          ...previous,
          loading: true,
          error: null
        }));

        const [currentResponse, historyResponse] = await Promise.all([
          fetch("/api/current"),
          fetch(`/api/history?hours=${hours}`)
        ]);

        if (!currentResponse.ok || !historyResponse.ok) {
          throw new Error("Failed to load dashboard data");
        }

        const currentPayload = await currentResponse.json();
        const historyPayload = await historyResponse.json();

        if (!cancelled) {
          setState({
            current: currentPayload.reading,
            history: historyPayload.readings,
            loading: false,
            error: null
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : String(error)
          }));
        }
      }
    }

    load();

    const timer = setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hours]);

  return state;
}

export default function App() {
  const [hours, setHours] = useState(24);
  const { current, history, loading, error } = useDashboardData(hours);

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Garden Soil Moisture</p>
          <h1>Keep a clean read on what your bed is doing.</h1>
          <p className="hero-copy">
            Polling Ecowitt every 2 minutes and storing the results locally in SQLite.
          </p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Current moisture</p>
          <p className="stat-value">
            {current ? `${Math.round(current.moisturePercent)}%` : "--"}
          </p>
          <p className="stat-meta">Last updated {formatTimestamp(current?.recordedAt)}</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">History</p>
            <h2>Moisture over time</h2>
          </div>

          <div className="range-switcher" aria-label="History range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.hours}
                className={option.hours === hours ? "range-button active" : "range-button"}
                onClick={() => setHours(option.hours)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="message error">{error}</p> : null}
        {loading ? <p className="message">Loading latest readings...</p> : null}
        {!loading && history.length === 0 ? (
          <p className="message">No readings yet. The chart will populate after the first successful poll.</p>
        ) : null}

        {history.length > 0 ? (
          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={history}>
                <CartesianGrid stroke="rgba(130, 144, 124, 0.18)" vertical={false} />
                <XAxis
                  dataKey="recordedAt"
                  minTickGap={24}
                  tickFormatter={formatTimestamp}
                  stroke="#51614f"
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="#51614f"
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  formatter={(value) => [`${Math.round(value)}%`, "Moisture"]}
                  labelFormatter={formatTimestamp}
                />
                <Line
                  type="monotone"
                  dataKey="moisturePercent"
                  stroke="#58763c"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </section>
    </main>
  );
}
