/** Shared stats helpers for measurement scripts. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function coefficientOfVariation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((acc, d) => acc + (d - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

export function summarizeDurations(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    sampleCount: sorted.length,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    coefficientOfVariation: coefficientOfVariation(durations),
  };
}

export function writeReceiptJson(evidenceDir, receipt) {
  mkdirSync(evidenceDir, { recursive: true });
  const body = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileSync(join(evidenceDir, "receipt.json"), body);
  process.stdout.write(body);
}
