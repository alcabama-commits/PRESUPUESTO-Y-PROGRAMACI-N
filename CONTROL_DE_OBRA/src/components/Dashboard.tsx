import React, { useMemo } from 'react';
import { differenceInCalendarDays, format, isAfter, isBefore, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Task } from '../types';
import { cn } from '../lib/utils';

interface DashboardProps {
  tasks: Task[];
}

export const Dashboard: React.FC<DashboardProps> = ({ tasks }) => {
  const costTasks = useMemo(() => tasks.filter((t) => !t.isChapter), [tasks]);

  const totalBudget = costTasks.reduce((acc, t) => acc + t.budgetedCost, 0);
  const totalActual = costTasks.reduce((acc, t) => acc + t.actualCost, 0);
  const averageProgress = costTasks.length > 0 ? costTasks.reduce((acc, t) => acc + t.progress, 0) / costTasks.length : 0;
  const budgetRatio = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

  const sortedByStartDate = useMemo(() => {
    return [...costTasks].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [costTasks]);

  const timeSummary = useMemo(() => {
    if (tasks.length === 0) return null;
    const parsed = tasks
      .map((t) => ({ s: parseISO(t.startDate), e: parseISO(t.endDate) }))
      .filter((p) => Number.isFinite(p.s.getTime()) && Number.isFinite(p.e.getTime()));
    if (parsed.length === 0) return null;
    const start = new Date(Math.min(...parsed.map((p) => p.s.getTime())));
    const end = new Date(Math.max(...parsed.map((p) => p.e.getTime())));
    const durationDays = Math.max(0, differenceInCalendarDays(end, start) + 1);
    const today = new Date();
    const started = !isBefore(today, start);
    const finished = isAfter(today, end);
    const elapsedDays = started ? Math.min(durationDays, Math.max(0, differenceInCalendarDays(today, start) + 1)) : 0;
    const remainingDays = finished ? 0 : Math.max(0, durationDays - elapsedDays);
    const progressTime = durationDays > 0 ? (elapsedDays / durationDays) * 100 : 0;

    return {
      start,
      end,
      durationDays,
      elapsedDays,
      remainingDays,
      progressTime,
    };
  }, [tasks]);

  const chapterMilestones = useMemo(() => {
    const chapters = tasks
      .filter((t) => t.isChapter && !t.code.includes('.'))
      .map((t) => ({
        code: t.code,
        name: t.name,
        start: parseISO(t.startDate),
        end: parseISO(t.endDate),
        progress: t.progress,
      }))
      .filter((c) => Number.isFinite(c.start.getTime()) && Number.isFinite(c.end.getTime()))
      .sort((a, b) => a.end.getTime() - b.end.getTime());

    const today = new Date();
    const upcoming = chapters.filter((c) => !isAfter(today, c.end));
    const next = upcoming[0] ?? null;
    return { chapters, next };
  }, [tasks]);

  const categoryData = useMemo(() => {
    const cats: Record<string, { budgeted: number, actual: number }> = {};
    costTasks.forEach(t => {
      if (!cats[t.category]) cats[t.category] = { budgeted: 0, actual: 0 };
      cats[t.category].budgeted += t.budgetedCost;
      cats[t.category].actual += t.actualCost;
    });
    return Object.entries(cats).map(([name, data]) => ({ name, ...data }));
  }, [costTasks]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Presupuesto Total</p>
          <h3 className="text-3xl font-light text-zinc-900">${totalBudget.toLocaleString()}</h3>
          <div className="mt-4 h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${budgetRatio}%` }} />
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">
            Invertido: ${totalActual.toLocaleString()} ({budgetRatio.toFixed(1)}%)
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Progreso General</p>
          <h3 className="text-3xl font-light text-zinc-900">{averageProgress.toFixed(1)}%</h3>
          <div className="mt-4 h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${averageProgress}%` }} />
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">Basado en {costTasks.length} actividades</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Eficiencia de Costos</p>
          <h3 className="text-3xl font-light text-zinc-900">
            {totalActual > 0 ? (totalBudget / totalActual).toFixed(2) : '1.00'}
          </h3>
          <div className="mt-4 flex items-center gap-2">
            <span className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
              totalActual <= totalBudget ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            )}>
              {totalActual <= totalBudget ? 'Bajo Presupuesto' : 'Sobre Presupuesto'}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Tiempos de Obra</p>
          {timeSummary ? (
            <>
              <h3 className="text-3xl font-light text-zinc-900">{timeSummary.durationDays} días</h3>
              <div className="mt-4 h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-900" style={{ width: `${timeSummary.progressTime}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
                <div className="bg-zinc-50 rounded-lg p-2 border border-zinc-100">
                  <p className="font-bold uppercase tracking-widest text-zinc-400">Inicio</p>
                  <p className="text-zinc-700 font-semibold">{format(timeSummary.start, 'd MMM yyyy', { locale: es })}</p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-2 border border-zinc-100">
                  <p className="font-bold uppercase tracking-widest text-zinc-400">Fin</p>
                  <p className="text-zinc-700 font-semibold">{format(timeSummary.end, 'd MMM yyyy', { locale: es })}</p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-2 border border-zinc-100">
                  <p className="font-bold uppercase tracking-widest text-zinc-400">Transcurrido</p>
                  <p className="text-zinc-700 font-semibold">{timeSummary.elapsedDays} días</p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-2 border border-zinc-100">
                  <p className="font-bold uppercase tracking-widest text-zinc-400">Restante</p>
                  <p className="text-zinc-700 font-semibold">{timeSummary.remainingDays} días</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-400 mt-2">Sin fechas suficientes para calcular.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Hitos del Proyecto</p>
            <p className="text-[11px] text-zinc-400">Capítulos generales</p>
          </div>
          {chapterMilestones.next ? (
            <div className="text-right">
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Próximo</p>
              <p className="text-xs font-semibold text-zinc-800">
                {chapterMilestones.next.code} — {format(chapterMilestones.next.end, 'd MMM yyyy', { locale: es })}
              </p>
            </div>
          ) : (
            <div className="text-right">
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Próximo</p>
              <p className="text-xs font-semibold text-zinc-500">N/A</p>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white text-[10px] uppercase tracking-widest text-zinc-500 font-bold border-b border-zinc-100">
                <th className="px-4 py-3">Capítulo</th>
                <th className="px-4 py-3">Inicio</th>
                <th className="px-4 py-3">Fin</th>
                <th className="px-4 py-3 text-right">Duración</th>
                <th className="px-4 py-3 text-right">Días restantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {chapterMilestones.chapters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-sm text-zinc-400">
                    No hay capítulos con fechas.
                  </td>
                </tr>
              ) : (
                chapterMilestones.chapters.map((c) => {
                  const duration = Math.max(0, differenceInCalendarDays(c.end, c.start) + 1);
                  const today = new Date();
                  const remaining = isAfter(today, c.end) ? 0 : Math.max(0, differenceInCalendarDays(c.end, today));
                  const status =
                    c.progress >= 100
                      ? { label: 'Completado', cls: 'bg-emerald-100 text-emerald-700' }
                      : remaining === 0
                        ? { label: 'Vence hoy', cls: 'bg-amber-100 text-amber-800' }
                        : { label: 'En curso', cls: 'bg-zinc-100 text-zinc-700' };
                  return (
                    <tr key={c.code} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-[11px] font-mono text-zinc-500">{c.code}</span>
                          <span className="text-sm font-semibold text-zinc-800 truncate">{c.name}</span>
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", status.cls)}>
                            {status.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">{format(c.start, 'd MMM yyyy', { locale: es })}</td>
                      <td className="px-4 py-3 text-sm text-zinc-600">{format(c.end, 'd MMM yyyy', { locale: es })}</td>
                      <td className="px-4 py-3 text-sm text-zinc-700 text-right font-mono">{duration}</td>
                      <td className="px-4 py-3 text-sm text-zinc-700 text-right font-mono">{remaining}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white p-6 rounded-xl border border-zinc-200 shadow-sm h-[350px]">
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">Inversión por Categoría</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                cursor={{ fill: '#f8f8f8' }}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 20 }} />
              <Bar dataKey="budgeted" name="Presupuestado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Real" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm h-[350px]">
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">Curva de Inversión</p>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sortedByStartDate}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" hide />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
              <Tooltip />
              <Line type="monotone" dataKey="budgetedCost" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="actualCost" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
