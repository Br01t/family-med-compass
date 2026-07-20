import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { GuidaContent } from "@/components/guida/GuidaContent";

export const Route = createFileRoute("/guida")({
  head: () => ({
    meta: [
      { title: "Guida — FamilyMed" },
      {
        name: "description",
        content:
          "Come funziona FamilyMed: guida completa per caregiver e pazienti, incluso il collegamento sicuro della famiglia e la protezione dei dati.",
      },
    ],
  }),
  component: GuidaPage,
});

function GuidaPage() {
  return (
    <AppShell
      title="Guida all'app"
      subtitle="Come funziona FamilyMed — tutto quello che devi sapere"
    >
      <GuidaContent />
    </AppShell>
  );
}