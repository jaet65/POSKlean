import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

export const FINANCE_CLASSIFICATIONS = {
  opex: {
    key: 'opex',
    label: 'Gasto Operativo (OPEX)',
    type: 'expense',
    description: 'Gastos cotidianos necesarios para operar el negocio (renta, nómina, luz, agua, mantenimiento).',
    color: 'amber',
  },
  capex: {
    key: 'capex',
    label: 'Inversión de Capital (CAPEX)',
    type: 'expense',
    description: 'Bienes duraderos y activos fijos para el retorno de inversión (mobiliario, bombas, remodelación, computadoras).',
    color: 'purple',
  },
  capital_injection: {
    key: 'capital_injection',
    label: 'Aportación / Inversión Inicial',
    type: 'income',
    description: 'Inyección de dinero propio, capital de socios o préstamos para equipar o fondear la sucursal.',
    color: 'emerald',
  },
  revenue: {
    key: 'revenue',
    label: 'Otro Ingreso (Extra POS)',
    type: 'income',
    description: 'Entradas de efectivo no provenientes de tickets directos (ej. venta de envases vacíos, fletes especiales).',
    color: 'cyan',
  },
};

export const FINANCE_CATEGORIES = {
  // OPEX Categories
  rent: { key: 'rent', label: 'Renta del Local', classification: 'opex', icon: 'Building' },
  payroll: { key: 'payroll', label: 'Nómina y Sueldos', classification: 'opex', icon: 'Users' },
  utilities: { key: 'utilities', label: 'Servicios (Luz CFE, Agua, Internet)', classification: 'opex', icon: 'Zap' },
  maintenance: { key: 'maintenance', label: 'Mantenimiento y Reparación', classification: 'opex', icon: 'Wrench' },
  marketing: { key: 'marketing', label: 'Publicidad y Redes', classification: 'opex', icon: 'Megaphone' },
  supplies: { key: 'supplies', label: 'Insumos y Limpieza Operativa', classification: 'opex', icon: 'Sparkles' },
  taxes_fees: { key: 'taxes_fees', label: 'Impuestos y Comisiones', classification: 'opex', icon: 'FileSpreadsheet' },
  transport: { key: 'transport', label: 'Transporte y Combustible', classification: 'opex', icon: 'Truck' },
  other_opex: { key: 'other_opex', label: 'Otros Gastos Operativos', classification: 'opex', icon: 'MoreHorizontal' },

  // CAPEX Categories
  furniture: { key: 'furniture', label: 'Mobiliario, Mostradores y Racks', classification: 'capex', icon: 'Package' },
  machinery_equipment: { key: 'machinery_equipment', label: 'Bombas, Despachadores y Tanques', classification: 'capex', icon: 'Gauge' },
  renovation: { key: 'renovation', label: 'Remodelación y Obra Civil', classification: 'capex', icon: 'Hammer' },
  it_hardware: { key: 'it_hardware', label: 'Punto de Venta, Terminales y Cómputo', classification: 'capex', icon: 'Cpu' },
  lease_deposit: { key: 'lease_deposit', label: 'Depósito en Garantía (Local)', classification: 'capex', icon: 'Key' },
  vehicles: { key: 'vehicles', label: 'Vehículos de Carga / Reparto', classification: 'capex', icon: 'Truck' },
  other_capex: { key: 'other_capex', label: 'Otros Activos Fijos', classification: 'capex', icon: 'Boxes' },

  // Capital Injection Categories
  initial_investment: { key: 'initial_investment', label: 'Inversión Inicial de Socios', classification: 'capital_injection', icon: 'Coins' },
  partner_contribution: { key: 'partner_contribution', label: 'Aportación Adicional de Capital', classification: 'capital_injection', icon: 'Wallet' },
  loan: { key: 'loan', label: 'Préstamo o Crédito Bancario', classification: 'capital_injection', icon: 'Landmark' },
  other_injection: { key: 'other_injection', label: 'Otra Entrada de Capital', classification: 'capital_injection', icon: 'PiggyBank' },

  // Revenue Categories
  extra_service: { key: 'extra_service', label: 'Servicios de Despacho / Flete', classification: 'revenue', icon: 'Truck' },
  scrap_waste: { key: 'scrap_waste', label: 'Venta de Envases / Merma', classification: 'revenue', icon: 'Recycle' },
  other_income: { key: 'other_income', label: 'Otros Ingresos Varios', classification: 'revenue', icon: 'PlusCircle' },
};

