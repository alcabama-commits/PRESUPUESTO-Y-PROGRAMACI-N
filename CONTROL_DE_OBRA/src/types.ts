export interface Task {
  id: string;
  code: string; // e.g., "1.1", "1.2.1"
  name: string;
  startDate: string; // ISO format
  endDate: string;   // ISO format
  unit: string;      // e.g., "m2", "m3", "kg", "glb"
  quantity: number;
  unitPrice: number;
  budgetedCost: number; // quantity * unitPrice
  actualCost: number;
  progress: number; // 0 to 100
  category: 'Preliminares' | 'Estructura' | 'Acabados' | 'Instalaciones' | 'Otros';
  dependencies?: string[];
  isMilestone?: boolean;
  isChapter?: boolean; // To distinguish between a grouping chapter and a leaf activity
}

export interface ProjectData {
  projectName: string;
  tasks: Task[];
}

export const INITIAL_DATA: ProjectData = {
  projectName: "Kennedy Haus 08",
  tasks: [
    {
      id: "c1",
      code: "1",
      name: "PRELIMINARES",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      unit: "GLB",
      quantity: 1,
      unitPrice: 0,
      budgetedCost: 2500,
      actualCost: 1200,
      progress: 48,
      category: 'Preliminares',
      isChapter: true
    },
    {
      id: "1.1",
      code: "1.1",
      name: "Limpieza y Descapote",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      unit: "m2",
      quantity: 150,
      unitPrice: 10,
      budgetedCost: 1500,
      actualCost: 1200,
      progress: 100,
      category: 'Preliminares'
    },
    {
      id: "1.2",
      code: "1.2",
      name: "Cerramiento Provisional",
      startDate: "2026-04-06",
      endDate: "2026-04-10",
      unit: "ml",
      quantity: 50,
      unitPrice: 20,
      budgetedCost: 1000,
      actualCost: 0,
      progress: 0,
      category: 'Preliminares'
    },
    {
      id: "c2",
      code: "2",
      name: "CIMENTACIÓN Y ESTRUCTURA",
      startDate: "2026-04-11",
      endDate: "2026-05-15",
      unit: "GLB",
      quantity: 1,
      unitPrice: 0,
      budgetedCost: 20000,
      actualCost: 4500,
      progress: 22.5,
      category: 'Estructura',
      isChapter: true
    },
    {
      id: "2.1",
      code: "2.1",
      name: "Excavación Manual",
      startDate: "2026-04-11",
      endDate: "2026-04-20",
      unit: "m3",
      quantity: 45,
      unitPrice: 100,
      budgetedCost: 4500,
      actualCost: 4500,
      progress: 100,
      category: 'Estructura'
    },
    {
      id: "2.2",
      code: "2.2",
      name: "Concreto Cimentación 3000 PSI",
      startDate: "2026-04-21",
      endDate: "2026-05-05",
      unit: "m3",
      quantity: 25,
      unitPrice: 420,
      budgetedCost: 10500,
      actualCost: 0,
      progress: 0,
      category: 'Estructura'
    },
    {
      id: "2.3",
      code: "2.3",
      name: "Acero de Refuerzo 60000 PSI",
      startDate: "2026-04-21",
      endDate: "2026-05-15",
      unit: "kg",
      quantity: 1250,
      unitPrice: 4,
      budgetedCost: 5000,
      actualCost: 0,
      progress: 0,
      category: 'Estructura'
    }
  ]
};
