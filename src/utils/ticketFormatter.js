import { formatCurrency } from './currency';

/**
 * Centra una cadena de texto en un ancho dado.
 */
function centerText(text, width = 42) {
  const str = String(text || '').trim();
  if (str.length >= width) return str.slice(0, width);
  const leftPad = Math.floor((width - str.length) / 2);
  const rightPad = width - str.length - leftPad;
  return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
}

/**
 * Formatea una fila de 2 columnas (izquierda y derecha alineadas).
 */
function twoColumns(left, right, width = 42) {
  const lStr = String(left || '');
  const rStr = String(right || '');
  const spaceNeeded = width - lStr.length - rStr.length;
  if (spaceNeeded <= 0) {
    return `${lStr}\n${' '.repeat(Math.max(0, width - rStr.length))}${rStr}`;
  }
  return `${lStr}${' '.repeat(spaceNeeded)}${rStr}`;
}

/**
 * Genera una línea divisoria de caracteres.
 */
function separator(char = '-', width = 42) {
  return char.repeat(width);
}

const formatTicketDate = (value) => {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : 'Fecha no disponible';
};

/**
 * Convierte cualquier ticket de POSKlean a texto plano para impresoras térmicas.
 */
export function formatTicketToText(ticket, { receiptWidth = 80, stores = [] } = {}) {
  if (!ticket || !ticket.type) return '';
  const effectiveWidth = Number(ticket.data?.receiptWidth || receiptWidth || 80);
  const width = effectiveWidth <= 60 ? 32 : 42;
  const { type, data } = ticket;
  const lines = [];

  // Encabezado
  lines.push(centerText('NovaKlean', width));

  if (type === 'test') {
    lines.push(centerText('PRUEBA DE IMPRESIÓN', width));
    lines.push(separator('-', width));
    const storeName = stores.find((s) => s.id === data.storeId)?.name || data.storeName || 'POSKlean';
    lines.push(twoColumns('Tienda:', storeName, width));
    lines.push(twoColumns('Fecha:', data.timestamp || new Date().toLocaleString('es-MX'), width));
    lines.push(twoColumns('Impresora:', data.silent ? (data.printerName || 'Predeterminada') : 'Selección en diálogo', width));
    lines.push(twoColumns('Modo:', data.silent ? 'Silenciosa (Directa)' : 'Con Diálogo', width));
    lines.push(twoColumns('Ancho:', `${effectiveWidth} mm`, width));
    lines.push(separator('-', width));
    lines.push(centerText('¡La impresora y el gestor de impresión', width));
    lines.push(centerText('están configurados correctamente!', width));
    lines.push(separator('-', width));
  } else if (type === 'sale') {
    lines.push(centerText('TICKET DE VENTA', width));
    lines.push(separator('-', width));
    lines.push(twoColumns('Ticket:', data.ticketId || '—', width));
    lines.push(twoColumns('Fecha:', data.timestamp || '—', width));
    lines.push(twoColumns('Canal:', data.channel || '—', width));
    const paymentLabel = data.paymentMethod === 'cash' ? 'Efectivo'
      : data.paymentMethod === 'card' ? 'Tarjeta'
        : data.paymentMethod === 'transfer' ? 'Transferencia'
          : 'No registrado';
    lines.push(twoColumns('Pago:', paymentLabel, width));
    lines.push(separator('-', width));

    if (Array.isArray(data.items)) {
      data.items.forEach((item) => {
        lines.push(item.name || 'Producto');
        const detail = `${item.qty} ${item.unit || 'L'} x ${formatCurrency(item.price)} MXN`;
        const itemTotal = `${formatCurrency(item.total)} MXN`;
        lines.push(twoColumns(`  ${detail}`, itemTotal, width));
      });
    }

    lines.push(separator('-', width));
    lines.push(twoColumns('Artículos:', String(data.items?.length || 0), width));
    lines.push(twoColumns('TOTAL:', `${formatCurrency(data.total)} MXN`, width));
    lines.push(separator('-', width));
    lines.push(centerText('¡Gracias por su compra!', width));
    lines.push(separator('-', width));
  } else if (type === 'cashShift') {
    lines.push(centerText('CIERRE DE TURNO', width));
    lines.push(separator('-', width));
    lines.push(twoColumns('Tienda:', data.storeName || data.storeId || '—', width));
    lines.push(twoColumns('Turno:', String(data.id || '').slice(0, 8).toUpperCase(), width));
    lines.push(twoColumns('Cajero:', data.closedBy?.userName || data.openedBy?.userName || 'Desconocido', width));
    lines.push(twoColumns('Cierre:', data.timestamp || 'Fecha no disponible', width));
    lines.push(separator('-', width));
    lines.push(twoColumns('Tickets:', String(data.saleCount ?? 0), width));
    lines.push(twoColumns('Fondo inicial:', `${formatCurrency((data.openingCashCents || 0) / 100)} MXN`, width));
    lines.push(twoColumns('Efectivo:', `${formatCurrency((data.paymentTotalsCents?.cash || 0) / 100)} MXN`, width));
    lines.push(twoColumns('Tarjeta:', `${formatCurrency((data.paymentTotalsCents?.card || 0) / 100)} MXN`, width));
    lines.push(twoColumns('Transferencia:', `${formatCurrency((data.paymentTotalsCents?.transfer || 0) / 100)} MXN`, width));
    lines.push(separator('-', width));
    lines.push(twoColumns('Efectivo esperado:', `${formatCurrency((data.expectedCashCents || 0) / 100)} MXN`, width));
    lines.push(twoColumns('Efectivo contado:', `${formatCurrency((data.countedCashCents || 0) / 100)} MXN`, width));
    lines.push(twoColumns('Diferencia:', `${formatCurrency((data.cashDifferenceCents || 0) / 100)} MXN`, width));
    lines.push(separator('-', width));
  } else if (type === 'purchaseOrder') {
    lines.push(centerText('ORDEN DE COMPRA', width));
    lines.push(separator('-', width));
    lines.push(twoColumns('Orden:', data.orderNumber || '—', width));
    lines.push(twoColumns('Fecha:', formatTicketDate(data.createdAt), width));
    lines.push(twoColumns('Proveedor:', data.supplierName || '—', width));
    lines.push(separator('-', width));
    if (Array.isArray(data.items)) {
      data.items.forEach((item) => {
        lines.push(item.productName || 'Producto');
        lines.push(twoColumns(`  Ped: ${item.qtyOrdered} ${item.unit}`, `Rec: ${item.qtyReceived} ${item.unit}`, width));
      });
    }
    lines.push(separator('-', width));
  } else if (type === 'audit') {
    lines.push(centerText('AUDITORÍA DE INVENTARIO', width));
    lines.push(separator('-', width));
    lines.push(twoColumns('Fecha:', formatTicketDate(data.timestamp || new Date()), width));
    lines.push(separator('-', width));
    if (Array.isArray(data.lines)) {
      data.lines.forEach((line) => {
        lines.push(line.productName || 'Producto');
        lines.push(twoColumns(`  Esp: ${line.expected}`, `Con: ${line.counted}`, width));
      });
    }
    lines.push(separator('-', width));
  }

  lines.push(centerText('Printed by POSKlean', width));
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push('');

  return lines.join('\r\n');
}
