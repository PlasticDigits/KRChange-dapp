import { ReactNode } from "react";

type Props = {
  label: string;
  value: string;
  delta?: number;
  icon?: ReactNode;
};

export function KpiCard({ label, value, delta, icon }: Props) {
  const deltaColor = delta === undefined ? "" : delta >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]";
  const deltaSign = delta === undefined ? "" : delta >= 0 ? "+" : "";

  return (
    <div className="card p-4 flex items-start justify-between">
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
        {delta !== undefined && (
          <div className={`text-xs mt-1 ${deltaColor}`}>{deltaSign}{delta.toFixed(2)}%</div>
        )}
      </div>
      {icon && <div className="p-2 rounded-md bg-secondary text-muted-foreground">{icon}</div>}
    </div>
  );
}


