// Pure password-strength logic — single source of truth for the rules the UI
// shows and the forms gate on. Kept framework-free so it's unit-testable.

export type PasswordChecks = {
  length: boolean;
  letter: boolean;
  number: boolean;
  score: number; // 0..4
  valid: boolean;
};

export function passwordChecks(v: string): PasswordChecks {
  const length = v.length >= 8;
  const letter = /[a-zA-Z]/.test(v);
  const number = /\d/.test(v);
  const symbol = /[^a-zA-Z0-9]/.test(v);
  const long = v.length >= 12;
  const score = [length, letter, number, symbol || long].filter(Boolean).length;
  return { length, letter, number, score, valid: length && letter && number };
}
