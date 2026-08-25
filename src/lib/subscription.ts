export type SubscriptionPlan = "free" | "pro" | "max";

export interface PlanLimits {
  name: string;
  badge: string;
  priceMonth: number;
  priceYear: number;
  maxPatients: number;
  maxCaregiversPerPatient: number; // Titolare + invitati (Free: 1, Pro: 4, Max: 5)
  maxActiveTherapiesPerPatient: number; // Free: 3, Pro/Max: Illimitate (Infinity)
  multipleReminders: boolean;
  medicationPhoto: boolean;
  historyDaysLimit: number; // Free: 7, Pro/Max: Infinity
  adherenceStats: boolean;
  vitalParameters: boolean;
  stockMovements: boolean;
  stockDepletionPrediction: boolean;
  pdfExport: boolean;
  pdfAggregatedExport: boolean; // Solo Max
  granularPermissions: boolean; // Pro & Max
  auditLog: boolean; // Solo Max
  gdprExport: boolean; // Sempre true
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    name: "Free",
    badge: "Gratuito",
    priceMonth: 0,
    priceYear: 0,
    maxPatients: 1,
    maxCaregiversPerPatient: 1, // Solo il titolare
    maxActiveTherapiesPerPatient: 3,
    multipleReminders: false,
    medicationPhoto: false,
    historyDaysLimit: 7,
    adherenceStats: false,
    vitalParameters: false,
    stockMovements: false,
    stockDepletionPrediction: false,
    pdfExport: false,
    pdfAggregatedExport: false,
    granularPermissions: false,
    auditLog: false,
    gdprExport: true,
  },
  pro: {
    name: "Pro",
    badge: "Consigliato per famiglie",
    priceMonth: 4.99,
    priceYear: 39.99,
    maxPatients: 2,
    maxCaregiversPerPatient: 5, // Titolare + 4 invitati (totale 5)
    maxActiveTherapiesPerPatient: Infinity,
    multipleReminders: true,
    medicationPhoto: true,
    historyDaysLimit: Infinity,
    adherenceStats: true,
    vitalParameters: true,
    stockMovements: true,
    stockDepletionPrediction: true,
    pdfExport: true,
    pdfAggregatedExport: false,
    granularPermissions: true,
    auditLog: false,
    gdprExport: true,
  },
  max: {
    name: "Max",
    badge: "Gruppi di cura e famiglie estese",
    priceMonth: 9.99,
    priceYear: 79.99,
    maxPatients: 10,
    maxCaregiversPerPatient: 10, // Titolare + 9 invitati (totale 10)
    maxActiveTherapiesPerPatient: Infinity,
    multipleReminders: true,
    medicationPhoto: true,
    historyDaysLimit: Infinity,
    adherenceStats: true,
    vitalParameters: true,
    stockMovements: true,
    stockDepletionPrediction: true,
    pdfExport: true,
    pdfAggregatedExport: true,
    granularPermissions: true,
    auditLog: true,
    gdprExport: true,
  },
};

export function getPlanLimits(plan?: SubscriptionPlan | null): PlanLimits {
  if (!plan || !PLAN_LIMITS[plan]) {
    return PLAN_LIMITS.free;
  }
  return PLAN_LIMITS[plan];
}

export function canAccessFeature(
  plan: SubscriptionPlan | null | undefined,
  feature: keyof Omit<
    PlanLimits,
    | "name"
    | "badge"
    | "priceMonth"
    | "priceYear"
    | "maxPatients"
    | "maxCaregiversPerPatient"
    | "maxActiveTherapiesPerPatient"
    | "historyDaysLimit"
  >
): boolean {
  const limits = getPlanLimits(plan);
  return Boolean(limits[feature]);
}

export function formatPrice(price: number): string {
  if (price === 0) return "0 €";
  return `${price.toFixed(2).replace(".", ",")} €`;
}
