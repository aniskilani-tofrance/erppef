"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = { name: string; valeur: number; plafond?: number };

export function OccupancyChart({ data, unit }: { data: Row[]; unit: string }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} unit={` ${unit}`} />
          <Tooltip
            formatter={(value, name) => [`${value ?? 0} ${unit}`, name === "valeur" ? "Planifié" : "Plafond"]}
            labelStyle={{ fontWeight: 600 }}
          />
          <Bar dataKey="plafond" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} name="plafond" />
          <Bar dataKey="valeur" fill="#3b82f6" radius={[4, 4, 0, 0]} name="valeur" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
