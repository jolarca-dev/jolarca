/**
 * Test user factory — unique emails per run keep parallel workers isolated
 * and make API cleanup addressable. Password meets the strength meter's
 * floor (see src/lib/password-strength.ts).
 */
export interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "buyer" | "seller";
}

let sequence = 0;

export function makeTestUser(role: "buyer" | "seller" = "buyer"): TestUser {
  sequence += 1;
  const stamp = `${Date.now()}-${sequence}-${Math.floor(Math.random() * 1e6)}`;
  return {
    email: `e2e-${role}-${stamp}@example.com`,
    password: `E2e-Test-${stamp}!x`,
    firstName: role === "seller" ? "Saulė" : "Ona",
    lastName: "Testauskienė",
    role,
  };
}
