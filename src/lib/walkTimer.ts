export function remainingAtDeadline(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}

export function resumeDeadline(nowMs: number, remainingMs: number): number {
  return nowMs + Math.max(0, remainingMs);
}
