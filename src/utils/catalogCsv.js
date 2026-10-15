export const CSV_TEMPLATE = 'nombre,categoria,unidad,precio_compra,stock_minimo,proveedor\n'
  + 'Jabón líquido,Jabón,L,22.75,10,Proveedor Ejemplo\n'
  + 'Suavizante floral,Suavizante,L,19,10,Proveedor Ejemplo\n';

// Mismo criterio que el catálogo: 50% de margen sobre la venta.
const suggestedSalePrice = (cost) => Math.round((cost / 0.5) * 100) / 100;

const HEADER_ALIASES = {
  nombre: 'name',
  producto: 'name',
  categoria: 'category',
  unidad: 'unit',
  preciocompra: 'cost',
  costo: 'cost',
  compra: 'cost',
  precioventa: 'price',
  stockminimo: 'minStock',
  minimo: 'minStock',
  proveedor: 'supplier',
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
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
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
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

const parseNumber = (value) => {
  const text = String(value ?? '').trim().replace(/[$\s]/g, '');
  if (text === '') return NaN;
  return Number(text.includes('.') ? text : text.replace(',', '.'));
};

// Devuelve { rows: [{ line, name, category, unit, price, minStock }], errors: [{ line, message }] }.
// El proveedor (opcional) se enlaza por nombre con los proveedores activos.
export function parseCatalogCsv(rawText, suppliers = []) {
  const supplierByName = new Map(suppliers
    .filter((supplier) => supplier.status !== 'archived')
    .map((supplier) => [String(supplier.name || '').trim().toLocaleLowerCase('es-MX'), supplier]));
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const table = parseRows(text, delimiter);
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'El archivo no tiene filas de datos.' }] };

  const columns = table[0].map((header) => HEADER_ALIASES[normalizeHeader(header)] || null);
  const missing = ['name', 'category', 'cost'].filter((field) => !columns.includes(field));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Faltan columnas obligatorias: nombre, categoria y precio_compra.' }],
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
    const cost = parseNumber(record.cost);
    const hasPrice = Boolean(record.price);
    const price = hasPrice ? parseNumber(record.price) : suggestedSalePrice(cost);
    const minStock = record.minStock ? parseNumber(record.minStock) : 0;
    const key = (record.name || '').toLocaleLowerCase('es-MX');
    const supplier = record.supplier ? supplierByName.get(record.supplier.toLocaleLowerCase('es-MX')) : null;
    let message = '';
    if (!record.name || record.name.length > 120) message = 'Nombre vacío o mayor a 120 caracteres.';
    else if (record.supplier && !supplier) message = `Proveedor "${record.supplier}" no existe o está archivado.`;
    else if (!record.category || record.category.length > 60) message = 'Categoría vacía o mayor a 60 caracteres.';
    else if ((record.unit || '').length > 10) message = 'La unidad admite máximo 10 caracteres.';
    else if (!Number.isFinite(cost) || cost <= 0 || Math.round(cost * 100) / 100 !== cost) message = 'Precio de compra inválido (mayor a 0, máximo dos decimales).';
    else if (!Number.isFinite(price) || price <= 0 || Math.round(price * 100) / 100 !== price) message = 'Precio de venta inválido (mayor a 0, máximo dos decimales).';
    else if (!Number.isFinite(minStock) || minStock < 0 || Math.round(minStock * 100) / 100 !== minStock) message = 'Stock mínimo inválido.';
    else if (seen.has(key)) message = 'Nombre repetido en el archivo.';
    if (message) {
      errors.push({ line, message });
      return;
    }
    seen.add(key);
    rows.push({
      line,
      name: record.name,
      category: record.category,
      unit: record.unit || 'L',
      cost,
      price,
      minStock,
      supplierId: supplier?.id || null,
      supplierName: supplier?.name || '',
    });
  });
  return { rows, errors };
}
