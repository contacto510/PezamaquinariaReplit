import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWebRequest, webhookAuthorized, invalidWebRequestFields } from "./web-requests";

const common = {
  submission_id: "test-form-unique-001",
  nombre: "Contacto de prueba",
  telefono: "8100000000",
  correo: "",
  municipio: "Monterrey",
  equipo: "Generador",
  mensaje: "Solicitud de prueba",
  pagina_url: "https://sd.pezamaquinaria.com.mx/servicios/?utm_source=prueba",
};

test("renta excluye los campos de reparación y el honeypot", () => {
  const parsed = parseWebRequest({
    ...common, tipo_solicitud: ["cotizacion_renta"], cantidad_equipos: "2",
    dias_renta: "7", entrega: "entrega_obra", fecha_requerida: "2026-12-01",
    marca_modelo: "NO importar", falla_reportada: "NO importar", hp_check: "",
  });
  assert.equal(parsed.tipo_solicitud, "cotizacion_renta");
  assert.equal("hp_check" in parsed, false);
  assert.equal("falla_reportada" in parsed, false);
  assert.equal("marca_modelo" in parsed, false);
  assert.equal(parsed.pagina_url, "https://sd.pezamaquinaria.com.mx/servicios/");
});
test("reparación excluye valores viejos de renta aunque sean inválidos", () => {
  const parsed = parseWebRequest({ ...common, tipo_solicitud: "reparacion", marca_modelo: "Modelo prueba", falla_reportada: "No enciende", dias_renta: -1, cantidad_equipos: "texto", entrega: "otro" });
  assert.equal("dias_renta" in parsed, false);
  assert.equal("cantidad_equipos" in parsed, false);
  assert.equal("entrega" in parsed, false);
});
test("ambas opciones de entrega aceptan texto y arreglo de un elemento", () => {
  for (const option of ["entrega_obra", "recoge_sucursal"]) {
    const base = { ...common, tipo_solicitud: "cotizacion_renta", cantidad_equipos: 1, dias_renta: 2 };
    assert.deepEqual(parseWebRequest({ ...base, entrega: [option] }), parseWebRequest({ ...base, entrega: option }));
  }
});
test("acepta nombres con corchetes sin alterar el contrato guardado", () => {
  const parsed = parseWebRequest({ ...common, "tipo_solicitud[]": ["cotizacion_renta"], cantidad_equipos: 1, dias_renta: 2, "entrega[]": ["entrega_obra"] });
  assert.equal(parsed.tipo_solicitud, "cotizacion_renta");
  assert.equal(parsed.tipo_solicitud === "cotizacion_renta" && parsed.entrega, "entrega_obra");
  assert.equal("entrega[]" in parsed, false);
  assert.equal("tipo_solicitud[]" in parsed, false);
});
test("rechaza entregas ambiguas, vacías, inválidas o contradictorias", () => {
  const base = { ...common, tipo_solicitud: "cotizacion_renta", cantidad_equipos: 1, dias_renta: 2 };
  for (const entrega of [[], ["entrega_obra", "recoge_sucursal"], ["otra"], [["entrega_obra"]]]) {
    assert.throws(() => parseWebRequest({ ...base, entrega }));
  }
  assert.throws(() => parseWebRequest({ ...base, entrega: "entrega_obra", "entrega[]": ["recoge_sucursal"] }));
  assert.throws(() => parseWebRequest({ ...base, entrega: "entrega_obra", "tipo_solicitud[]": ["reparacion"] }));
});
test("reparación ignora incluso opciones de entrega contradictorias que quedaron ocultas", () => {
  const parsed = parseWebRequest({ ...common, tipo_solicitud: ["reparacion"], falla_reportada: "No enciende", entrega: ["entrega_obra"], "entrega[]": ["recoge_sucursal"] });
  assert.equal("entrega" in parsed, false);
  assert.equal("entrega[]" in parsed, false);
});
test("no genera automáticamente el identificador y devuelve solo nombres de campos inválidos", () => {
  const { submission_id, ...withoutId } = common;
  try {
    parseWebRequest({ ...withoutId, tipo_solicitud: "reparacion", falla_reportada: "No enciende" });
    assert.fail("Debe rechazar un envío sin identificador");
  } catch (error) {
    assert.deepEqual(invalidWebRequestFields(error), ["submission_id"]);
    assert.equal(JSON.stringify(invalidWebRequestFields(error)).includes(common.nombre), false);
  }
  assert.equal(invalidWebRequestFields(new Error("Error interno")), null);
});
test("rechaza tipos ambiguos y campos requeridos faltantes", () => {
  assert.throws(() => parseWebRequest({ ...common, tipo_solicitud: ["reparacion", "cotizacion_renta"] }));
  assert.throws(() => parseWebRequest({ ...common, tipo_solicitud: "reparacion" }));
  assert.throws(() => parseWebRequest({ ...common, tipo_solicitud: "otro" }));
});
test("rechaza cantidades no positivas y correos inválidos", () => {
  const payload = { ...common, tipo_solicitud: "cotizacion_renta", cantidad_equipos: 1, dias_renta: 1, entrega: "recoge_sucursal" };
  assert.throws(() => parseWebRequest({ ...payload, dias_renta: 0 }));
  assert.throws(() => parseWebRequest({ ...payload, cantidad_equipos: 1.5 }));
  assert.throws(() => parseWebRequest({ ...payload, correo: "no-es-correo" }));
});
test("rechaza origen externo o sin HTTPS", () => {
  const payload = { ...common, tipo_solicitud: "reparacion", falla_reportada: "Revisar" };
  assert.throws(() => parseWebRequest({ ...payload, pagina_url: "https://otro.example/" }));
  assert.throws(() => parseWebRequest({ ...payload, pagina_url: "http://sd.pezamaquinaria.com.mx/" }));
});
test("credencial obligatoria y comparación exacta", () => {
  const fixture = "test-only-not-a-real-secret-000000000000";
  assert.equal(webhookAuthorized(undefined, fixture), false);
  assert.equal(webhookAuthorized(fixture, undefined), false);
  assert.equal(webhookAuthorized("incorrecta", fixture), false);
  assert.equal(webhookAuthorized(fixture, fixture), true);
  assert.equal(webhookAuthorized("corta", "corta"), false);
  assert.equal(webhookAuthorized([fixture], fixture), false);
});
