export function MaintenancePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-black text-foreground">
          FamilyMed è attualmente SOSPESO.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Il servizio è stato messo offline.
        </p>
      </div>
    </div>
  );
}