import React, { useMemo, useState } from 'react';
import { Task } from '../types';
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface TaskListProps {
  tasks: Task[];
  onAddTask: () => void;
  onDeleteTask: (id: string) => void;
  onUpdateProgress: (id: string, progress: number) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  collapsedByCode: Record<string, boolean>;
  hasChildrenByCode: Record<string, boolean>;
  onToggleCollapse: (code: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onAddTask,
  onDeleteTask,
  onUpdateProgress,
  onUpdateTask,
  collapsedByCode,
  hasChildrenByCode,
  onToggleCollapse,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDeps, setEditingDeps] = useState<string>('');
  const [editingMilestone, setEditingMilestone] = useState<boolean>(false);
  const [depQuery, setDepQuery] = useState<string>('');
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);

  const taskById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  const allCodes = useMemo(() => {
    return tasks.map((t) => t.code);
  }, [tasks]);

  const predecessorCandidates = useMemo(() => {
    return tasks
      .filter((t) => !t.isChapter)
      .map((t) => ({ code: t.code, name: t.name }));
  }, [tasks]);

  const filteredCandidates = useMemo(() => {
    const q = depQuery.trim().toLowerCase();
    if (!q) return predecessorCandidates;
    return predecessorCandidates.filter((c) => {
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    });
  }, [depQuery, predecessorCandidates]);

  const openEdit = (task: Task) => {
    const deps = (task.dependencies ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
    setEditingId(task.id);
    setSelectedDeps(Array.from(new Set(deps)));
    setEditingDeps(Array.from(new Set(deps)).join(', '));
    setEditingMilestone(Boolean(task.isMilestone));
    setDepQuery('');
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditingDeps('');
    setEditingMilestone(false);
    setDepQuery('');
    setSelectedDeps([]);
  };

  const parseDeps = (raw: string) => {
    const deps = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return Array.from(new Set(deps));
  };

  const saveEdit = () => {
    if (!editingId) return;
    const uniq = parseDeps(editingDeps);
    onUpdateTask(editingId, {
      dependencies: uniq.length > 0 ? uniq : undefined,
      isMilestone: editingMilestone,
    });
    closeEdit();
  };

  const editingTask = editingId ? taskById.get(editingId) ?? null : null;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
        <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">Desglose de Actividades</h3>
        <button 
          onClick={onAddTask}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-medium hover:bg-zinc-800 transition-colors"
        >
          <Plus size={14} />
          Nueva Actividad
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
              <th className="px-6 py-3 border-b border-zinc-100">Actividad</th>
              <th className="px-6 py-3 border-b border-zinc-100 text-center">Unidad</th>
              <th className="px-6 py-3 border-b border-zinc-100 text-right">Cant.</th>
              <th className="px-6 py-3 border-b border-zinc-100 text-right">V. Unit.</th>
              <th className="px-6 py-3 border-b border-zinc-100 text-center">Progreso</th>
              <th className="px-6 py-3 border-b border-zinc-100 text-right">Presupuesto</th>
              <th className="px-6 py-3 border-b border-zinc-100 text-right">Costo Real</th>
              <th className="px-6 py-3 border-b border-zinc-100 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {tasks.map((task) => {
              const depth = Math.max(0, task.code.split('.').length - 1);
              const hasChildren = Boolean(hasChildrenByCode[task.code]);
              const isCollapsed = Boolean(collapsedByCode[task.code]);
              const deps = (task.dependencies ?? []).filter((d) => d.length > 0);
              const computedBudget = task.isChapter ? task.budgetedCost : (Number(task.quantity) || 0) * (Number(task.unitPrice) || 0);
              return (
              <tr key={task.id} className={cn(
                "hover:bg-zinc-50/50 transition-colors group",
                task.isChapter ? "bg-zinc-100/50 font-bold" : ""
              )}>
                <td className="px-6 py-4">
                  <div className="flex items-start gap-3" style={{ marginLeft: depth * 12 }}>
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
                    <span className="text-[10px] font-mono text-zinc-400 mt-1 w-12">{task.code}</span>
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-sm text-zinc-800 flex items-center gap-2",
                        task.isChapter ? "font-bold uppercase tracking-tight" : "font-medium"
                      )}>
                        {task.name}
                        {task.isMilestone ? (
                          <span className="inline-block w-2.5 h-2.5 bg-zinc-900 rotate-45 rounded-[2px]" title="Hito" />
                        ) : null}
                      </span>
                      <span className="text-[10px] text-zinc-400">{task.startDate} al {task.endDate}</span>
                      {deps.length > 0 ? (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-widest">Predecesoras</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {deps.slice(0, 10).map((d) => (
                              <span
                                key={d}
                                className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 text-zinc-700 rounded border border-zinc-200"
                              >
                                {d}
                              </span>
                            ))}
                            {deps.length > 10 ? (
                              <span className="text-[10px] text-zinc-400">+{deps.length - 10}</span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center text-xs text-zinc-600">
                  {task.isChapter ? (
                    "-"
                  ) : (
                    <input
                      value={task.unit ?? ''}
                      onChange={(e) => onUpdateTask(task.id, { unit: e.target.value })}
                      className="w-20 text-center text-xs text-zinc-700 bg-transparent border border-zinc-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  )}
                </td>
                <td className="px-6 py-4 text-right text-xs text-zinc-600">
                  {task.isChapter ? (
                    "-"
                  ) : (
                    <input
                      type="number"
                      min={0}
                      value={Number.isFinite(task.quantity) ? task.quantity : 0}
                      onChange={(e) => {
                        const quantity = Number(e.target.value);
                        const unitPrice = Number(task.unitPrice) || 0;
                        onUpdateTask(task.id, { quantity, budgetedCost: quantity * unitPrice });
                      }}
                      className="w-24 text-right text-xs text-zinc-700 bg-transparent border border-zinc-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  )}
                </td>
                <td className="px-6 py-4 text-right text-xs text-zinc-600">
                  {task.isChapter ? (
                    "-"
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={Number.isFinite(task.unitPrice) ? task.unitPrice : 0}
                      onChange={(e) => {
                        const unitPrice = Number(e.target.value);
                        const quantity = Number(task.quantity) || 0;
                        onUpdateTask(task.id, { unitPrice, budgetedCost: quantity * unitPrice });
                      }}
                      className="w-28 text-right text-xs text-zinc-700 bg-transparent border border-zinc-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex-1 max-w-[100px] h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-500",
                          task.isChapter ? "bg-zinc-400" : "bg-emerald-500"
                        )}
                        style={{ width: `${task.progress}%` }} 
                      />
                    </div>
                    <input 
                      type="number" 
                      min="0" 
                      max="100" 
                      value={task.progress}
                      onChange={(e) => onUpdateProgress(task.id, parseInt(e.target.value) || 0)}
                      disabled={Boolean(task.isChapter)}
                      className="w-12 text-[10px] font-bold text-zinc-600 bg-transparent border-none focus:ring-0 text-right"
                    />
                    <span className="text-[10px] text-zinc-400">%</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right text-sm font-mono text-zinc-600">
                  ${computedBudget.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-sm font-mono text-zinc-900">
                  ${task.actualCost.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(task)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 transition-colors"
                      title="Editar hitos y dependencias"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => onDeleteTask(task.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl bg-white rounded-xl border border-zinc-200 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Editar</p>
                <p className="text-sm font-semibold text-zinc-900 truncate">
                  {editingTask.code} — {editingTask.name}
                </p>
              </div>
              <button onClick={closeEdit} className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 rounded-lg">
                Cerrar
              </button>
            </div>

            <div className="p-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={editingMilestone}
                  onChange={(e) => setEditingMilestone(e.target.checked)}
                  className="accent-zinc-900"
                />
                Marcar como hito
              </label>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Dependencias (códigos)</p>
                <input
                  value={editingDeps}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditingDeps(next);
                    setSelectedDeps(parseDeps(next));
                  }}
                  placeholder={allCodes.slice(0, 5).join(', ') + (allCodes.length > 5 ? ', ...' : '')}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
                <p className="text-[10px] text-zinc-400">
                  Separar por coma. Ejemplo: 1.2.3, 1.2.4
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Seleccionar predecesoras</p>
                <input
                  value={depQuery}
                  onChange={(e) => setDepQuery(e.target.value)}
                  placeholder="Buscar por código o nombre"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
                <div className="max-h-56 overflow-auto border border-zinc-200 rounded-lg">
                  {filteredCandidates
                    .filter((c) => c.code !== editingTask.code)
                    .slice(0, 250)
                    .map((c) => {
                      const checked = selectedDeps.includes(c.code);
                      return (
                        <label
                          key={c.code}
                          className="flex items-start gap-3 px-3 py-2 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? Array.from(new Set([...selectedDeps, c.code]))
                                : selectedDeps.filter((d) => d !== c.code);
                              setSelectedDeps(next);
                              setEditingDeps(next.join(', '));
                            }}
                            className="mt-1 accent-zinc-900"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-zinc-800">{c.code}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{c.name}</p>
                          </div>
                        </label>
                      );
                    })}
                </div>
                <p className="text-[10px] text-zinc-400">
                  Puedes seleccionar una o varias predecesoras. Esto llena automáticamente el campo de dependencias.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 flex items-center justify-end gap-2 bg-zinc-50/50">
              <button onClick={closeEdit} className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
              <button onClick={saveEdit} className="px-3 py-2 bg-zinc-900 rounded-lg text-xs font-semibold text-white hover:bg-zinc-800">
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
