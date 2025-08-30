"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut, apiPost } from "@/lib/api";

const genId = () => Math.random().toString(36).slice(2, 10);

type Field = {
  id: string;
  type: "text"|"textarea"|"mcq"|"checkbox"|"rating";
  label: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  placeholder?: string;
};

export default function BuilderPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    (async () => {
      const f = await apiGet(`/forms/${id}`);
      setTitle(f.title);
      setDescription(f.description || "");
      setFields(f.fields || []);
      setStatus(f.status);
      setLoading(false);
    })();
  }, [id]);

  function addField(t: Field["type"]) {
    const base: Field = {
      id: genId(),
      type: t,
      label: t.toUpperCase() + " Field",
      required: false,
    };
    if (t === "mcq" || t === "checkbox") base.options = ["Option A", "Option B"];
    if (t === "rating") { base.min = 1; base.max = 5; }
    setFields(prev => [...prev, base]);
  }

  // Basic HTML5 DnD
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  function onDragStart(idx: number) { setDragIndex(idx); }
  function onDrop(idx: number) {
    if (dragIndex === null || dragIndex === idx) return;
    const copy = [...fields];
    const [m] = copy.splice(dragIndex, 1);
    copy.splice(idx, 0, m);
    setFields(copy);
    setDragIndex(null);
  }

  async function save() {
    const f = await apiPut(`/forms/${id}`, { title, description, fields });
    setStatus(f.status);
    alert("Saved!");
  }

  async function publish() {
    const f = await apiPost(`/forms/${id}/publish`, {});
    setStatus(f.status);
    alert("Published! Share URL copied.");
    const share = `${window.location.origin}/f/${id}`;
    navigator.clipboard?.writeText(share);
  }

  const shareURL = useMemo(() => typeof window !== "undefined" ? `${window.location.origin}/f/${id}` : "", [id]);

  if (loading) return <p>Loading...</p>;

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Builder — {status}</h1>
        <div className="space-x-2">
          <button onClick={save} className="px-3 py-1 border rounded">Save</button>
          <button onClick={publish} className="px-3 py-1 bg-black text-white rounded">Publish</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-lg border p-4 bg-white dark:bg-gray-900">
            <label className="block text-sm font-medium">Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full border rounded px-2 py-1 mt-1 bg-transparent" />
            <label className="block text-sm font-medium mt-3">Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} className="w-full border rounded px-2 py-1 mt-1 bg-transparent" />
          </div>

          <div className="rounded-lg border p-4 bg-white dark:bg-gray-900">
            <h2 className="font-medium mb-3">Fields</h2>
            <ul className="space-y-3">
              {fields.map((f, idx) => (
                <li key={f.id}
                    draggable
                    onDragStart={()=>onDragStart(idx)}
                    onDragOver={(e)=>e.preventDefault()}
                    onDrop={()=>onDrop(idx)}
                    className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">Drag • {f.type}</div>
                    <button onClick={()=>setFields(prev=>prev.filter(x=>x.id!==f.id))} className="text-red-600 text-sm">remove</button>
                  </div>
                  <label className="block text-xs mt-2">Label</label>
                  <input value={f.label} onChange={(e)=>{
                    const v = e.target.value; setFields(prev=>prev.map(x=>x.id===f.id?{...x,label:v}:x));
                  }} className="w-full border rounded px-2 py-1 bg-transparent"/>
                  <div className="mt-2 flex items-center gap-4">
                    <label className="text-xs flex items-center gap-2">
                      <input type="checkbox" checked={!!f.required} onChange={(e)=>{
                        const v = e.target.checked; setFields(prev=>prev.map(x=>x.id===f.id?{...x,required:v}:x));
                      }}/>
                      required
                    </label>
                    {f.type==="rating" && (
                      <>
                        <label className="text-xs">min <input type="number" value={f.min ?? 1} className="w-16 border rounded px-1 ml-1" onChange={e=>{
                          const v = parseInt(e.target.value||"1"); setFields(prev=>prev.map(x=>x.id===f.id?{...x,min:v}:x));
                        }} /></label>
                        <label className="text-xs">max <input type="number" value={f.max ?? 5} className="w-16 border rounded px-1 ml-1" onChange={e=>{
                          const v = parseInt(e.target.value||"5"); setFields(prev=>prev.map(x=>x.id===f.id?{...x,max:v}:x));
                        }} /></label>
                      </>
                    )}
                  </div>
                  {(f.type==="mcq" || f.type==="checkbox") && (
                    <div className="mt-2">
                      <label className="block text-xs">Options (comma separated)</label>
                      <input value={(f.options||[]).join(", ")}
                        onChange={(e)=>{
                          const list = e.target.value.split(",").map(s=>s.trim()).filter(Boolean);
                          setFields(prev=>prev.map(x=>x.id===f.id?{...x,options:list}:x));
                        }}
                        className="w-full border rounded px-2 py-1 bg-transparent"/>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border p-4 bg-white dark:bg-gray-900">
            <h3 className="font-medium">Add Field</h3>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {["text","textarea","mcq","checkbox","rating"].map((t) => (
                <button key={t} onClick={()=>addField(t as any)} className="border rounded px-2 py-1 capitalize">{t}</button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border p-4 bg-white dark:bg-gray-900">
            <h3 className="font-medium">Share</h3>
            <p className="text-sm break-all">{shareURL}</p>
            <a className="text-blue-600 text-sm block mt-1" href={`/f/${id}`} target="_blank">Open public form ↗</a>
            <a className="text-blue-600 text-sm block mt-1" href={`/dashboard/${id}`} target="_blank">Open dashboard ↗</a>
          </div>
        </div>
      </div>
    </main>
  );
}