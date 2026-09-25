import { describe, it, expect } from "vitest";
import { doseDelayMinutes, wasTakenLate } from "@/lib/therapy";
import type { ScheduledDose } from "@/lib/mock-data";

describe("Unit Tests — Logica di Somministrazione e Calcolo Ritardo Dosi", () => {
  it("doseDelayMinutes calcola correttamente i minuti di ritardo rispetto all'orario previsto", () => {
    const scheduled = new Date("2026-09-24T08:00:00Z");
    const confirmed = new Date("2026-09-24T08:25:00Z"); // 25 minuti dopo

    const dummyDose: ScheduledDose = {
      id: "dose_1",
      therapy: {
        id: "t_1",
        name: "Cardioaspirina",
        times: ["08:00"],
        recurrence: { type: "daily" },
        patientId: "p_1",
        timeoutMinutes: 30,
      } as any,
      scheduledAt: scheduled,
      status: "taken",
      event: {
        id: "ev_1",
        patientId: "p_1",
        therapyId: "t_1",
        scheduledAt: scheduled.toISOString(),
        confirmedAt: confirmed.toISOString(),
        status: "taken",
      },
    };

    const delay = doseDelayMinutes(dummyDose);
    expect(delay).toBe(25);
  });

  it("wasTakenLate identifica se la dose è stata assunta oltre il timeout consentito", () => {
    const scheduled = new Date("2026-09-24T08:00:00Z");
    // Timeout fissato a 30 minuti. Confermata 45 minuti dopo
    const lateConfirmed = new Date("2026-09-24T08:45:00Z");

    const lateDose: ScheduledDose = {
      id: "dose_late",
      therapy: {
        id: "t_1",
        name: "Cardioaspirina",
        times: ["08:00"],
        recurrence: { type: "daily" },
        patientId: "p_1",
        timeoutMinutes: 30,
      } as any,
      scheduledAt: scheduled,
      status: "taken",
      event: {
        id: "ev_2",
        patientId: "p_1",
        therapyId: "t_1",
        scheduledAt: scheduled.toISOString(),
        confirmedAt: lateConfirmed.toISOString(),
        status: "taken",
      },
    };

    expect(wasTakenLate(lateDose)).toBe(true);

    // Dose confermata in orario (10 minuti dopo, timeout è 30)
    const onTimeConfirmed = new Date("2026-09-24T08:10:00Z");
    const onTimeDose = {
      ...lateDose,
      event: {
        ...lateDose.event!,
        confirmedAt: onTimeConfirmed.toISOString(),
      },
    };

    expect(wasTakenLate(onTimeDose)).toBe(false);
  });
});
