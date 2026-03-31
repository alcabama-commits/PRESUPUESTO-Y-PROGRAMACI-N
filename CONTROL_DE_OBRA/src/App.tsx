import React, { useEffect, useMemo, useState } from 'react';
import { INITIAL_DATA, ProjectData, Task } from './types';
import { GanttChart } from './components/GanttChart';
import { Dashboard } from './components/Dashboard';
import { TaskList } from './components/TaskList';
import { LayoutDashboard, Calendar, ListTodo, Menu, Settings, TrendingUp, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

type ItemsObraSubItem = {
  concepto: string;
  unidad: string;
  unit?: string;
  detalle: string;
  quantity?: number;
  unitPrice?: number;
  budgetedCost?: number;
  actualCost?: number;
  startDate?: string;
  endDate?: string;
  progress?: number;
  dependencies?: string[];
  isMilestone?: boolean;
};

type ItemsObraItem = {
  id: string;
  descripcion: string;
  sub_items?: ItemsObraSubItem[];
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  budgetedCost?: number;
  actualCost?: number;
  startDate?: string;
  endDate?: string;
  progress?: number;
  dependencies?: string[];
  isMilestone?: boolean;
};

type ItemsObraCapitulo = {
  nombre: string;
  items: ItemsObraItem[];
  startDate?: string;
  endDate?: string;
  progress?: number;
  dependencies?: string[];
  isMilestone?: boolean;
};

type ItemsObraTaskMeta = {
  startDate?: string;
  endDate?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  budgetedCost?: number;
  actualCost?: number;
  progress?: number;
  dependencies?: string[];
  isMilestone?: boolean;
};

type ItemsObraRootLocal = {
  presupuesto_obra_bogota?: Record<string, ItemsObraCapitulo>;
  meta?: Record<string, ItemsObraTaskMeta>;
};

const DEFAULT_START_TIME = '07:00';
const DEFAULT_END_TIME = '17:00';

const asISODate = (date: Date) => date.toISOString().slice(0, 10);

const ensureTime = (iso: string | undefined, isEnd: boolean) => {
  if (!iso) return undefined;
  if (iso.includes('T')) return iso;
  return `${iso}T${isEnd ? DEFAULT_END_TIME : DEFAULT_START_TIME}`;
};

const addDays = (base: Date, days: number) => new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const inferCategoryFromChapterName = (chapterName: string): Task['category'] => {
  const n = normalizeText(chapterName);
  if (n.includes('prelim')) return 'Preliminares';
  if (n.includes('ciment') || n.includes('estruct') || n.includes('acero')) return 'Estructura';
  if (n.includes('instal') || n.includes('electr') || n.includes('hidro') || n.includes('gas')) return 'Instalaciones';
  if (n.includes('acab') || n.includes('mampost') || n.includes('panet') || n.includes('pintur')) return 'Acabados';
  return 'Otros';
};

const parseChapterNumber = (chapterKey: string) => {
  const match = chapterKey.match(/capitulo_(\d+)/i);
  if (!match) return Number.NaN;
  return Number.parseInt(match[1], 10);
};

const inferChapterCode = (chapterKey: string, chapter: ItemsObraCapitulo) => {
  const fromKey = parseChapterNumber(chapterKey);

  const counts: Record<string, number> = {};
  for (const item of chapter.items ?? []) {
    const prefix = item.id?.split('.')?.[0];
    if (!prefix) continue;
    if (!/^\d+$/.test(prefix)) continue;
    counts[prefix] = (counts[prefix] ?? 0) + 1;
  }

  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best && (!Number.isFinite(fromKey) || best !== String(fromKey))) return best;
  if (Number.isFinite(fromKey)) return String(fromKey);
  return chapterKey;
};

const minISO = (a: string | null, b: string) => {
  if (!a) return b;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da)) return b;
  if (!Number.isFinite(db)) return a;
  return da <= db ? a : b;
};

const maxISO = (a: string | null, b: string) => {
  if (!a) return b;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da)) return b;
  if (!Number.isFinite(db)) return a;
  return da >= db ? a : b;
};

