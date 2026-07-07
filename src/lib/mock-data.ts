// Mock in-memory data for FamilyMed MVP.
// Persisted to localStorage via the store provider.

export type Role = "paziente" | "caregiver" | "admin" | "medico";

export type Patient = {
  id: string;
  name: string;
  photo?: string;
  birthYear?: number;
  caregiverIds: string[];
  userId?: string;
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
  reminderIntervals: number[]; // minuti prima dell'orario programmato
  packs: number;
  pillsPerPack: number;
  pillsRemaining: number;
  lowStockThreshold: number;
  active: boolean;
  suspended: boolean;
  photoDrug?: string; // base64 dataURL della pastiglia/farmaco
  photoPackage?: string; // base64 dataURL della confezione
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
  currentPatientId: "",
  currentCaregiverId: "",

  patients: [],
  caregivers: [],
  therapies: [],
  events: [],
  notifications: [],

  settings: {
    language: "it",
    theme: "light",
    timezone: "Europe/Rome",
    reminderVolume: 70,
  },
};
