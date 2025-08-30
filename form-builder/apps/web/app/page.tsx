"use client";

import { apiPost } from "@/lib/api";
import { useState } from "react";

export default function HomePage() {
  const [creating, setCreating] = useState(false);

  async function createForm() {
    setCreating(true);
    try {
      const res = await apiPost("/forms", {
        title: "Untitled Form",
        description: "Edit me in the builder",
        fields: [
          { id: "q1", type: "mcq", label: "How satisfied are you?", required: true, options: ["Very", "Somewhat", "Not at all"] },
          { id: "rating", type: "rating", label: "Rate us", min: 1, max: 5, required: true }
        ]
      });
      window.location.href = `/builder/${res._id}`;
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <div className="rounded-2xl p-10 border bg-white dark:bg-gray-900">
        <h1 className="text-2xl font-semibold mb-2">Custom Form Builder with Live Analytics</h1>
        <p className="text-gray-600 dark:text-gray-300">Create forms, collect responses, and see live dashboards.</p>
        <div className="mt-6">
          <button
            onClick={createForm}
            disabled={creating}
            className="px-4 py-2 bg-black text-white rounded-md disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Form"}
          </button>
        </div>
        <div className="mt-6 text-sm">
          <p>Already have an ID? Try:</p>
          <ul className="list-disc pl-5">
            <li><code>/builder/&lt;id&gt;</code> – build & publish</li>
            <li><code>/f/&lt;id&gt;</code> – public form</li>
            <li><code>/dashboard/&lt;id&gt;</code> – live analytics</li>
          </ul>
        </div>
      </div>
    </main>
  );
}