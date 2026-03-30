import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Task } from '../types';
import { cn } from '../lib/utils';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';

interface GanttChartProps {
  tasks: Task[];
  collapsedByCode: Record<string, boolean>;
  hasChildrenByCode: Record<string, boolean>;
  onToggleCollapse: (code: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  getDragSet: (root: { code: string; isChapter?: boolean }) => Array<{ code: string; startDate: string; endDate: string }>;
  onBulkUpdateDates: (updates: Array<{ code: string; startDate: string; endDate: string }>) => void;
  onAddDependency: (fromCode: string, toCode: string) => void;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type ViewMode = 'day' | 'week' | 'month';

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  collapsedByCode,
  hasChildrenByCode,
  onToggleCollapse,
  onCollapseAll,
  onExpandAll,
  getDragSet,
  onBulkUpdateDates,
  onAddDependency,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    pointerId: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [pxPerUnit, setPxPerUnit] = useState(30);
  const [isPanning, setIsPanning] = useState(false);
  const [taskColWidth, setTaskColWidth] = useState(320);
  const [showCritical, setShowCritical] = useState(false);
  const [bodyScrollTop, setBodyScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [dragPreviewByCode, setDragPreviewByCode] = useState<Record<string, { startDate: string; endDate: string }>>({});
  const dragRef = useRef<{
    startClientX: number;
    lastDeltaUnits: number;
    base: Array<{ code: string; startDate: string; endDate: string }>;
  } | null>(null);
  const [isDraggingBar, setIsDraggingBar] = useState(false);
  const resizeRef = useRef<{
    startClientX: number;
    lastDeltaUnits: number;
    base: { code: string; startDate: string; endDate: string };
  } | null>(null);
  const [isResizingBar, setIsResizingBar] = useState(false);
  const [linking, setLinking] = useState<{
    fromCode: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);

  const weekStartsOn = 1;
  const rowHeight = 56;

  const { baseline, columns, totalWidth } = useMemo(() => {
    if (tasks.length === 0) {
      const today = new Date();
      const start = startOfMonth(today);
      const end = endOfMonth(addDays(today, 30));

      if (viewMode === 'month') {
        const cols = eachMonthOfInterval({ start, end });
        return { baseline: start, columns: cols, totalWidth: cols.length * pxPerUnit };
      }

      if (viewMode === 'week') {
        const s = startOfWeek(start, { weekStartsOn });
        const e = endOfWeek(end, { weekStartsOn });
        const cols = eachWeekOfInterval({ start: s, end: e }, { weekStartsOn });
        return { baseline: s, columns: cols, totalWidth: cols.length * pxPerUnit };
      }

      const cols = eachDayOfInterval({ start, end });
      return { baseline: start, columns: cols, totalWidth: cols.length * pxPerUnit };
    }

    const minStart = new Date(Math.min(...tasks.map(t => new Date(t.startDate).getTime())));
    const maxEnd = new Date(Math.max(...tasks.map(t => new Date(t.endDate).getTime())));

    const paddedStart = startOfMonth(minStart);
    const paddedEnd = endOfMonth(addDays(maxEnd, 7));

    if (viewMode === 'month') {
      const cols = eachMonthOfInterval({ start: paddedStart, end: paddedEnd });
      return { baseline: paddedStart, columns: cols, totalWidth: cols.length * pxPerUnit };
    }

    if (viewMode === 'week') {
      const s = startOfWeek(paddedStart, { weekStartsOn });
      const e = endOfWeek(paddedEnd, { weekStartsOn });
      const cols = eachWeekOfInterval({ start: s, end: e }, { weekStartsOn });
      return { baseline: s, columns: cols, totalWidth: cols.length * pxPerUnit };
    }

    const cols = eachDayOfInterval({ start: paddedStart, end: paddedEnd });
    return { baseline: paddedStart, columns: cols, totalWidth: cols.length * pxPerUnit };
  }, [tasks, pxPerUnit, viewMode]);

  const effectiveTask = (task: Task) => {
    const preview = dragPreviewByCode[task.code];
    return preview ? { ...task, ...preview } : task;
  };

  const getTaskPosition = (task: Task) => {
    const taskStart = new Date(task.startDate);
    const taskEnd = new Date(task.endDate);

    const left =
      viewMode === 'month'
        ? differenceInCalendarMonths(taskStart, baseline) * pxPerUnit
        : viewMode === 'week'
          ? differenceInCalendarWeeks(taskStart, baseline, { weekStartsOn }) * pxPerUnit
          : differenceInCalendarDays(taskStart, baseline) * pxPerUnit;

    const width =
      viewMode === 'month'
        ? (differenceInCalendarMonths(taskEnd, taskStart) + 1) * pxPerUnit
        : viewMode === 'week'
          ? (differenceInCalendarWeeks(taskEnd, taskStart, { weekStartsOn }) + 1) * pxPerUnit
          : (differenceInCalendarDays(taskEnd, taskStart) + 1) * pxPerUnit;

    return { left, width };
  };

  const toLocalISO = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");
  const shiftISO = (iso: string, deltaUnits: number) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    const shifted =
      viewMode === 'month' ? addMonths(d, deltaUnits) : viewMode === 'week' ? addDays(d, deltaUnits * 7) : addDays(d, deltaUnits);
    return toLocalISO(shifted);
  };

  useEffect(() => {
    if (!isDraggingBar) return;
    const onMove = (ev: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const dx = ev.clientX - state.startClientX;
      const deltaUnits = Math.round(dx / pxPerUnit);
      if (deltaUnits === state.lastDeltaUnits) return;
      state.lastDeltaUnits = deltaUnits;

      const next: Record<string, { startDate: string; endDate: string }> = {};
      for (const t of state.base) {
        next[t.code] = {
          startDate: shiftISO(t.startDate, deltaUnits),
          endDate: shiftISO(t.endDate, deltaUnits),
        };
      }
      setDragPreviewByCode(next);
    };

    const onUp = () => {
      const state = dragRef.current;
      if (!state) return;
      const deltaUnits = state.lastDeltaUnits;
      if (deltaUnits === 0) {
        dragRef.current = null;
        setIsDraggingBar(false);
        setDragPreviewByCode({});
        return;
      }
      const updates = state.base.map((t) => ({
        code: t.code,
        startDate: shiftISO(t.startDate, deltaUnits),
        endDate: shiftISO(t.endDate, deltaUnits),
      }));
      if (updates.length > 0) onBulkUpdateDates(updates);
      dragRef.current = null;
      setIsDraggingBar(false);
      setDragPreviewByCode({});
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDraggingBar, onBulkUpdateDates, pxPerUnit, viewMode]);

  useEffect(() => {
    if (!isResizingBar) return;
    const onMove = (ev: PointerEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const dx = ev.clientX - state.startClientX;
      const deltaUnits = Math.round(dx / pxPerUnit);
      if (deltaUnits === state.lastDeltaUnits) return;
      state.lastDeltaUnits = deltaUnits;

      const nextEnd = shiftISO(state.base.endDate, deltaUnits);
      setDragPreviewByCode((prev) => ({
        ...prev,
        [state.base.code]: {
          startDate: state.base.startDate,
          endDate: nextEnd,
        },
      }));
    };

    const onUp = () => {
      const state = resizeRef.current;
      if (!state) return;
      const deltaUnits = state.lastDeltaUnits;
      if (deltaUnits === 0) {
        resizeRef.current = null;
        setIsResizingBar(false);
        setDragPreviewByCode((prev) => {
          const next = { ...prev };
          delete next[state.base.code];
          return next;
        });
        return;
      }
      const nextEnd = shiftISO(state.base.endDate, deltaUnits);
      onBulkUpdateDates([{ code: state.base.code, startDate: state.base.startDate, endDate: nextEnd }]);
      resizeRef.current = null;
      setIsResizingBar(false);
      setDragPreviewByCode((prev) => {
        const next = { ...prev };
        delete next[state.base.code];
        return next;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isResizingBar, onBulkUpdateDates, pxPerUnit, viewMode]);

  useEffect(() => {
    if (!linking) return;
    const onMove = (ev: PointerEvent) => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const headerH = headerRef.current?.offsetHeight ?? 0;

      const x = ev.clientX - rect.left + scroller.scrollLeft - taskColWidth;
      const y = ev.clientY - rect.top + scroller.scrollTop - headerH;
      setLinking((prev) => (prev ? { ...prev, x, y } : prev));
    };

    const onUp = () => {
      const cur = linking;
      const rowIndex = Math.floor(cur.y / rowHeight);
      const target = tasks[rowIndex];
      if (target && !target.isChapter && target.code !== cur.fromCode) {
        onAddDependency(cur.fromCode, target.code);
      }
      setLinking(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [linking, onAddDependency, rowHeight, taskColWidth, tasks]);

  const headerGroups = useMemo(() => {
    if (columns.length === 0) return [];

    const groups: Array<{ label: string; count: number }> = [];
    const keyFor = (d: Date) => (viewMode === 'month' ? format(d, 'yyyy') : format(d, 'yyyy-MM'));
    const labelFor = (d: Date) =>
      viewMode === 'month' ? format(d, 'yyyy', { locale: es }) : format(d, 'MMMM yyyy', { locale: es });

    for (const col of columns) {
      const key = keyFor(col);
      const last = groups[groups.length - 1];
      if (last && last.label === key) {
        last.count += 1;
      } else {
        groups.push({ label: key, count: 1 });
      }
    }

    return groups.map((g) => ({
      label: g.label.includes('-') ? labelFor(new Date(`${g.label}-01T00:00:00`)) : g.label,
      count: g.count,
    }));
  }, [columns, viewMode]);

  const criticalCodes = useMemo(() => {
    if (!showCritical) return new Set<string>();
    const byCode = new Map<string, Task>();
    for (const t of tasks) byCode.set(t.code, t);

    const nodes = tasks.filter((t) => !t.isChapter).map((t) => t.code);
    const succ = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    const depsBy = new Map<string, string[]>();

    for (const code of nodes) {
      succ.set(code, []);
      indeg.set(code, 0);
      depsBy.set(code, []);
    }

    for (const code of nodes) {
      const t = byCode.get(code);
      const deps = (t?.dependencies ?? []).filter((d) => byCode.has(d) && !byCode.get(d)?.isChapter);
      depsBy.set(code, deps);
      indeg.set(code, deps.length);
      for (const d of deps) {
        const list = succ.get(d);
        if (list) list.push(code);
      }
    }

    const duration = (code: string) => {
      const t = byCode.get(code);
      if (!t) return 0;
      if (t.isMilestone) return 0;
      const s = new Date(t.startDate);
      const e = new Date(t.endDate);
      if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return 1;
      return Math.max(1, differenceInCalendarDays(e, s) + 1);
    };

    const q: string[] = [];
    for (const code of nodes) {
      if ((indeg.get(code) ?? 0) === 0) q.push(code);
    }

    const topo: string[] = [];
    while (q.length > 0) {
      const n = q.shift()!;
      topo.push(n);
      for (const s of succ.get(n) ?? []) {
        const next = (indeg.get(s) ?? 0) - 1;
        indeg.set(s, next);
        if (next === 0) q.push(s);
      }
    }

    if (topo.length !== nodes.length) return new Set<string>();

    const ES = new Map<string, number>();
    const EF = new Map<string, number>();
    for (const code of topo) {
      const deps = depsBy.get(code) ?? [];
      const es = deps.length === 0 ? 0 : Math.max(...deps.map((d) => EF.get(d) ?? 0));
      const dur = duration(code);
      ES.set(code, es);
      EF.set(code, es + dur);
    }

    const projectDuration = Math.max(0, ...topo.map((c) => EF.get(c) ?? 0));
    const LF = new Map<string, number>();
    const LS = new Map<string, number>();
    for (const code of topo) LF.set(code, projectDuration);

    for (let i = topo.length - 1; i >= 0; i -= 1) {
      const code = topo[i]!;
      const successors = succ.get(code) ?? [];
      const lf =
        successors.length === 0
          ? projectDuration
          : Math.min(...successors.map((s) => LS.get(s) ?? projectDuration));
      const dur = duration(code);
      LF.set(code, lf);
      LS.set(code, lf - dur);
    }

    const critical = new Set<string>();
    for (const code of topo) {
      const slack = (LS.get(code) ?? 0) - (ES.get(code) ?? 0);
      if (Math.abs(slack) < 1e-9) critical.add(code);
    }
    return critical;
  }, [showCritical, tasks]);

  const zoomTo = (nextPxPerUnit: number) => {
    setPxPerUnit((prev) => {
      const next = clampNumber(nextPxPerUnit, 10, 120);
      const scroller = scrollRef.current;
      if (scroller && prev !== 0) {
        const ratio = next / prev;
        scroller.scrollLeft = scroller.scrollLeft * ratio;
      }
      return next;
    });
  };

  const scrollByAmount = (direction: 'left' | 'right') => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const units = viewMode === 'month' ? 2 : viewMode === 'week' ? 4 : 7;
    const delta = Math.max(scroller.clientWidth * 0.8, pxPerUnit * units);
    scroller.scrollBy({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a')) return;
    if (target?.closest('[data-gantt-left="true"]')) return;
    if (target?.closest('[data-gantt-bar="true"]')) return;
    if (target?.closest('[data-gantt-link-handle="true"]')) return;
    if (target?.closest('[data-gantt-resize-handle="true"]')) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      pointerId: e.pointerId,
    };
    setIsPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const state = panRef.current;
    if (!state) return;
    const el = e.currentTarget;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    el.scrollLeft = state.scrollLeft - dx;
    el.scrollTop = state.scrollTop - dy;
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const el = e.currentTarget;
    const state = panRef.current;
    if (state) {
      try {
        el.releasePointerCapture(state.pointerId);
      } catch {
      }
    }
    panRef.current = null;
    setIsPanning(false);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const headerH = headerRef.current?.offsetHeight ?? 0;
      setViewportHeight(Math.max(0, el.clientHeight - headerH));
      setBodyScrollTop(Math.max(0, el.scrollTop - headerH));
    };
    update();

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  }, []);

  const zoomLabel = viewMode === 'month' ? 'px/mes' : viewMode === 'week' ? 'px/sem' : 'px/día';
  const overscan = 12;
  const startIndex = Math.max(0, Math.floor(bodyScrollTop / rowHeight) - overscan);
  const endIndex = Math.min(tasks.length, Math.ceil((bodyScrollTop + viewportHeight) / rowHeight) + overscan);
  const visibleTasks = tasks.slice(startIndex, endIndex);
  const totalRowsHeight = tasks.length * rowHeight;
  const indexByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < tasks.length; i += 1) map.set(tasks[i]!.code, i);
    return map;
  }, [tasks]);

  return (
    <div className="space-y-2 flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setViewMode('day')}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                viewMode === 'day' ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              )}
            >
              Día
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                viewMode === 'week' ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              )}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                viewMode === 'month' ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              )}
            >
              Mes
            </button>
          </div>

          <button
            onClick={() => zoomTo(pxPerUnit - 5)}
            className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Alejar"
          >
            <Minus size={16} />
          </button>
          <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Zoom</span>
            <span className="text-xs font-mono text-zinc-700">{pxPerUnit}{zoomLabel}</span>
          </div>
          <button
            onClick={() => zoomTo(pxPerUnit + 5)}
            className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Acercar"
          >
            <Plus size={16} />
          </button>

          <button
            onClick={onCollapseAll}
            className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Recoger todo"
          >
            Recoger
          </button>
          <button
            onClick={onExpandAll}
            className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Expandir todo"
          >
            Expandir
          </button>

          <button
            onClick={() => setShowCritical((v) => !v)}
            className={cn(
              "px-3 py-2 border rounded-lg text-xs font-semibold transition-colors",
              showCritical
                ? "bg-zinc-900 border-zinc-900 text-white hover:bg-zinc-800"
                : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            )}
            title="Mostrar ruta crítica (requiere dependencias)"
          >
            Ruta crítica
          </button>

          <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Ancho</span>
            <input
              type="range"
              min={240}
              max={520}
              value={taskColWidth}
              onChange={(e) => setTaskColWidth(Number(e.target.value))}
              className="w-28"
            />
            <span className="text-xs font-mono text-zinc-700">{taskColWidth}px</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => scrollByAmount('left')}
            className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Mover a la izquierda"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={() => scrollByAmount('right')}
            className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Mover a la derecha"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "flex-1 min-h-0 overflow-auto border border-zinc-200 rounded-lg bg-white shadow-sm select-none",
          isPanning ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerLeave={endPan}
      >
        <div className="min-w-max">
          <div ref={headerRef} className="flex border-b border-zinc-100 bg-zinc-50 sticky top-0 z-20">
            <div
              data-gantt-left="true"
              className="flex-shrink-0 border-r border-zinc-200 p-3 font-semibold text-zinc-600 text-sm sticky left-0 bg-zinc-50 z-30 flex items-center"
              style={{ width: taskColWidth }}
            >
              Tarea / Actividad
            </div>
            <div className="flex flex-col" style={{ width: totalWidth }}>
              <div className="flex h-7 border-b border-zinc-100">
                {headerGroups.map((g, idx) => (
                  <div
                    key={`${g.label}-${idx}`}
                    className={cn(
                      "flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-r border-zinc-100 px-2 whitespace-nowrap"
                    )}
                    style={{ width: g.count * pxPerUnit }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              <div className="flex" style={{ width: totalWidth }}>
                {columns.map((col, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "h-12 flex flex-col items-center justify-center text-[10px] border-r border-zinc-100",
                      viewMode === 'day' && idx % 7 === 0 ? "bg-zinc-100" : ""
                    )}
                    style={{ width: pxPerUnit }}
                  >
                    {viewMode === 'day' ? (
                      <>
                        <span className="text-zinc-400 uppercase font-bold">{format(col, 'EEE', { locale: es })}</span>
                        <span className="text-zinc-700">{format(col, 'd')}</span>
                      </>
                    ) : viewMode === 'week' ? (
                      <>
                        <span className="text-zinc-400 uppercase font-bold">SEM {format(col, 'I')}</span>
                        <span className="text-zinc-700">
                          {format(col, 'd MMM', { locale: es })} - {format(addDays(col, 6), 'd MMM', { locale: es })}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-zinc-400 uppercase font-bold">{format(col, 'MMM', { locale: es })}</span>
                        <span className="text-zinc-700">{format(col, 'yyyy')}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative" style={{ height: totalRowsHeight }}>
              {linking ? (
                <svg
                  className="absolute top-0 z-30"
                  style={{ left: taskColWidth, width: totalWidth, height: totalRowsHeight, pointerEvents: 'none' }}
                >
                  <defs>
                    <marker id="gantt-arrowhead-live" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="rgba(244,63,94,0.9)" />
                    </marker>
                  </defs>
                  <path
                    d={`M ${linking.startX} ${linking.startY} C ${linking.startX + 40} ${linking.startY}, ${Math.max(0, linking.x - 40)} ${linking.y}, ${Math.max(0, linking.x)} ${linking.y}`}
                    stroke="rgba(244,63,94,0.9)"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#gantt-arrowhead-live)"
                  />
                </svg>
              ) : null}
              {visibleTasks.map((task, localIdx) => {
                const index = startIndex + localIdx;
                const t = effectiveTask(task);
                const { left, width } = getTaskPosition(t);
                const depth = Math.max(0, task.code.split('.').length - 1);
                const hasChildren = Boolean(hasChildrenByCode[task.code]);
                const isCollapsed = Boolean(collapsedByCode[task.code]);
                const isCritical = criticalCodes.has(task.code);
                const gridStyle: React.CSSProperties = {
                  width: totalWidth,
                  backgroundImage:
                    'repeating-linear-gradient(to right, rgba(0,0,0,0.03) 0, rgba(0,0,0,0.03) 1px, transparent 1px, transparent var(--gantt-step))',
                  backgroundSize: 'var(--gantt-step) 100%',
                  ['--gantt-step' as any]: `${pxPerUnit}px`,
                };
                const top = index * rowHeight;
                const barColor =
                  task.category === 'Estructura'
                    ? '#3b82f6'
                    : task.category === 'Preliminares'
                      ? '#10b981'
                      : task.category === 'Instalaciones'
                        ? '#f59e0b'
                        : '#6366f1';
                const milestoneX = left + Math.max(0, width) - 6;
                const title =
                  `${task.code} • ${task.name}\n` +
                  `Inicio: ${format(new Date(t.startDate), "d MMM yyyy HH:mm", { locale: es })}\n` +
                  `Fin: ${format(new Date(t.endDate), "d MMM yyyy HH:mm", { locale: es })}`;

                return (
                  <div
                    key={task.id}
                    className="flex border-b border-zinc-50 hover:bg-zinc-50 transition-colors group"
                    style={{ position: 'absolute', top, left: 0, right: 0, height: rowHeight }}
                  >
                    <div
                      data-gantt-left="true"
                      className="flex-shrink-0 border-r border-zinc-200 p-3 flex flex-col justify-center sticky left-0 bg-white z-10 group-hover:bg-zinc-50"
                      style={{ width: taskColWidth }}
                    >
                      <div className="flex items-start gap-2" style={{ marginLeft: depth * 12 }}>
                        <button
                          onClick={() => onToggleCollapse(task.code)}
                          disabled={!hasChildren}
                          className={cn(
                            "w-6 h-6 rounded-md border border-transparent flex items-center justify-center text-zinc-500",
                            hasChildren ? "hover:bg-white hover:border-zinc-200" : "opacity-0"
                          )}
                          title={hasChildren ? (isCollapsed ? 'Expandir' : 'Recoger') : undefined}
                        >
                          {hasChildren ? (
                            isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />
                          ) : (
                            <span />
                          )}
                        </button>
                        <span className="text-[9px] font-mono text-zinc-400 mt-0.5 w-12">{task.code}</span>
                        <span
                          className={cn(
                            "text-sm truncate flex items-center gap-2",
                            task.isChapter ? "font-bold text-zinc-900 uppercase tracking-tight" : "font-medium text-zinc-700"
                          )}
                        >
                          {task.name}
                          {task.isMilestone ? (
                            <span className="inline-block w-2.5 h-2.5 bg-zinc-900 rotate-45 rounded-[2px]" title="Hito" />
                          ) : null}
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-400 uppercase tracking-wider ml-12">{task.category}</span>
                    </div>

                    <div className="relative" style={gridStyle}>
                      {!task.isMilestone ? (
                        <div 
                          className={cn(
                            "absolute top-3 h-8 rounded-md shadow-sm flex items-center px-2 overflow-hidden transition-all group-hover:brightness-105",
                            isCritical ? "ring-2 ring-red-500 ring-offset-1 ring-offset-white" : ""
                          )}
                          style={{ 
                            left: `${left}px`, 
                            width: `${Math.max(2, width)}px`,
                            backgroundColor: barColor,
                          }}
                          data-gantt-bar="true"
                          title={title}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            if (linking) return;
                            e.stopPropagation();
                            const affected = getDragSet({ code: task.code, isChapter: task.isChapter });
                            if (affected.length === 0) return;
                            dragRef.current = {
                              startClientX: e.clientX,
                              lastDeltaUnits: 0,
                              base: affected.map((x) => ({ code: x.code, startDate: x.startDate, endDate: x.endDate })),
                            };
                            try {
                              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                            } catch {
                            }
                            setIsDraggingBar(true);
                          }}
                        >
                          <div 
                            className="absolute left-0 top-0 bottom-0 bg-white/20" 
                            style={{ width: `${task.progress}%` }} 
                          />
                          <span className="relative z-10 text-[10px] font-bold text-white whitespace-nowrap">
                            {task.progress}%
                          </span>
                          {!task.isChapter ? (
                            <button
                              type="button"
                              data-gantt-link-handle="true"
                              onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                e.stopPropagation();
                                setLinking({
                                  fromCode: task.code,
                                  startX: left + Math.max(2, width),
                                  startY: index * rowHeight + rowHeight / 2,
                                  x: left + Math.max(2, width),
                                  y: index * rowHeight + rowHeight / 2,
                                });
                              }}
                              className="ml-auto w-5 h-5 rounded-full bg-white/90 border border-white/40 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Arrastra para conectar predecesora"
                            />
                          ) : null}
                          {!task.isChapter ? (
                            <div
                              data-gantt-resize-handle="true"
                              onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                e.stopPropagation();
                                resizeRef.current = {
                                  startClientX: e.clientX,
                                  lastDeltaUnits: 0,
                                  base: { code: task.code, startDate: t.startDate, endDate: t.endDate },
                                };
                                try {
                                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                                } catch {
                                }
                                setIsResizingBar(true);
                              }}
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                              style={{ background: 'rgba(255,255,255,0.15)' }}
                              title="Arrastra para cambiar duración"
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "absolute top-5 w-3 h-3 rotate-45 rounded-[2px] shadow-sm",
                            isCritical ? "ring-2 ring-red-500 ring-offset-1 ring-offset-white" : ""
                          )}
                          style={{ left: `${milestoneX}px`, backgroundColor: barColor }}
                          data-gantt-bar="true"
                          title={title}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            if (linking) return;
                            e.stopPropagation();
                            const affected = getDragSet({ code: task.code, isChapter: task.isChapter });
                            if (affected.length === 0) return;
                            dragRef.current = {
                              startClientX: e.clientX,
                              lastDeltaUnits: 0,
                              base: affected.map((x) => ({ code: x.code, startDate: x.startDate, endDate: x.endDate })),
                            };
                            try {
                              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                            } catch {
                            }
                            setIsDraggingBar(true);
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              <svg
                width={taskColWidth + totalWidth}
                height={totalRowsHeight}
                className="absolute top-0 left-0 pointer-events-none z-20"
              >
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                  </marker>
                </defs>
                {visibleTasks.map((succ, localIdx) => {
                  const succIndex = startIndex + localIdx;
                  const succPos = getTaskPosition(effectiveTask(succ));
                  const succY = succIndex * rowHeight + rowHeight / 2;
                  const succX = taskColWidth + succPos.left;
                  const deps = (succ.dependencies ?? []).filter((d) => d.length > 0);
                  return deps.map((code) => {
                    const predIndex = indexByCode.get(code);
                    if (predIndex == null) return null;
                    if (predIndex < startIndex || predIndex >= endIndex) return null;
                    const predTask = tasks[predIndex]!;
                    const predPos = getTaskPosition(effectiveTask(predTask));
                    const predY = predIndex * rowHeight + rowHeight / 2;
                    const predX = taskColWidth + predPos.left + Math.max(2, predPos.width);
                    const midX = (predX + succX) / 2;
                    return (
                      <g key={`${succ.code}-${code}`}>
                        <path
                          d={`M ${predX} ${predY} C ${midX} ${predY}, ${midX} ${succY}, ${succX} ${succY}`}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="1.5"
                          markerEnd="url(#arrowhead)"
                          opacity="0.8"
                        />
                        <text
                          x={predX + 4}
                          y={predY - 6}
                          fontSize="10"
                          fill="#3b82f6"
                          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                        >
                          {code}
                        </text>
                      </g>
                    );
                  });
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
