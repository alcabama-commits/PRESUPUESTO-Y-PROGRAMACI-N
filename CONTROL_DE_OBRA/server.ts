import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

type SubItem = {
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

type Item = {
  id: string;
  descripcion: string;
  sub_items?: SubItem[];
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

type Capitulo = {
  nombre: string;
  items: Item[];
  startDate?: string;
  endDate?: string;
  progress?: number;
  dependencies?: string[];
  isMilestone?: boolean;
};

type TaskMeta = {
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

type ItemsObraRoot = {
  presupuesto_obra_bogota?: Record<string, Capitulo>;
  meta?: Record<string, TaskMeta>;
};

type Category = 'Preliminares' | 'Estructura' | 'Acabados' | 'Instalaciones' | 'Otros';

type Task = {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  budgetedCost: number;
  actualCost: number;
  progress: number;
  category: Category;
  dependencies?: string[];
  isMilestone?: boolean;
  isChapter?: boolean;
};

type ProjectData = {
  projectName: string;
  tasks: Task[];
};

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE_PATH = path.resolve(__dirname, 'ITEMS_OBRA.json');
const PORT = Number.parseInt(process.env.PORT ?? '5176', 10);

const DEFAULT_START_TIME = '07:00';
const DEFAULT_END_TIME = '17:00';

function asISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function ensureTime(iso: string | undefined, isEnd: boolean) {
  if (!iso) return undefined;
  if (iso.includes('T')) return iso;
  return `${iso}T${isEnd ? DEFAULT_END_TIME : DEFAULT_START_TIME}`;
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function inferCategoryFromChapterName(chapterName: string): Category {
  const n = normalizeText(chapterName);
  if (n.includes('prelim')) return 'Preliminares';
  if (n.includes('ciment') || n.includes('estruct') || n.includes('acero')) return 'Estructura';
  if (n.includes('instal') || n.includes('electr') || n.includes('hidro') || n.includes('gas')) {
    return 'Instalaciones';
  }
  if (n.includes('acab') || n.includes('mampost') || n.includes('panet') || n.includes('pintur')) {
    return 'Acabados';
  }
  return 'Otros';
}

function parseChapterNumber(chapterKey: string) {
  const match = chapterKey.match(/capitulo_(\d+)/i);
  if (!match) return Number.NaN;
  return Number.parseInt(match[1], 10);
}

function inferChapterCode(chapterKey: string, chapter: Capitulo) {
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
}

function buildProjectFromItemsObra(itemsObra: ItemsObraRoot): ProjectData {
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

  for (const [chapterKey, chapter] of chapterEntries) {
    let chapterCode = inferChapterCode(chapterKey, chapter);
    if (usedChapterCodes.has(chapterCode)) {
      chapterCode = `${chapterCode}_${chapterKey}`;
    }
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

  return {
    projectName: 'Kennedy Haus 08',
    tasks,
  };
}

const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/api/project', async (_req, res) => {
  try {
    const raw = await fs.readFile(DATA_FILE_PATH, 'utf-8');
    const json = JSON.parse(raw) as ItemsObraRoot;
    res.json(buildProjectFromItemsObra(json));
  } catch (error) {
    res.status(500).json({
      error: 'No se pudo leer o transformar ITEMS_OBRA.json.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/project', async (req, res) => {
  try {
    const incoming = req.body as ProjectData;
    const raw = await fs.readFile(DATA_FILE_PATH, 'utf-8');
    const json = JSON.parse(raw) as ItemsObraRoot;
    const meta = json.meta ?? {};
    const presupuesto = json.presupuesto_obra_bogota ?? {};

    const chapterKeyByCode = new Map<string, string>();
    const usedChapterCodes = new Set<string>();
    for (const [chapterKey, chapter] of Object.entries(presupuesto)) {
      let chapterCode = inferChapterCode(chapterKey, chapter);
      if (usedChapterCodes.has(chapterCode)) {
        chapterCode = `${chapterCode}_${chapterKey}`;
      }
      usedChapterCodes.add(chapterCode);
      chapterKeyByCode.set(chapterCode, chapterKey);
    }

    const schedule = (t: Task) => ({
      startDate: t.startDate,
      endDate: t.endDate,
      unit: t.unit,
      quantity: t.quantity,
      unitPrice: t.unitPrice,
      budgetedCost: t.budgetedCost,
      actualCost: t.actualCost,
      progress: t.progress,
      dependencies: t.dependencies,
      isMilestone: t.isMilestone,
    });

    const findItem = (id: string) => {
      for (const chapter of Object.values(presupuesto)) {
        const hit = (chapter.items ?? []).find((it) => it.id === id);
        if (hit) return hit;
      }
      return null;
    };

    for (const t of incoming.tasks) {
      meta[t.code] = schedule(t);

      const chapterKey = chapterKeyByCode.get(t.code);
      if (chapterKey) {
        const chapter = presupuesto[chapterKey];
        if (chapter) Object.assign(chapter, schedule(t));
        continue;
      }

      if (!t.code.includes('.')) continue;

      const parts = t.code.split('.');
      if (parts.length === 2) {
        const item = findItem(t.code);
        if (item) Object.assign(item, schedule(t));
        continue;
      }

      const tail = parts[parts.length - 1]!;
      const idx = Number.parseInt(tail, 10);
      const parentId = parts.slice(0, -1).join('.');
      if (Number.isFinite(idx) && idx >= 1) {
        const item = findItem(parentId);
        const sub = item?.sub_items?.[idx - 1];
        if (sub) Object.assign(sub, schedule(t));
        else if (item) Object.assign(item, schedule(t));
      } else {
        const item = findItem(t.code);
        if (item) Object.assign(item, schedule(t));
      }
    }
    json.meta = meta;
    json.presupuesto_obra_bogota = presupuesto;
    const next = JSON.stringify(json, null, 2);
    await fs.writeFile(DATA_FILE_PATH, next, 'utf-8');
    res.json({ ok: true, saved: incoming.tasks.length });
  } catch (error) {
    res.status(500).json({
      error: 'No se pudo escribir ITEMS_OBRA.json.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}`);
  console.log(`Fuente: ${DATA_FILE_PATH}`);
});
