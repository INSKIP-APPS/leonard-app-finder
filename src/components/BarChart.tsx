export interface BarItem {
  label: string;
  value: number;
}

const COLORS = [
  "linear-gradient(90deg, #004489 0%, #00b4ff 100%)",
  "linear-gradient(90deg, #00b4ff 0%, #7ed4ff 100%)",
  "linear-gradient(90deg, #ff005a 0%, #ff6b9d 100%)",
  "linear-gradient(90deg, #3c006e 0%, #7a3cb8 100%)",
  "linear-gradient(90deg, #004489 0%, #3c006e 100%)",
  "linear-gradient(90deg, #6b7280 0%, #cbd5e1 100%)",
];

export function BarChart({
  title,
  data,
  bare = false,
}: {
  title: string;
  data: BarItem[];
  bare?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className={bare ? "" : "card-flat p-6 fade-up"}>
      {!bare && (
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base">{title}</h3>
          <span className="text-xs text-muted font-medium">{total} AAP</span>
        </div>
      )}
      <div className="space-y-4">
        {data.map((d, i) => {
          const pct = Math.round((d.value / max) * 100);
          return (
            <div key={d.label} className="group">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-text group-hover:text-navy transition-colors">
                  {d.label}
                </span>
                <span className="text-muted font-semibold tabular-nums">{d.value}</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#eef2ff] overflow-hidden">
                <div
                  className="h-full rounded-full bar-fill group-hover:brightness-110 transition-all"
                  style={{
                    width: `${pct}%`,
                    background: COLORS[i % COLORS.length],
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
