"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Field = {
  id: string;
  type: "text"|"textarea"|"mcq"|"checkbox"|"rating";
  label: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
};

export default function PublicFormPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [form, setForm] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => setForm(await apiGet(`/forms/${id}`)))();
  }, [id]);

  const visibleFields = useMemo(() => {
    if (!form) return [];
    return (form.fields || []) as Field[];
  }, [form]);

  async function submit() {
    setError(null);
    // client-side validation
    for (const f of visibleFields) {
      if (f.required && (answers[f.id] === undefined || answers[f.id] === "" || (Array.isArray(answers[f.id]) && answers[f.id].length===0))) {
        setError(`Please fill: ${f.label}`);
        return;
      }
    }
    await apiPost("/responses", { formId: id, answers: Object.keys(answers).map(k=>({ fieldId: k, value: answers[k] })) });
    setSent(true);
  }

  if (!form) return <p>Loading...</p>;
  if (sent) return <p className="text-green-600">Thanks! Your response was recorded.</p>;

  return (
    <main className="rounded-2xl border p-6 bg-white dark:bg-gray-900">
      <h1 className="text-xl font-semibold">{form.title}</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{form.description}</p>
      <div className="mt-6 space-y-4">
        {visibleFields.map((f: Field) => (
          <div key={f.id}>
            <label className="block text-sm font-medium">{f.label} {f.required && <span className="text-red-500">*</span>}</label>
            {f.type === "text" && (
              <input className="w-full border rounded px-2 py-1 bg-transparent"
                value={answers[f.id] || ""} onChange={e=>setAnswers({...answers,[f.id]: e.target.value})}/>
            )}
            {f.type === "textarea" && (
              <textarea className="w-full border rounded px-2 py-1 bg-transparent"
                value={answers[f.id] || ""} onChange={e=>setAnswers({...answers,[f.id]: e.target.value})}/>
            )}
            {f.type === "mcq" && (
              <div className="flex flex-col gap-2 mt-1">
                {(f.options||[]).map(opt => (
                  <label key={opt} className="inline-flex items-center gap-2">
                    <input type="radio" name={f.id} checked={answers[f.id]===opt} onChange={()=>setAnswers({...answers,[f.id]: opt})}/>
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {f.type === "checkbox" && (
              <div className="flex flex-col gap-2 mt-1">
                {(f.options||[]).map(opt => {
                  const arr: string[] = answers[f.id] || [];
                  const toggled = arr.includes(opt) ? arr.filter(o=>o!==opt) : [...arr, opt];
                  return (
                    <label key={opt} className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={arr.includes(opt)} onChange={()=>setAnswers({...answers,[f.id]: toggled})}/>
                      {opt}
                    </label>
                  );
                })}
              </div>
            )}
            {f.type === "rating" && (
              <input type="number" min={f.min || 1} max={f.max || 5}
                className="w-24 border rounded px-2 py-1 bg-transparent"
                value={answers[f.id] ?? (f.min || 1)} onChange={e=>setAnswers({...answers,[f.id]: Number(e.target.value)})}/>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <button onClick={submit} className="mt-6 px-4 py-2 bg-black text-white rounded">Submit</button>
    </main>
  );
}