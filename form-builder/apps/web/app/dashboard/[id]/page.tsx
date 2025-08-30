"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function DashboardPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [summary, setSummary] = useState<Record<string, Record<string, number>>>({});
  const [connected, setConnected] = useState(false);

  // fetch initial summary
  useEffect(() => {
    (async () => {
      const res = await apiGet(`/analytics/${id}/summary`);
      setSummary(res.buckets || {});
    })();
  }, [id]);

  // ws updates
  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE!;
    const ws = new WebSocket(`${wsBase}?formId=${id}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "response:created") {
          const ans = msg.payload.answers as {fieldId: string, value: any}[];
          setSummary(prev => {
            const copy: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(prev));
            for (const a of ans) {
              const key = a.fieldId;
              if (!copy[key]) copy[key] = {};
              const val = Array.isArray(a.value) ? a.value : [a.value];
              for (const v of val) {
                const k = typeof v === "string" ? v : JSON.stringify(v);
                copy[key][k] = (copy[key][k] || 0) + 1;
              }
            }
            return copy;
          });
        }
      } catch {}
    };
    return () => ws.close();
  }, [id]);

  return (
    <main className="space-y-4">
      <div className="rounded border p-4 bg-white dark:bg-gray-900">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm">Live: <span className={connected ? "text-green-600" : "text-gray-500"}>{connected ? "connected" : "disconnected"}</span></p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {Object.entries(summary).map(([fieldId, buckets]) => (
          <ChartCard key={fieldId} fieldId={fieldId} buckets={buckets} />
        ))}
      </div>
    </main>
  );
}

function ChartCard({ fieldId, buckets }: { fieldId: string; buckets: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const labels = Object.keys(buckets);
    const data = Object.values(buckets);
    if (!canvasRef.current) return;
    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets[0].data = data as any;
      chartRef.current.update();
      return;
    }
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: fieldId,
          data: data,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [buckets, fieldId]);

  return (
    <div className="rounded border p-4 bg-white dark:bg-gray-900">
      <h3 className="font-medium mb-3">Field: {fieldId}</h3>
      <canvas ref={canvasRef} />
      <table className="mt-3 text-sm w-full">
        <thead>
          <tr><th className="text-left">Value</th><th className="text-right">Count</th></tr>
        </thead>
        <tbody>
          {Object.entries(buckets).map(([k,v]) => (
            <tr key={k} className="border-t">
              <td className="py-1">{k}</td>
              <td className="py-1 text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}