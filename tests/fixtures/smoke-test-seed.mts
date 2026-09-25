import { createAndAuthenticateUser, teardownTestEnvironment, setupTestEnvironment } from "./seed-test-users.js";

const tag = Date.now();
console.log("=== SMOKE TEST: createAndAuthenticateUser ===");
try {
  const u = await createAndAuthenticateUser(
    `smoke_${tag}@test.local`,
    "Password123!",
    "caregiver",
    "Smoke Test User",
  );
  console.log("✅ Utente creato:", u.userId, u.email);
} catch (e: unknown) {
  console.error("❌ ERRORE createAndAuthenticateUser:", (e as Error).message);
}

console.log("\n=== SMOKE TEST: setupTestEnvironment ===");
try {
  const env = await setupTestEnvironment();
  console.log("✅ Ambiente pronto. patientId=", env.patientId);
  await teardownTestEnvironment(env);
  console.log("✅ Teardown completato.");
} catch (e: unknown) {
  console.error("❌ ERRORE setupTestEnvironment:", (e as Error).message);
}
