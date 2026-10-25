import { test } from "node:test";
import assert from "node:assert/strict";
import { repairFormSchema } from "./schema";

const base = { clientName: "Cliente de prueba", equipment: "Generador" };
const keys = ["image1", "image2", "image3"] as const;

test("crear reparación con cero, una, dos o tres fotos", () => {
  // Cubre cualquier posición vacía, no solo la tercera foto.
  for (let mask = 0; mask < 8; mask++) {
    const payload = {
      ...base,
      ...Object.fromEntries(keys.map((key, i) => [
        key, mask & (1 << i) ? `/public/repairs/test-${i}.jpg` : null,
      ])),
    };
    const parsed = repairFormSchema.parse(payload);
    for (const key of keys) assert.equal(parsed[key], payload[key]);
  }
});

test("una foto omitida se distingue de eliminarla explícitamente", () => {
  const omitted = repairFormSchema.parse(base);
  for (const key of keys) {
    assert.equal(omitted[key], undefined);
    assert.equal(Object.hasOwn(omitted, key), false);
    assert.equal(repairFormSchema.parse({ ...base, [key]: null })[key], null);
    assert.equal(repairFormSchema.parse({ ...base, [key]: "" })[key], "");
  }
});

test("rechazar imágenes con tipos inválidos y mantener campos requeridos", () => {
  for (const key of keys) {
    for (const value of [123, true, {}, []]) {
      const result = repairFormSchema.safeParse({ ...base, [key]: value });
      assert.equal(result.success, false);
      if (!result.success) assert.deepEqual(result.error.issues[0].path, [key]);
    }
  }
  assert.equal(repairFormSchema.safeParse({ ...base, equipment: "" }).success, false);
});