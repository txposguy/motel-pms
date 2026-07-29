"use client";

import { useActionState, useEffect, useState } from "react";
import {
  completeTaskAction,
  logoutAction,
  reportProblemAction,
  startTaskAction,
  type HousekeeperActionState,
} from "./actions";

type Task = {
  id: string;
  type: string;
  status: string;
  roomNumber: string;
  roomTypeName: string;
  notes: string | null;
};

type Lang = "en" | "es";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    title: "My Rooms",
    noTasks: "No rooms assigned right now.",
    start: "START",
    done: "DONE",
    problem: "PROBLEM",
    logout: "Log Out",
    problemPrompt: "What's wrong?",
    submit: "Submit",
    cancel: "Cancel",
    pending: "Not started",
    inProgress: "In progress",
    finished: "Done",
  },
  es: {
    title: "Mis Habitaciones",
    noTasks: "No hay habitaciones asignadas.",
    start: "EMPEZAR",
    done: "LISTO",
    problem: "PROBLEMA",
    logout: "Cerrar Sesión",
    problemPrompt: "¿Qué pasó?",
    submit: "Enviar",
    cancel: "Cancelar",
    pending: "Sin empezar",
    inProgress: "En progreso",
    finished: "Listo",
  },
};

const TASK_TYPE_LABELS: Record<Lang, Record<string, string>> = {
  en: { departure_clean: "Departure Clean", stayover: "Stayover", deep_clean: "Deep Clean", inspection: "Inspection" },
  es: { departure_clean: "Limpieza de Salida", stayover: "Habitación Ocupada", deep_clean: "Limpieza Profunda", inspection: "Inspección" },
};

const initialState: HousekeeperActionState = {};

function TaskCard({ task, propertyId, t, typeLabels }: { task: Task; propertyId: string; t: Record<string, string>; typeLabels: Record<string, string> }) {
  const [startState, startFormAction, startPending] = useActionState(startTaskAction, initialState);
  const [completeState, completeFormAction, completePending] = useActionState(completeTaskAction, initialState);
  const [problemState, problemFormAction, problemPending] = useActionState(reportProblemAction, initialState);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    // Closes the report form after a successful submission, not a sync
    // with an external system.
    if (!problemState.error && !problemPending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReporting(false);
    }
  }, [problemState, problemPending]);

  const error = startState.error || completeState.error || problemState.error;

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
      <div className="text-5xl font-bold">{task.roomNumber}</div>
      <div className="mt-1 text-lg text-gray-400">{typeLabels[task.type] ?? task.type}</div>
      <div className="mt-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {task.status === "pending" ? t.pending : task.status === "in_progress" ? t.inProgress : t.finished}
      </div>
      {task.notes?.startsWith("PROBLEM:") && (
        <div className="mt-2 rounded bg-red-950 px-3 py-2 text-sm font-semibold text-red-300">⚠ {task.notes.replace("PROBLEM: ", "")}</div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <form action={startFormAction}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="taskId" value={task.id} />
          <button
            type="submit"
            disabled={task.status !== "pending" || startPending}
            className="h-20 w-full rounded-xl bg-blue-600 text-lg font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
          >
            {t.start}
          </button>
        </form>
        <form action={completeFormAction}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="taskId" value={task.id} />
          <button
            type="submit"
            disabled={task.status !== "in_progress" || completePending}
            className="h-20 w-full rounded-xl bg-green-600 text-lg font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
          >
            {t.done}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setReporting((v) => !v)}
          className="h-20 w-full rounded-xl bg-red-700 text-lg font-bold text-white active:bg-red-800"
        >
          {t.problem}
        </button>
      </div>

      {reporting && (
        <form action={problemFormAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="taskId" value={task.id} />
          <textarea
            name="note"
            placeholder={t.problemPrompt}
            required
            className="rounded-lg border border-gray-600 bg-gray-800 p-3 text-base text-white"
            rows={2}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={problemPending} className="flex-1 rounded-lg bg-red-700 py-3 font-bold text-white">
              {t.submit}
            </button>
            <button type="button" onClick={() => setReporting(false)} className="flex-1 rounded-lg bg-gray-700 py-3 font-bold text-white">
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-red-400">{error}</p>}
    </div>
  );
}

export function TaskList({ propertyId, housekeeperName, tasks }: { propertyId: string; housekeeperName: string; tasks: Task[] }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    // Mount-only client read, not a sync — localStorage isn't available
    // during SSR, so this can't run during the initial render without
    // causing a hydration mismatch (same fix as CheckInForm's clock read).
    const stored = window.localStorage.getItem("hk_lang");
    if (stored === "en" || stored === "es") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLang(stored);
    }
  }, []);

  function toggleLang() {
    const next = lang === "en" ? "es" : "en";
    setLang(next);
    window.localStorage.setItem("hk_lang", next);
  }

  const t = STRINGS[lang];

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t.title}</h1>
          <p className="text-sm text-gray-400">{housekeeperName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleLang} className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-bold">
            {lang === "en" ? "ES" : "EN"}
          </button>
          <form action={logoutAction}>
            <button type="submit" className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-bold">
              {t.logout}
            </button>
          </form>
        </div>
      </div>

      {tasks.length === 0 && <p className="mt-12 text-center text-gray-500">{t.noTasks}</p>}

      <div className="flex flex-col gap-4">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} propertyId={propertyId} t={t} typeLabels={TASK_TYPE_LABELS[lang]} />
        ))}
      </div>
    </main>
  );
}
