// Mock in-memory data for FamilyMed MVP.
// Persisted to localStorage via the store provider.

export type Role = "paziente" | "caregiver" | "admin" | "medico";

export type Patient = {
  id: string;
  name: string;
  photo?: string;
  birthYear: number;
  caregiverIds: string[];
};

export type Caregiver = {
  id: string;
  name: string;
  relation: string;
  photo?: string;
  patientIds: string[];
  notify: { push: boolean; email: boolean; whatsapp: boolean };
};

export type Recurrence =
  | { kind: "daily" }
  | { kind: "weekdays" }
  | { kind: "weekend" }
  | { kind: "every_x_days"; x: number }
  | { kind: "specific_days"; days: number[] /* 0=Sun..6=Sat */ };

export type Therapy = {
  id: string;
  patientId: string;
  name: string;
  dosage: string; // "100mg"
  quantity: number; // pills per dose
  category: string;
  color: string; // css color / token key
  icon: string;
  notes?: string;
  startDate: string; // ISO date
  endDate?: string;
  times: string[]; // ["08:00","13:00"]
  recurrence: Recurrence;
  timeoutMinutes: number;
  reminderIntervals: number[]; // minutes after scheduled time
  packs: number;
  pillsPerPack: number;
  pillsRemaining: number;
  lowStockThreshold: number;
  active: boolean;
  suspended: boolean;
};

export type DoseStatus =
  | "scheduled" // future
  | "due" // window open, not confirmed
  | "reminder" // reminder sent
  | "late" // past timeout, still not confirmed
  | "taken"
  | "skipped";

export type MedicationEvent = {
  id: string;
  therapyId: string;
  patientId: string;
  scheduledAt: string; // ISO datetime for the dose
  status: DoseStatus;
  confirmedAt?: string;
  confirmedBy?: string;
  note?: string;
  timeline: { at: string; kind: string; message: string }[];
};

export type Notification = {
  id: string;
  createdAt: string;
  patientId?: string;
  severity: "info" | "warning" | "alert";
  title: string;
  message: string;
  read: boolean;
};

export type FamilyMedData = {
  currentRole: Role;
  currentPatientId: string; // active patient (for patient view)
  currentCaregiverId: string;
  patients: Patient[];
  caregivers: Caregiver[];
  therapies: Therapy[];
  events: MedicationEvent[];
  notifications: Notification[];
  settings: {
    language: "it" | "en";
    theme: "light" | "dark";
    timezone: string;
    reminderVolume: number;
  };
};