const buildProjectFromItemsObraLocal = (itemsObra: ItemsObraRootLocal): ProjectData => {
  const base = new Date();
  const baseDate = asISODate(base);

  const presupuesto = itemsObra.presupuesto_obra_bogota ?? {};
  const meta = itemsObra.meta ?? {};
  const chapterEntries = Object.entries(presupuesto).sort(([a], [b]) => {
    const na = parseChapterNumber(a);
    const nb = parseChapterNumber(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const tasks: Task[] = [];
  let dayOffset = 0;
  const usedChapterCodes = new Set<string>();

  for (const [chapterKey, chapter] of chapterEntries) {
    let chapterCode = inferChapterCode(chapterKey, chapter);
    if (usedChapterCodes.has(chapterCode)) chapterCode = `${chapterCode}_${chapterKey}`;
    usedChapterCodes.add(chapterCode);

    const category = inferCategoryFromChapterName(chapter.nombre ?? chapterKey);
    const chapterIndex = tasks.length;
    const legacyChapterCode = Number.isFinite(parseChapterNumber(chapterKey)) ? String(parseChapterNumber(chapterKey)) : null;
    const mChapter = meta[chapterCode] ?? (legacyChapterCode ? meta[legacyChapterCode] : undefined) ?? {};

    tasks.push({
      id: chapterCode,
      code: chapterCode,
      name: (chapter.nombre ?? chapterKey).toUpperCase(),
      startDate: ensureTime(chapter.startDate ?? mChapter.startDate, false) ?? `${baseDate}T${DEFAULT_START_TIME}`,
      endDate: ensureTime(chapter.endDate ?? mChapter.endDate, true) ?? `${baseDate}T${DEFAULT_END_TIME}`,
      unit: 'GLB',
      quantity: 1,
      unitPrice: 0,
      budgetedCost: 0,
      actualCost: 0,
      progress: mChapter.progress ?? 0,
      category,
      dependencies: chapter.dependencies ?? mChapter.dependencies,
      isMilestone: chapter.isMilestone ?? mChapter.isMilestone ?? false,
      isChapter: true,
    });

    const chapterStartOffset = dayOffset;
    let chapterMinStart: string | null = null;
    let chapterMaxEnd: string | null = null;
    let chapterBudgetSum = 0;
    let chapterActualSum = 0;

    for (const item of chapter.items ?? []) {
      const subItems = item.sub_items ?? [];

      if (subItems.length === 0) {
        const start = `${asISODate(addDays(base, dayOffset))}T${DEFAULT_START_TIME}`;
        const end = `${asISODate(addDays(base, dayOffset))}T${DEFAULT_END_TIME}`;
        const mItem = meta[item.id] ?? {};
        const quantity = Number(item.quantity ?? mItem.quantity ?? 0) || 0;
        const unitPrice = Number(item.unitPrice ?? mItem.unitPrice ?? 0) || 0;
        const budgetedCost = Number(item.budgetedCost ?? mItem.budgetedCost ?? quantity * unitPrice) || 0;
        const actualCost = Number(item.actualCost ?? mItem.actualCost ?? 0) || 0;
        const startDate = ensureTime(item.startDate ?? mItem.startDate, false) ?? start;
        const endDate = ensureTime(item.endDate ?? mItem.endDate, true) ?? end;
        tasks.push({
          id: item.id,
          code: item.id,
          name: item.descripcion ?? item.id,
          startDate,
          endDate,
          unit: item.unit ?? 'GLB',
          quantity,
          unitPrice,
          budgetedCost,
          actualCost,
          progress: mItem.progress ?? 0,
          category,
          dependencies: item.dependencies ?? mItem.dependencies,
          isMilestone: item.isMilestone ?? mItem.isMilestone ?? false,
        });
        chapterMinStart = minISO(chapterMinStart, startDate);
        chapterMaxEnd = maxISO(chapterMaxEnd, endDate);
        chapterBudgetSum += budgetedCost;
        chapterActualSum += actualCost;
        dayOffset += 1;
        continue;
      }

      const itemIndex = tasks.length;
      const mItem = meta[item.id] ?? {};
      tasks.push({
        id: item.id,
        code: item.id,
        name: item.descripcion ?? item.id,
        startDate: ensureTime(item.startDate ?? mItem.startDate, false) ?? `${baseDate}T${DEFAULT_START_TIME}`,
        endDate: ensureTime(item.endDate ?? mItem.endDate, true) ?? `${baseDate}T${DEFAULT_END_TIME}`,
        unit: 'GLB',
        quantity: 1,
        unitPrice: 0,
        budgetedCost: 0,
        actualCost: 0,
        progress: mItem.progress ?? 0,
        category,
        dependencies: item.dependencies ?? mItem.dependencies,
        isMilestone: item.isMilestone ?? mItem.isMilestone ?? false,
        isChapter: true,
      });

      const itemStartOffset = dayOffset;
      let itemMinStart: string | null = null;
      let itemMaxEnd: string | null = null;
      let itemBudgetSum = 0;
      let itemActualSum = 0;

      for (let i = 0; i < subItems.length; i += 1) {
        const sub = subItems[i]!;
        const start = `${asISODate(addDays(base, dayOffset))}T${DEFAULT_START_TIME}`;
        const end = `${asISODate(addDays(base, dayOffset))}T${DEFAULT_END_TIME}`;
        const code = `${item.id}.${i + 1}`;
        const mSub = meta[code] ?? {};
        const quantity = Number(sub.quantity ?? mSub.quantity ?? 0) || 0;
        const unitPrice = Number(sub.unitPrice ?? mSub.unitPrice ?? 0) || 0;
        const budgetedCost = Number(sub.budgetedCost ?? mSub.budgetedCost ?? quantity * unitPrice) || 0;
        const actualCost = Number(sub.actualCost ?? mSub.actualCost ?? 0) || 0;
        const startDate = ensureTime(sub.startDate ?? mSub.startDate, false) ?? start;
        const endDate = ensureTime(sub.endDate ?? mSub.endDate, true) ?? end;
        tasks.push({
          id: code,
          code,
          name: sub.concepto ?? code,
          startDate,
          endDate,
          unit: sub.unidad ?? sub.unit ?? '',
          quantity,
          unitPrice,
          budgetedCost,
          actualCost,
          progress: mSub.progress ?? 0,
          category,
          dependencies: sub.dependencies ?? mSub.dependencies,
          isMilestone: sub.isMilestone ?? mSub.isMilestone ?? false,
        });
        itemMinStart = minISO(itemMinStart, startDate);
        itemMaxEnd = maxISO(itemMaxEnd, endDate);
        itemBudgetSum += budgetedCost;
        itemActualSum += actualCost;
        dayOffset += 1;
      }

      const itemStart = asISODate(addDays(base, itemStartOffset));
      const itemEnd = asISODate(addDays(base, Math.max(itemStartOffset, dayOffset - 1)));
      tasks[itemIndex] = {
        ...tasks[itemIndex]!,
        startDate: itemMinStart ?? ensureTime(tasks[itemIndex]!.startDate, false) ?? `${itemStart}T${DEFAULT_START_TIME}`,
        endDate: itemMaxEnd ?? ensureTime(tasks[itemIndex]!.endDate, true) ?? `${itemEnd}T${DEFAULT_END_TIME}`,
        budgetedCost: itemBudgetSum,
        actualCost: itemActualSum,
      };

      chapterMinStart = itemMinStart ? minISO(chapterMinStart, itemMinStart) : chapterMinStart;
      chapterMaxEnd = itemMaxEnd ? maxISO(chapterMaxEnd, itemMaxEnd) : chapterMaxEnd;
      chapterBudgetSum += itemBudgetSum;
      chapterActualSum += itemActualSum;
    }

    const chapterStart = asISODate(addDays(base, chapterStartOffset));
    const chapterEnd = asISODate(addDays(base, Math.max(chapterStartOffset, dayOffset - 1)));
    tasks[chapterIndex] = {
      ...tasks[chapterIndex]!,
      startDate: chapterMinStart ?? ensureTime(tasks[chapterIndex]!.startDate, false) ?? `${chapterStart}T${DEFAULT_START_TIME}`,
      endDate: chapterMaxEnd ?? ensureTime(tasks[chapterIndex]!.endDate, true) ?? `${chapterEnd}T${DEFAULT_END_TIME}`,
      budgetedCost: chapterBudgetSum,
      actualCost: chapterActualSum,
    };
  }

  return { projectName: 'Kennedy Haus 08', tasks };
};

export default function App() {
  const [project, setProject] = useState<ProjectData>(INITIAL_DATA);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'gantt' | 'tasks'>('dashboard');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedByCode, setCollapsedByCode] = useState<Record<string, boolean>>({});
  const [chapterVisibility, setChapterVisibility] = useState<Record<string, boolean>>({});
  const [depDraftByCode, setDepDraftByCode] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [allowOvertime, setAllowOvertime] = useState(false);
  const LOCAL_STORAGE_KEY = 'control_de_obra_project_v1';
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
        let data: ProjectData | null = null;
        try {
          const res = await fetch('/api/project');
          if (res.ok) data = (await res.json()) as ProjectData;
        } catch {
        }

        if (!data) {
          try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as ProjectData;
              if (parsed && typeof parsed.projectName === 'string' && Array.isArray(parsed.tasks)) data = parsed;
            }
          } catch {
          }
        }

        if (!data) {
          const url = new URL('../ITEMS_OBRA.json', import.meta.url);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`No se pudo cargar ITEMS_OBRA.json (HTTP ${res.status})`);
          const items = (await res.json()) as ItemsObraRootLocal;
          data = buildProjectFromItemsObraLocal(items);
        }

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
  const endDateForDuration = (startISO: string, durationDays: number) => {
    const safe = Number.isFinite(durationDays) ? durationDays : 1;
    let remaining = Math.max(0.0001, safe);
    let cur = datePart(startISO);
    while (remaining > 0) {
      remaining -= workingWeightForDay(cur);
      if (remaining <= 0) break;
      cur = addDaysISO(cur, 1);
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
  const hasDependencyCycle = (tasksList: Task[]) => {
    const leafCount = tasksList.filter((t) => !t.isChapter).length;
    return topoOrder(tasksList).length < leafCount;
  };
  const computeReplanned = (tasksList: Task[]) => {
    const order = topoOrder(tasksList);
    const nextTasks = tasksList.map((t) => ({ ...t }));
    const nextByCode = new Map<string, Task>();
    for (const t of nextTasks) nextByCode.set(t.code, t);

    for (const code of order) {
      const task = nextByCode.get(code)!;
      const baseDur = Math.max(0.0001, businessDaysBetween(task.startDate, task.endDate));
      let earliestDate = datePart(task.startDate);
      const deps = (task.dependencies ?? []).filter((d) => nextByCode.has(d));
      if (deps.length > 0) {
        const maxEndDate = deps
          .map((d) => datePart(nextByCode.get(d)!.endDate))
          .reduce((a, b) => (a > b ? a : b));
        const minStart = allowOvertime ? maxEndDate : addBusinessDays(maxEndDate, 1);
        if (earliestDate < minStart) earliestDate = minStart;
      }
      const endDate = endDateForDuration(earliestDate, baseDur);
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

  const updateTaskDependencies = (taskCode: string, deps: string[]) => {
    const allowed = new Set(project.tasks.filter((t) => !t.isChapter).map((t) => t.code));
    const uniq = Array.from(
      new Set(
        deps
          .map((d) => d.trim())
          .filter((d) => d.length > 0)
          .filter((d) => d !== taskCode)
          .filter((d) => allowed.has(d))
      )
    );

    const nextTasks = project.tasks.map((t) => (t.code === taskCode ? { ...t, dependencies: uniq.length > 0 ? uniq : undefined } : t));
    if (hasDependencyCycle(nextTasks)) {
      window.alert('No se puede crear una dependencia circular.');
      setDepDraftByCode((prev) => {
        const next = { ...prev };
        const cur = project.tasks.find((t) => t.code === taskCode)?.dependencies ?? [];
        next[taskCode] = cur.join(', ');
        return next;
      });
      return;
    }

    setProject((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.code === taskCode ? { ...t, dependencies: uniq.length > 0 ? uniq : undefined } : t)),
    }));
    setIsDirty(true);
    setDepDraftByCode((prev) => ({ ...prev, [taskCode]: uniq.join(', ') }));
  };

  const getDurationDays = (startISO: string, endISO: string) => Math.max(1, Math.round(businessDaysBetween(startISO, endISO)));

  const handleGanttChangeStartDate = (code: string, value: string) => {
    const newStart = normalizeDateTime(value, false);
    setProject((prev) => {
      const updated = prev.tasks.map((x) => {
        if (x.code !== code) return x;
        const dur = getDurationDays(x.startDate, x.endDate);
        return { ...x, startDate: newStart, endDate: withTime(x.endDate, endDateForDuration(newStart, dur), true) };
      });
      return { ...prev, tasks: updated };
    });
    setIsDirty(true);
  };

  const handleGanttChangeEndDate = (code: string, value: string) => {
    const newEnd = normalizeDateTime(value, true);
    setProject((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.code === code ? { ...x, endDate: newEnd } : x)) }));
    setIsDirty(true);
  };

  const handleGanttChangeDurationDays = (code: string, durationDays: number) => {
    const dur = Math.max(1, durationDays);
    setProject((prev) => {
      const updated = prev.tasks.map((x) => {
        if (x.code !== code) return x;
        return { ...x, endDate: withTime(x.endDate, endDateForDuration(x.startDate, dur), true) };
      });
      return { ...prev, tasks: updated };
    });
    setIsDirty(true);
  };

  const handleGanttChangeDepDraft = (code: string, value: string) => {
    setDepDraftByCode((prev) => ({ ...prev, [code]: value }));
  };

  const handleGanttCommitDeps = (code: string, value: string) => {
    const parts = value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    updateTaskDependencies(code, parts);
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
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4000);
        const res = await fetch('/api/project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal });
        window.clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { ok?: boolean; saved?: number };
        if (!payload.ok) throw new Error('Respuesta inválida del servidor');
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, body);
        } catch {
        }
        setIsDirty(false);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 1500);
      } catch {
        localStorage.setItem(LOCAL_STORAGE_KEY, body);
        setIsDirty(false);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 1500);
      }
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
                      {planOpen ? (
                        <label className="flex items-center gap-2 text-xs text-zinc-700 bg-white border border-zinc-200 rounded-lg px-3 py-2 shadow-sm">
                          <input
                            type="checkbox"
                            checked={allowOvertime}
                            onChange={(e) => setAllowOvertime(e.target.checked)}
                            className="accent-zinc-900"
                          />
                          Permitir horas extra
                        </label>
                      ) : null}
                      {planOpen ? (
                        <button
                          onClick={applyReplan}
                          className="px-3 py-2 bg-zinc-900 rounded-lg text-xs font-semibold text-white hover:bg-zinc-800"
                        >
                          Aplicar reprogramación
                        </button>
                      ) : null}
                      <button
                        onClick={() => setPlanOpen((v) => !v)}
                        className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm"
                        title="Editar fechas y duración"
                      >
                        {planOpen ? 'Terminar edición' : 'Editar plan'}
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
                      editingMode={planOpen}
                      depDraftByCode={depDraftByCode}
                      getDurationDays={getDurationDays}
                      normalizeDateTime={normalizeDateTime}
                      onChangeStartDate={handleGanttChangeStartDate}
                      onChangeEndDate={handleGanttChangeEndDate}
                      onChangeDurationDays={handleGanttChangeDurationDays}
                      onChangeDepDraft={handleGanttChangeDepDraft}
                      onCommitDeps={handleGanttCommitDeps}
                    />
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