const userInfo = (user) => ({
  userId: user?.id || user?.uid || null,
  userName: user?.displayName || user?.username || user?.email || 'Desconocido',
  userRole: user?.role || 'admin',
});

const sanitizeMoney = (amount) => {
  const val = Number(amount);
  if (!Number.isFinite(val) || val <= 0) {
    throw new Error('El monto debe ser un número positivo.');
  }
  return Math.round(val * 100) / 100;
};

/**
 * Registra una nueva transacción financiera (Entrada o Salida)
 */
export async function addFinanceTransaction({
  classification,
  category,
  amount,
  date,
  description,
  storeId = 'global',
  paymentMethod = 'transfer',
  vendor = '',
  invoiceNumber = '',
  notes = '',
  isRecurring = false,
  recurringPeriod = null,
  user,
}) {
  if (!db) throw new Error('Firestore no está disponible.');
  const money = sanitizeMoney(amount);
  const classDef = FINANCE_CLASSIFICATIONS[classification];
  if (!classDef) throw new Error('Clasificación financiera inválida.');

  const cleanDate = typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)
    ? date
    : new Date().toISOString().slice(0, 10);

  const cleanDescription = String(description || '').trim();
  if (!cleanDescription) {
    throw new Error('La descripción del movimiento es obligatoria.');
  }

  const transactionRef = doc(collection(db, 'financeTransactions'));
  const author = userInfo(user);
  const now = serverTimestamp();

  const payload = {
    id: transactionRef.id,
    type: classDef.type, // 'expense' o 'income'
    classification, // 'opex', 'capex', 'capital_injection', 'revenue'
    category: category || (classification === 'opex' ? 'other_opex' : classification === 'capex' ? 'other_capex' : 'other_income'),
    amount: money,
    amountCents: Math.round(money * 100),
    date: cleanDate,
    description: cleanDescription,
    storeId: storeId || 'global',
    paymentMethod: paymentMethod || 'cash',
    vendor: String(vendor || '').trim(),
    invoiceNumber: String(invoiceNumber || '').trim(),
    notes: String(notes || '').trim(),
    isRecurring: Boolean(isRecurring),
    recurringPeriod: isRecurring ? (recurringPeriod || 'monthly') : null,
    createdBy: author,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(transactionRef, payload);
  return payload;
}

/**
 * Actualiza una transacción financiera existente
 */
export async function updateFinanceTransaction(transactionId, data, user) {
  if (!db) throw new Error('Firestore no está disponible.');
  if (!transactionId) throw new Error('ID de transacción requerido.');

  const ref = doc(db, 'financeTransactions', transactionId);
  const patch = {
    updatedAt: serverTimestamp(),
    updatedBy: userInfo(user),
  };

  if (data.amount !== undefined) {
    const money = sanitizeMoney(data.amount);
    patch.amount = money;
    patch.amountCents = Math.round(money * 100);
  }
  if (data.description !== undefined) {
    const desc = String(data.description || '').trim();
    if (!desc) throw new Error('La descripción no puede estar vacía.');
    patch.description = desc;
  }
  if (data.date !== undefined) patch.date = data.date;
  if (data.classification !== undefined) {
    const classDef = FINANCE_CLASSIFICATIONS[data.classification];
    if (classDef) {
      patch.classification = data.classification;
      patch.type = classDef.type;
    }
  }
  if (data.category !== undefined) patch.category = data.category;
  if (data.storeId !== undefined) patch.storeId = data.storeId || 'global';
  if (data.paymentMethod !== undefined) patch.paymentMethod = data.paymentMethod;
  if (data.vendor !== undefined) patch.vendor = String(data.vendor || '').trim();
  if (data.invoiceNumber !== undefined) patch.invoiceNumber = String(data.invoiceNumber || '').trim();
  if (data.notes !== undefined) patch.notes = String(data.notes || '').trim();
  if (data.isRecurring !== undefined) {
    patch.isRecurring = Boolean(data.isRecurring);
    patch.recurringPeriod = data.isRecurring ? (data.recurringPeriod || 'monthly') : null;
  }

  await updateDoc(ref, patch);
  return { id: transactionId, ...patch };
}

/**
 * Elimina una transacción financiera
 */
export async function deleteFinanceTransaction(transactionId) {
  if (!db) throw new Error('Firestore no está disponible.');
  if (!transactionId) throw new Error('ID de transacción requerido.');
  await deleteDoc(doc(db, 'financeTransactions', transactionId));
}

/**
 * Escucha en tiempo real todas las transacciones financieras
 */
