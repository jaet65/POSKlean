export const PURCHASE_ORDER_CSV_TEMPLATE = 'producto,cantidad,costo_unitario\n'
  + 'Jabón líquido,10,22.75\n'
  + 'Suavizante floral,5,19.00\n';

const HEADER_ALIASES = {
  producto: 'name',
  nombre: 'name',
  cantidad: 'qty',
  qty: 'qty',
  costo: 'unitCost',
  costounitario: 'unitCost',
  preciounitario: 'unitCost',
  preciocompra: 'unitCost',
};

const normalizeHeader = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z]/g, '');

function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

function parseNumber(value) {
  const text = String(value ?? '').trim().replace(/[$\s]/g, '');
  if (!text) return NaN;
  return Number(text.includes('.') ? text : text.replace(',', '.'));
}

export function parsePurchaseOrderCsv(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const table = parseRows(text, delimiter);
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'El archivo no tiene filas de datos.' }] };

  const columns = table[0].map((header) => HEADER_ALIASES[normalizeHeader(header)] || null);
  if (!columns.includes('name') || !columns.includes('qty') || !columns.includes('unitCost')) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Faltan columnas obligatorias: producto, cantidad y costo_unitario.' }],
    };
  }

  const rows = [];
  const errors = [];
  const seen = new Set();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const record = {};
    columns.forEach((field, position) => {
      if (field) record[field] = (cells[position] || '').trim();
    });
    const qty = parseNumber(record.qty);
    const unitCost = parseNumber(record.unitCost);
    const key = String(record.name || '').trim().toLocaleLowerCase('es-MX');
    let message = '';
    if (!key || key.length > 120) message = 'Producto vacío o mayor a 120 caracteres.';
    else if (!Number.isFinite(qty) || qty <= 0 || qty >= 1000000 || Math.round(qty * 100) / 100 !== qty) message = 'Cantidad inválida (mayor a 0, máximo dos decimales).';
    else if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost >= 10000000 || Math.round(unitCost * 100) / 100 !== unitCost) message = 'Costo inválido (no negativo, máximo dos decimales).';
    else if (seen.has(key)) message = 'Producto repetido en el archivo.';
    if (message) {
      errors.push({ line, message });
      return;
    }
    seen.add(key);
    rows.push({ line, name: record.name.trim(), qty, unitCost });
  });

  if (rows.length > 50) {
    rows.slice(50).forEach((row) => errors.push({ line: row.line, message: 'Una orden admite máximo 50 productos.' }));
    rows.length = 50;
  }
  return { rows, errors };
}