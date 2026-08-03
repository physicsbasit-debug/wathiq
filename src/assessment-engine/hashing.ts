function normalizeForStableJson(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return null;
  if (Array.isArray(value)) return value.map((entry) => normalizeForStableJson(entry, seen));
  if (typeof value === "object") {
    if (seen.has(value)) throw new Error("لا يمكن حساب بصمة لكائن دائري.");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (typeof entry === "undefined" || typeof entry === "function" || typeof entry === "symbol") continue;
      normalized[key] = normalizeForStableJson(entry, seen);
    }
    seen.delete(value);
    return normalized;
  }
  return null;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value, new WeakSet<object>()));
}

export function stableHash64(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function deterministicNumericSeed(value: unknown): number {
  const hash = stableHash64(value);
  return Number.parseInt(hash.slice(-8), 16) >>> 0;
}