export function subscribeToFinanceTransactions(storeId = null, onData, onError) {
  if (!db) {
    onData([]);
    return () => {};
  }

  let q;
  if (storeId && storeId !== 'all') {
    // Escucha de la tienda seleccionada y los gastos globales
    q = query(
      collection(db, 'financeTransactions'),
      where('storeId', 'in', [storeId, 'global'])
    );
  } else {
    q = collection(db, 'financeTransactions');
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        const dateObj = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
        return {
          id: d.id,
          ...data,
          dateMs: dateObj.getTime(),
        };
      });
      // Ordenar por fecha descendente
      items.sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
      onData(items);
    },
    (err) => {
      console.error('Error al escuchar transacciones financieras:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * PLANTILLAS DE GASTOS RECURRENTES (Renta, Nómina, Luz, Internet...)
 */

export async function saveRecurringTemplate({
  id,
  classification = 'opex',
  category = 'rent',
  amount,
  description,
  storeId = 'global',
  paymentMethod = 'transfer',
  dayOfMonth = 1,
  vendor = '',
  notes = '',
  user,
}) {
  if (!db) throw new Error('Firestore no está disponible.');
  const money = sanitizeMoney(amount);
  const classDef = FINANCE_CLASSIFICATIONS[classification] || FINANCE_CLASSIFICATIONS.opex;
  const desc = String(description || '').trim();
  if (!desc) throw new Error('La descripción de la plantilla es obligatoria.');

  const author = userInfo(user);
  const templateRef = id ? doc(db, 'financeRecurringTemplates', id) : doc(collection(db, 'financeRecurringTemplates'));

  const payload = {
    id: templateRef.id,
    type: classDef.type,
    classification,
    category,
    amount: money,
    amountCents: Math.round(money * 100),
    description: desc,
    storeId: storeId || 'global',
    paymentMethod: paymentMethod || 'transfer',
    dayOfMonth: Math.min(31, Math.max(1, Number(dayOfMonth) || 1)),
    vendor: String(vendor || '').trim(),
    notes: String(notes || '').trim(),
    createdBy: author,
    updatedAt: serverTimestamp(),
  };

  await setDoc(templateRef, payload, { merge: true });
  return payload;
}

export async function deleteRecurringTemplate(templateId) {
  if (!db) throw new Error('Firestore no está disponible.');
  await deleteDoc(doc(db, 'financeRecurringTemplates', templateId));
}

export function subscribeToRecurringTemplates(onData, onError) {
  if (!db) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'financeRecurringTemplates'),
    (snapshot) => {
      const templates = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(templates);
    },
    (err) => {
      console.error('Error al escuchar plantillas recurrentes:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Aplica los gastos recurrentes para un mes y año dados (ej. '2026-10')
 * Evita duplicar si ya existe un gasto con la misma plantilla en ese mes.
 */
export async function applyRecurringTemplatesForMonth({
  yearMonth, // 'YYYY-MM'
  templates,
  existingTransactions,
  storeId = null,
  user,
}) {
  if (!yearMonth || !Array.isArray(templates) || templates.length === 0) {
    return { appliedCount: 0, skippedCount: 0 };
  }

  let appliedCount = 0;
  let skippedCount = 0;

  for (const t of templates) {
    // Si se especificó tienda y la plantilla no coincide ni es global, omitir
    if (storeId && storeId !== 'all' && t.storeId !== 'global' && t.storeId !== storeId) {
      continue;
    }

    // Comprobar si ya existe un gasto registrado este mes con descripción similar
    const dayStr = String(t.dayOfMonth || 1).padStart(2, '0');
    const targetDate = `${yearMonth}-${dayStr}`;

    const alreadyExists = existingTransactions.some((tx) => (
      tx.date?.startsWith(yearMonth)
      && tx.category === t.category
      && tx.description.toLowerCase() === t.description.toLowerCase()
      && tx.storeId === t.storeId
    ));

    if (alreadyExists) {
      skippedCount++;
      continue;
    }

    await addFinanceTransaction({
      classification: t.classification || 'opex',
      category: t.category,
      amount: t.amount,
      date: targetDate,
      description: t.description,
      storeId: t.storeId,
      paymentMethod: t.paymentMethod,
      vendor: t.vendor,
      notes: `Generado automáticamente desde plantilla recurrente: ${t.notes || ''}`.trim(),
      isRecurring: true,
      recurringPeriod: 'monthly',
      user,
    });
    appliedCount++;
  }

  return { appliedCount, skippedCount };
}
