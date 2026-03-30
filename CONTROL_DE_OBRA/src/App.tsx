import React, { useEffect, useMemo, useState } from 'react';
import { INITIAL_DATA, ProjectData, Task } from './types';
import { GanttChart } from './components/GanttChart';
import { Dashboard } from './components/Dashboard';
import { TaskList } from './components/TaskList';
import { LayoutDashboard, Calendar, ListTodo, Menu, Settings, TrendingUp, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  const [project, setProject] = useState<ProjectData>(INITIAL_DATA);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'gantt' | 'tasks'>('dashboard');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedByCode, setCollapsedByCode] = useState<Record<string, boolean>>({});
  const [chapterVisibility, setChapterVisibility] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [allowOvertime, setAllowOvertime] = useState(false);
  const holidays = useMemo(() => new Set<string>([
    '2026-01-01',
    '2026-03-23',
    '2026-03-27',
    '2026-03-28',
    '2026-03-29',
    '2026-05-01',
    '2026-05-25',
    '2026-06-15',
    '2026-06-22',
    '2026-06-29',
    '2026-07-20',
    '2026-08-07',
    '2026-08-17',
    '2026-10-12',
    '2026-11-02',
    '2026-11-16',
    '2026-12-08',
    '2026-12-25',
  ]), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/project');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ProjectData;
        if (cancelled) return;
        setProject(data);
        setLoadError(null);
        setCollapsedByCode({});
        const nextVisibility: Record<string, boolean> = {};
        for (const t of data.tasks) {
          if (!t.code.includes('.')) nextVisibility[t.code] = true;
        }
        setChapterVisibility(nextVisibility);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setProject(INITIAL_DATA);
        setCollapsedByCode({});
        const nextVisibility: Record<string, boolean> = {};
        for (const t of INITIAL_DATA.tasks) {
          if (!t.code.includes('.')) nextVisibility[t.code] = true;
        }
        setChapterVisibility(nextVisibility);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const chapters = useMemo(() => {
    return project.tasks
      .filter((t) => !t.code.includes('.'))
      .map((t) => ({ code: t.code, name: t.name }));
  }, [project.tasks]);

  const filteredByChapter = useMemo(() => {
    const keys = Object.keys(chapterVisibility);
    if (keys.length === 0) return project.tasks;
    return project.tasks.filter((t) => {
      const top = t.code.split('.')[0]!;
      return chapterVisibility[top] !== false;
    });
  }, [project.tasks, chapterVisibility]);

  const hasChildrenByCode = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const t of filteredByChapter) {
      const parts = t.code.split('.');
      if (parts.length <= 1) continue;
      const parent = parts.slice(0, -1).join('.');
      map[parent] = true;
    }
    return map;
  }, [filteredByChapter]);

  const visibleTasks = useMemo(() => {
    return filteredByChapter.filter((t) => {
      const parts = t.code.split('.');
      if (parts.length <= 1) return true;
      for (let i = 1; i < parts.length; i += 1) {
        const prefix = parts.slice(0, i).join('.');
        if (collapsedByCode[prefix]) return false;
      }
      return true;
    });
  }, [filteredByChapter, collapsedByCode]);

  const toggleChapterVisibility = (code: string) => {
    setChapterVisibility((prev) => ({ ...prev, [code]: !(prev[code] !== false) }));
  };

  const showAllChapters = () => {
    const next: Record<string, boolean> = {};
    for (const c of chapters) next[c.code] = true;
    setChapterVisibility(next);
  };

  const hideAllChapters = () => {
    const next: Record<string, boolean> = {};
    for (const c of chapters) next[c.code] = false;
    setChapterVisibility(next);
  };

  const toggleCollapse = (code: string) => {
    setCollapsedByCode((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const code of Object.keys(hasChildrenByCode)) {
      if (hasChildrenByCode[code]) next[code] = true;
    }
    setCollapsedByCode(next);
  };

  const expandAll = () => {
    setCollapsedByCode({});
  };

  const ChapterFilterBar = () => {
    if (chapters.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mr-1">Capítulos</span>
        <button
          onClick={showAllChapters}
          className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 uppercase tracking-wider shadow-sm hover:bg-zinc-50"
        >
          Todos
        </button>
        <button
          onClick={hideAllChapters}
          className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 uppercase tracking-wider shadow-sm hover:bg-zinc-50"
        >
          Ninguno
        </button>
        {chapters.map((c) => {
          const enabled = chapterVisibility[c.code] !== false;
          return (
            <button
              key={c.code}
              onClick={() => toggleChapterVisibility(c.code)}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shadow-sm",
                enabled
                  ? "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                  : "bg-zinc-100 border-zinc-200 text-zinc-400 hover:bg-zinc-50"
              )}
              title={c.name}
            >
              {c.code}
            </button>
          );
        })}
      </div>
    );
  };

  const handleUpdateProgress = (id: string, progress: number) => {
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, progress: Math.min(100, Math.max(0, progress)) } : t)
    }));
    setIsDirty(true);
  };

  const handleUpdateTask = (id: string, patch: Partial<Task>) => {
    setProject((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
    setIsDirty(true);
  };

  const handleDeleteTask = (id: string) => {
    setProject(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== id)
    }));
    setIsDirty(true);
  };

  const handleAddTask = () => {
    const defaultStartTime = '07:00';
    const defaultEndTime = '17:00';
    const today = new Date().toISOString().split('T')[0]!;
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      code: (project.tasks.length + 1).toString(),
      name: "Nueva Actividad",
      startDate: `${today}T${defaultStartTime}`,
      endDate: `${nextWeek}T${defaultEndTime}`,
      unit: "m2",
      quantity: 1,
      unitPrice: 0,
      budgetedCost: 0,
      actualCost: 0,
      progress: 0,
      category: 'Otros'
    };
    setProject(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask]
    }));
    setIsDirty(true);
  };

  const defaultStartTime = '07:00';
  const defaultEndTime = '17:00';
  const datePart = (iso: string) => iso.slice(0, 10);
  const timePart = (iso: string, isEnd: boolean) => {
    if (iso.includes('T')) return iso.split('T')[1]!.slice(0, 5);
    return isEnd ? defaultEndTime : defaultStartTime;
  };
  const withTime = (iso: string, nextDate: string, isEnd: boolean) => `${nextDate}T${timePart(iso, isEnd)}`;
  const normalizeDateTime = (iso: string, isEnd: boolean) => (iso.includes('T') ? iso.slice(0, 16) : `${iso}T${isEnd ? defaultEndTime : defaultStartTime}`);

  const isHoliday = (iso: string) => holidays.has(datePart(iso));
  const addDaysISO = (isoDate: string, days: number) => {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const weekday = (isoDate: string) => new Date(isoDate + 'T00:00:00').getDay();
  const workingWeightForDay = (iso: string) => {
    const d = datePart(iso);
    if (isHoliday(d)) return 0;
    const wd = weekday(d);
    if (wd === 0) return 0;
    if (wd >= 1 && wd <= 5) return 1;
    if (wd === 6) return 0.6;
    return 0;
  };
  const businessDaysBetween = (startISO: string, endISO: string) => {
    let cur = datePart(startISO);
    const end = datePart(endISO);
    let sum = 0;
    while (cur <= end) {
      sum += workingWeightForDay(cur);
      cur = addDaysISO(cur, 1);
    }
    return sum;
  };
  const addBusinessDays = (startISO: string, days: number) => {
    let remaining = Math.max(0, days);
    let cur = datePart(startISO);
    while (remaining > 0) {
      cur = addDaysISO(cur, 1);
      remaining -= workingWeightForDay(cur);
    }
    return cur;
  };
  const topoOrder = (tasksList: Task[]) => {
    const codes = tasksList.filter(t => !t.isChapter).map(t => t.code);
    const indeg = new Map<string, number>();
    const succ = new Map<string, string[]>();
    for (const c of codes) {
      indeg.set(c, 0);
      succ.set(c, []);
    }
    const byCode = new Map<string, Task>();
    for (const t of tasksList) byCode.set(t.code, t);
    for (const c of codes) {
      const deps = (byCode.get(c)?.dependencies ?? []).filter(d => byCode.has(d));
      indeg.set(c, deps.length);
      for (const d of deps) (succ.get(d) ?? []).push(c);
    }
    const q: string[] = [];
    for (const c of codes) if ((indeg.get(c) ?? 0) === 0) q.push(c);
    const out: string[] = [];
    while (q.length) {
      const n = q.shift()!;
      out.push(n);
      for (const s of succ.get(n) ?? []) {
        const v = (indeg.get(s) ?? 0) - 1;
        indeg.set(s, v);
        if (v === 0) q.push(s);
      }
    }
    return out;
  };
  const computeReplanned = (tasksList: Task[]) => {
    const order = topoOrder(tasksList);
    const nextTasks = tasksList.map((t) => ({ ...t }));
    const nextByCode = new Map<string, Task>();
    for (const t of nextTasks) nextByCode.set(t.code, t);

    for (const code of order) {
      const task = nextByCode.get(code)!;
      const baseDur = Math.max(1, Math.round(businessDaysBetween(task.startDate, task.endDate)));
      let earliestDate = datePart(task.startDate);
      const deps = (task.dependencies ?? []).filter((d) => nextByCode.has(d));
      if (deps.length > 0) {
        const maxEndDate = deps
          .map((d) => datePart(nextByCode.get(d)!.endDate))
          .reduce((a, b) => (a > b ? a : b));
        const minStart = allowOvertime ? maxEndDate : addBusinessDays(maxEndDate, 1);
        if (earliestDate < minStart) earliestDate = minStart;
      }
      const endDate = addBusinessDays(earliestDate, baseDur);
      task.startDate = withTime(task.startDate, earliestDate, false);
      task.endDate = withTime(task.endDate, endDate, true);
    }

    return nextTasks;
  };

  const applyReplan = () => {
    setProject((prev) => ({ ...prev, tasks: computeReplanned(prev.tasks) }));
    setIsDirty(true);
  };

  const handleBulkUpdateDates = (updates: Array<{ code: string; startDate: string; endDate: string }>) => {
    const map = new Map(updates.map((u) => [u.code, u] as const));
    setProject((prev) => {
      const updated = prev.tasks.map((t) => {
        const u = map.get(t.code);
        if (!u) return t;
        return {
          ...t,
          startDate: normalizeDateTime(u.startDate, false),
          endDate: normalizeDateTime(u.endDate, true),
        };
      });
      return { ...prev, tasks: updated };
    });
    setIsDirty(true);
  };

  const handleAddDependency = (fromCode: string, toCode: string) => {
    const wouldCreateCycle = (tasksList: Task[]) => {
      const nodes = tasksList.filter((t) => !t.isChapter).map((t) => t.code);
      const succ = new Map<string, string[]>();
      for (const c of nodes) succ.set(c, []);
      for (const t of tasksList) {
        if (t.isChapter) continue;
        const deps = (t.dependencies ?? []).filter((d) => d.length > 0);
        for (const d of deps) {
          const list = succ.get(d);
          if (list) list.push(t.code);
        }
      }
      const q: string[] = [toCode];
      const seen = new Set<string>();
      while (q.length > 0) {
        const cur = q.shift()!;
        if (cur === fromCode) return true;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const s of succ.get(cur) ?? []) q.push(s);
      }
      return false;
    };

    if (wouldCreateCycle(project.tasks)) {
      window.alert('No se puede crear una dependencia circular.');
      return;
    }

    setProject((prev) => {
      const updated = prev.tasks.map((t) => {
        if (t.code !== toCode) return t;
        const nextDeps = Array.from(new Set([...(t.dependencies ?? []), fromCode]));
        return { ...t, dependencies: nextDeps };
      });
      return { ...prev, tasks: updated };
    });
    setIsDirty(true);
  };

  const getDragSet = (root: { code: string; isChapter?: boolean }) => {
    const prefix = root.isChapter ? `${root.code}.` : null;
    const affected = prefix
      ? project.tasks.filter((x) => x.code === root.code || x.code.startsWith(prefix))
      : project.tasks.filter((x) => x.code === root.code);
    return affected.map((x) => ({ code: x.code, startDate: x.startDate, endDate: x.endDate }));
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setSaveError(null);
      setSaveOk(false);
      const body = JSON.stringify({ projectName: project.projectName, tasks: project.tasks });
      const res = await fetch('/api/project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as { ok?: boolean; saved?: number };
      if (!payload.ok) throw new Error('Respuesta inválida del servidor');
      setIsDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 1500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen bg-[#F8F9FA] flex text-zinc-900 font-sans overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen ? (
        <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col sticky top-0 h-screen">
          <div className="p-6 flex items-center gap-3 border-b border-zinc-100">
            <div className="w-10 h-10 flex items-center justify-center overflow-hidden rounded-lg">
              <img 
                src="https://i.postimg.cc/pXzrgTgR/iso-solo-negro.png" 
                alt="Logo FNA" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Control de Obra</h1>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Gestión de Proyectos</p>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                activeTab === 'dashboard' ? "bg-zinc-900 text-white shadow-md shadow-zinc-200" : "text-zinc-500 hover:bg-zinc-50"
              )}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('gantt')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                activeTab === 'gantt' ? "bg-zinc-900 text-white shadow-md shadow-zinc-200" : "text-zinc-500 hover:bg-zinc-50"
              )}
            >
              <Calendar size={18} />
              Gantt Chart
            </button>
            <button 
              onClick={() => setActiveTab('tasks')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                activeTab === 'tasks' ? "bg-zinc-900 text-white shadow-md shadow-zinc-200" : "text-zinc-500 hover:bg-zinc-50"
              )}
            >
              <ListTodo size={18} />
              Actividades
            </button>
          </nav>

          <div className="p-4 border-t border-zinc-100">
            <div className="bg-zinc-50 p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Estado Obra</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                El proyecto presenta un avance del{' '}
                <span className="font-bold text-zinc-900">
                  {(project.tasks.length > 0
                    ? project.tasks.reduce((acc, t) => acc + t.progress, 0) / project.tasks.length
                    : 0
                  ).toFixed(1)}%
                </span>.
              </p>
            </div>
          </div>
        </aside>
      ) : null}

      {/* Main Content */}
      <main className="flex-1 p-6 w-full overflow-hidden flex flex-col">
        <header className="flex justify-between items-end mb-10">
          <div className="flex items-start gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2.5 bg-white border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm"
              title={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
            >
              <Menu size={20} />
            </button>
            <div>
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">Proyecto Activo</p>
              <h2 className="text-4xl font-light tracking-tight text-zinc-900">{project.projectName}</h2>
              {loadError ? (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
                  No se pudo cargar ITEMS_OBRA.json (usando datos de ejemplo). {loadError}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Fecha Actual</p>
              <p className="text-sm font-medium">{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <button
              onClick={handleSaveAll}
              disabled={!isDirty || saving}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm border",
                !isDirty || saving
                  ? "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed"
                  : "bg-zinc-900 border-zinc-900 text-white hover:bg-zinc-800"
              )}
              title="Guardar cambios en ITEMS_OBRA.json"
            >
              <Save size={16} />
              Guardar cambios
            </button>
            {saveOk ? (
              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                Guardado
              </span>
            ) : null}
            {saveError ? (
              <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold uppercase tracking-widest max-w-[280px] truncate" title={saveError}>
                Error: {saveError}
              </span>
            ) : null}
            <button
              onClick={collapseAll}
              className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm"
              title="Recoger toda la estructura"
            >
              Recoger
            </button>
            <button
              onClick={expandAll}
              className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm"
              title="Expandir toda la estructura"
            >
              Expandir
            </button>
            <button className="p-2.5 bg-white border border-zinc-200 rounded-xl text-zinc-500 hover:bg-zinc-50 transition-colors shadow-sm">
              <Settings size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'dashboard' ? (
                <div className="h-full overflow-y-auto pr-1">
                  <Dashboard tasks={project.tasks} />
                </div>
              ) : null}

              {activeTab === 'gantt' ? (
                <div className="h-full flex flex-col min-h-0 gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-light text-zinc-800 tracking-tight">Cronograma de Obra</h3>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        {['Preliminares', 'Estructura', 'Instalaciones', 'Otros'].map(cat => (
                          <div key={cat} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-zinc-100 rounded-lg text-[10px] font-bold text-zinc-500 uppercase tracking-wider shadow-sm">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              cat === 'Estructura' ? "bg-blue-500" : 
                              cat === 'Preliminares' ? "bg-emerald-500" :
                              cat === 'Instalaciones' ? "bg-orange-500" : "bg-indigo-500"
                            )} />
                            {cat}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setPlanOpen((v) => !v)}
                        className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm"
                        title="Editar fechas y duración"
                      >
                        Editar plan
                      </button>
                    </div>
                  </div>
                  <ChapterFilterBar />
                  <div className="flex-1 min-h-0 relative overflow-hidden">
                    <GanttChart
                      tasks={visibleTasks}
                      collapsedByCode={collapsedByCode}
                      hasChildrenByCode={hasChildrenByCode}
                      onToggleCollapse={toggleCollapse}
                      onCollapseAll={collapseAll}
                      onExpandAll={expandAll}
                      getDragSet={getDragSet}
                      onBulkUpdateDates={handleBulkUpdateDates}
                      onAddDependency={handleAddDependency}
                    />
                    <div
                      className={cn(
                        "absolute left-3 right-3 bottom-3 z-40 bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden transition-transform duration-200",
                        planOpen ? "translate-y-0" : "translate-y-[110%]"
                      )}
                    >
                      <div className="p-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Editor de Plan</span>
                          <label className="flex items-center gap-2 text-xs text-zinc-700">
                            <input
                              type="checkbox"
                              checked={allowOvertime}
                              onChange={(e) => setAllowOvertime(e.target.checked)}
                              className="accent-zinc-900"
                            />
                            Permitir horas extra
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={applyReplan}
                            className="px-3 py-2 bg-zinc-900 rounded-lg text-xs font-semibold text-white hover:bg-zinc-800"
                          >
                            Aplicar reprogramación
                          </button>
                          <button
                            onClick={() => setPlanOpen(false)}
                            className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                          >
                            Ocultar
                          </button>
                        </div>
                      </div>
                      <div className="max-h-[40vh] overflow-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white">
                            <tr className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold border-b border-zinc-100">
                              <th className="px-4 py-3">Código</th>
                              <th className="px-4 py-3">Actividad</th>
                              <th className="px-4 py-3">Inicio</th>
                              <th className="px-4 py-3">Fin</th>
                              <th className="px-4 py-3 text-right">Duración (días laborables)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-50">
                            {visibleTasks.filter(t => !t.isChapter).map(t => {
                              const defaultDur = Math.max(1, Math.round(businessDaysBetween(t.startDate, t.endDate)));
                              return (
                                <tr key={`plan-${t.code}`} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2 text-[11px] font-mono text-zinc-500">{t.code}</td>
                                  <td className="px-4 py-2 text-sm text-zinc-800 truncate">{t.name}</td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="datetime-local"
                                      value={normalizeDateTime(t.startDate, false)}
                                      onChange={(e) => {
                                        const newStart = normalizeDateTime(e.target.value, false);
                                        setProject((prev) => {
                                          const updated = prev.tasks.map((x) => {
                                            if (x.code !== t.code) return x;
                                            const dur = Math.max(1, Math.round(businessDaysBetween(x.startDate, x.endDate)));
                                            return { ...x, startDate: newStart, endDate: withTime(x.endDate, addBusinessDays(newStart, dur), true) };
                                          });
                                          return { ...prev, tasks: updated };
                                        });
                                        setIsDirty(true);
                                      }}
                                      className="px-2 py-1 border border-zinc-200 rounded-lg text-sm"
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="datetime-local"
                                      value={normalizeDateTime(t.endDate, true)}
                                      onChange={(e) => {
                                        const newEnd = normalizeDateTime(e.target.value, true);
                                        setProject((prev) => {
                                          const updated = prev.tasks.map((x) => (x.code === t.code ? { ...x, endDate: newEnd } : x));
                                          return { ...prev, tasks: updated };
                                        });
                                        setIsDirty(true);
                                      }}
                                      className="px-2 py-1 border border-zinc-200 rounded-lg text-sm"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <input
                                      type="number"
                                      min={1}
                                      value={defaultDur}
                                      onChange={(e) => {
                                        const dur = Math.max(1, Number.parseInt(e.target.value, 10) || 1);
                                        setProject((prev) => {
                                          const updated = prev.tasks.map((x) => {
                                            if (x.code !== t.code) return x;
                                            return { ...x, endDate: withTime(x.endDate, addBusinessDays(x.startDate, dur), true) };
                                          });
                                          return { ...prev, tasks: updated };
                                        });
                                        setIsDirty(true);
                                      }}
                                      className="w-24 px-2 py-1 border border-zinc-200 rounded-lg text-sm text-right"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === 'tasks' ? (
                <div className="h-full overflow-y-auto pr-1 space-y-4">
                  <ChapterFilterBar />
                  <TaskList 
                    tasks={visibleTasks} 
                    onAddTask={handleAddTask}
                    onDeleteTask={handleDeleteTask}
                    onUpdateProgress={handleUpdateProgress}
                    onUpdateTask={handleUpdateTask}
                    collapsedByCode={collapsedByCode}
                    hasChildrenByCode={hasChildrenByCode}
                    onToggleCollapse={toggleCollapse}
                  />
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
