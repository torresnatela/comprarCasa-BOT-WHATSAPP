"use client";

import { type FormEvent, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { dueStatus, formatDate, todayISO } from "@/lib/format";
import type { PublicTask } from "@/server/controllers/presenters";
import { Alert, Button, TextField } from "./ui";

type Props = {
  leadId: string;
  tasks: PublicTask[];
  onChange: (tasks: PublicTask[]) => void;
};

const dueStyles = {
  vencida: "text-red-700 font-medium",
  hoje: "text-amber-800 font-medium",
  futura: "text-gray-500",
};

/** Tarefas (lembretes com data) de um contato. */
export function LeadTasks({ leadId, tasks, onChange }: Props) {
  const base = `/api/leads/${encodeURIComponent(leadId)}/tarefas`;
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayISO);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFields({});
    setError(null);
    try {
      const { task } = await api<{ task: PublicTask }>(base, {
        method: "POST",
        body: { title, dueDate },
      });
      onChange([...tasks, task]);
      setTitle("");
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0) {
        setFields(caught.fields);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setSaving(false);
    }
  }

  const toggle = (task: PublicTask) =>
    run(async () => {
      const { task: updated } = await api<{ task: PublicTask }>(`${base}/${task.id}`, {
        method: "PATCH",
        body: { done: !task.done },
      });
      onChange(tasks.map((item) => (item.id === updated.id ? updated : item)));
    });

  const remove = (task: PublicTask) =>
    run(async () => {
      await api(`${base}/${task.id}`, { method: "DELETE" });
      onChange(tasks.filter((item) => item.id !== task.id));
    });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Tarefas</h3>
      {error && <Alert>{error}</Alert>}
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma tarefa.</p>
      ) : (
        <ul aria-label="Tarefas" className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="group flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => void toggle(task)}
                aria-label={`Concluir: ${task.title}`}
                className="mt-0.5 size-4 accent-brand-600"
              />
              <div className="min-w-0 flex-1">
                <p className={task.done ? "text-gray-400 line-through" : "text-gray-900"}>
                  {task.title}
                </p>
                <p
                  className={`text-xs ${task.done ? "text-gray-400" : dueStyles[dueStatus(task.dueDate)]}`}
                >
                  {formatDate(task.dueDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(task)}
                aria-label={`Excluir: ${task.title}`}
                className="rounded px-1 text-gray-400 hover:bg-red-50 hover:text-red-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="space-y-2" noValidate>
        <TextField
          label="Nova tarefa"
          placeholder="Ex.: Ligar para agendar visita"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={fields.title}
        />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="Data"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              error={fields.dueDate}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={saving || !title.trim()}>
            Adicionar
          </Button>
        </div>
      </form>
    </div>
  );
}