const todayIso = (h: number, m: number = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export const initialData: FamilyMedData = {
  currentRole: "caregiver",
  currentPatientId: "p1",
  currentCaregiverId: "c1",

  patients: [
    {
      id: "p1",
      name: "Mario Rossi",
      birthYear: 1942,
      caregiverIds: ["c1", "c2"],
    },
    {
      id: "p2",
      name: "Lucia Bianchi",
      birthYear: 1948,
      caregiverIds: ["c1"],
    },
  ],

  caregivers: [
    {
      id: "c1",
      name: "Elena Rossi",
      relation: "Figlia",
      patientIds: ["p1", "p2"],
      notify: { push: true, email: true, whatsapp: true },
    },
    {
      id: "c2",
      name: "Giulia Rossi",
      relation: "Nipote",
      patientIds: ["p1"],
      notify: { push: true, email: false, whatsapp: true },
    },
  ],

  therapies: [
    {
      id: "t1",
      patientId: "p1",
      name: "Cardioaspirina",
      dosage: "100mg",
      quantity: 1,
      category: "Cardiologia",
      color: "accent",
      icon: "heart",
      notes: "Assumere dopo colazione",
      startDate: daysAgoIso(60),
      times: ["08:00"],
      recurrence: { kind: "daily" },
      timeoutMinutes: 45,
      reminderIntervals: [15, 30, 45],
      packs: 1,
      pillsPerPack: 30,
      pillsRemaining: 6,
      lowStockThreshold: 10,
      active: true,
      suspended: false,
    },
    {
      id: "t2",
      patientId: "p1",
      name: "Metformina",
      dosage: "500mg",
      quantity: 1,
      category: "Diabete",
      color: "primary",
      icon: "pill",
      notes: "Con i pasti",
      startDate: daysAgoIso(120),
      times: ["08:00", "13:00", "20:00"],
      recurrence: { kind: "daily" },
      timeoutMinutes: 60,
      reminderIntervals: [15, 30],
      packs: 2,
      pillsPerPack: 60,
      pillsRemaining: 84,
      lowStockThreshold: 20,
      active: true,
      suspended: false,
    },
    {
      id: "t3",
      patientId: "p1",
      name: "Pantoprazolo",
      dosage: "20mg",
      quantity: 1,
      category: "Gastro",
      color: "chart-3",
      icon: "shield",
      notes: "A digiuno, 30 min prima di colazione",
      startDate: daysAgoIso(30),
      times: ["07:30"],
      recurrence: { kind: "daily" },
      timeoutMinutes: 60,
      reminderIntervals: [15, 30],
      packs: 1,
      pillsPerPack: 28,
      pillsRemaining: 14,
      lowStockThreshold: 10,
      active: true,
      suspended: false,
    },
    {
      id: "t4",
      patientId: "p1",
      name: "Vitamina D",
      dosage: "10 gocce",
      quantity: 1,
      category: "Integratori",
      color: "warning",
      icon: "sun",
      startDate: daysAgoIso(90),
      times: ["09:00"],
      recurrence: { kind: "specific_days", days: [1] }, // lunedì
      timeoutMinutes: 120,
      reminderIntervals: [30, 60],
      packs: 1,
      pillsPerPack: 30,
      pillsRemaining: 22,
      lowStockThreshold: 5,
      active: true,
      suspended: false,
    },
    {
      id: "t5",
      patientId: "p2",
      name: "Ramipril",
      dosage: "5mg",
      quantity: 1,
      category: "Cardiologia",
      color: "primary",
      icon: "heart",
      startDate: daysAgoIso(45),
      times: ["09:00", "21:00"],
      recurrence: { kind: "daily" },
      timeoutMinutes: 60,
      reminderIntervals: [15, 30, 60],
      packs: 1,
      pillsPerPack: 28,
      pillsRemaining: 18,
      lowStockThreshold: 10,
      active: true,
      suspended: false,
    },
    {
      id: "t6",
      patientId: "p2",
      name: "Levotiroxina",
      dosage: "50mcg",
      quantity: 1,
      category: "Tiroide",
      color: "chart-5",
      icon: "leaf",
      notes: "A digiuno, non prendere caffè per 30 min",
      startDate: daysAgoIso(200),
      times: ["07:00"],
      recurrence: { kind: "daily" },
      timeoutMinutes: 30,
      reminderIntervals: [10, 20],
      packs: 1,
      pillsPerPack: 50,
      pillsRemaining: 32,
      lowStockThreshold: 10,
      active: true,
      suspended: false,
    },
  ],

  events: [
    // Today for p1
    {
      id: "e1",
      therapyId: "t3",
      patientId: "p1",
      scheduledAt: todayIso(7, 30),
      status: "taken",
      confirmedAt: todayIso(7, 42),
      confirmedBy: "p1",
      timeline: [
        { at: todayIso(7, 30), kind: "scheduled", message: "Dose programmata" },
        { at: todayIso(7, 42), kind: "taken", message: "Confermata dal paziente" },
      ],
    },
    {
      id: "e2",
      therapyId: "t2",
      patientId: "p1",
      scheduledAt: todayIso(8, 0),
      status: "taken",
      confirmedAt: todayIso(8, 5),
      confirmedBy: "p1",
      timeline: [
        { at: todayIso(8, 0), kind: "scheduled", message: "Dose programmata" },
        { at: todayIso(8, 5), kind: "taken", message: "Confermata dal paziente" },
      ],
    },
    {
      id: "e3",
      therapyId: "t1",
      patientId: "p1",
      scheduledAt: todayIso(8, 0),
      status: "late",
      timeline: [
        { at: todayIso(8, 0), kind: "scheduled", message: "Dose programmata" },
        { at: todayIso(8, 15), kind: "reminder", message: "Reminder push inviato" },
        { at: todayIso(8, 30), kind: "reminder", message: "Secondo reminder" },
        { at: todayIso(8, 45), kind: "whatsapp", message: "WhatsApp inviato al paziente" },
        { at: todayIso(9, 0), kind: "alert", message: "Timeout superato — caregiver notificati" },
      ],
    },
  ],

  notifications: [
    {
      id: "n1",
      createdAt: todayIso(9, 0),
      patientId: "p1",
      severity: "alert",
      title: "Timeout terapia Cardioaspirina",
      message: "Mario non ha confermato la dose delle 08:00.",
      read: false,
    },
    {
      id: "n2",
      createdAt: todayIso(7, 0),
      patientId: "p1",
      severity: "warning",
      title: "Scorta bassa: Cardioaspirina",
      message: "Restano 6 compresse (~6 giorni di autonomia).",
      read: false,
    },
    {
      id: "n3",
      createdAt: todayIso(8, 5),
      patientId: "p1",
      severity: "info",
      title: "Metformina confermata",
      message: "Presa alle 08:05.",
      read: true,
    },
  ],

  settings: {
    language: "it",
    theme: "light",
    timezone: "Europe/Rome",
    reminderVolume: 70,
  },
};
