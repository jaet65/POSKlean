import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, PackagePlus, Plus, Printer, Trash2, Truck, Upload, Users, X } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { parsePurchaseOrderCsv, PURCHASE_ORDER_CSV_TEMPLATE } from '../utils/purchaseOrderCsv';
import {
  addSupplier,
  setSupplierStatus,
  subscribeToSuppliers,
  updateSupplier,
} from '../services/supplierService';
import {
  cancelPurchaseOrder,
  closePartialPurchaseOrder,
  createPurchaseOrder,
  rejectPurchaseRequests,
  receivePurchaseOrder,
  subscribeToPurchaseRequests,
  subscribeToPurchaseOrders,
  suggestedSalePrice,
  weightedAverageCost,
} from '../services/purchaseService';

const STATUS_LABELS = {
  pending: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  partial: { label: 'Recibida parcial', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  received: { label: 'Recibida', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  closed: { label: 'Cerrada parcial', className: 'bg-slate-600/30 text-slate-300 border-slate-600' },
  cancelled: { label: 'Cancelada', className: 'bg-slate-600/30 text-slate-400 border-slate-600' },
};

const EMPTY_SUPPLIER = { name: '', contactName: '', phone: '', email: '', notes: '' };
const NEW_PRODUCT = '__new__';
const CATALOG_PREFIX = 'catalog:';
const CUSTOM_CATEGORY = '__custom__';
const EMPTY_NEW_PRODUCT = { name: '', category: '', customCategory: '', unit: 'L', price: '', priceAuto: true };
const UNIT_OPTIONS = ['L', 'Pza', 'Kg', 'Galón', 'Porrón', 'Cubeta'];
const inputClass = 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none';
const labelClass = 'mb-1 block text-xs font-medium text-slate-300';

function Modal({ title, subtitle, onClose, busy, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-md'} space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl`}
      >
        <div className="flex items-start justify-between border-b border-slate-700 pb-3">
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="p-1 text-slate-400 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PurchasingPanel({ currentUser, activeStoreId, stores = [], products, catalog = [], onPrintOrder }) {
  const isCashier = currentUser?.role === 'cajero';
  const canManagePurchases = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const [section, setSection] = useState('orders');
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const visibleSection = canManagePurchases ? section : 'orders';

  const [supplierModal, setSupplierModal] = useState(null); // { id?, ...fields }
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [approvalModal, setApprovalModal] = useState(null); // { group, lines }
  const [orderForm, setOrderForm] = useState({ storeId: '', supplierId: '', notes: '', lines: [] });
  const [csvImportReport, setCsvImportReport] = useState(null);
  const orderCsvInputRef = useRef(null);
  const [receiveModal, setReceiveModal] = useState(null); // { order, inputs }
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => {
    if (!canManagePurchases) return undefined;
    return subscribeToSuppliers(
      (list) => { setSuppliers(list); setLoadError(''); },
      (error) => setLoadError(`No se pudieron cargar los proveedores: ${error.message}`),
    );
  }, [canManagePurchases]);

  const storeIdsKey = activeStoreId || stores.map((store) => store.id).join('|');
  useEffect(() => subscribeToPurchaseOrders(
    storeIdsKey ? storeIdsKey.split('|') : [],
    (list) => { setOrders(list); setLoadError(''); },
    (error) => setLoadError(`No se pudieron cargar las órdenes de compra: ${error.message}`),
  ), [storeIdsKey]);

  useEffect(() => {
    if (!canManagePurchases) return undefined;
    return subscribeToPurchaseRequests(
      storeIdsKey ? storeIdsKey.split('|') : [],
      (list) => { setPurchaseRequests(list); setLoadError(''); },
      (error) => setLoadError(`No se pudieron cargar las solicitudes: ${error.message}`),
    );
  }, [canManagePurchases, storeIdsKey]);

  const storeNameById = useMemo(
    () => new Map(stores.map((store) => [store.id, store.name])),
    [stores],
  );
  const visibleOrders = useMemo(
    () => orders.filter((order) => !isCashier || ['pending', 'partial', 'received'].includes(order.status)),
    [orders, isCashier],
  );
  const pendingRequestGroups = useMemo(() => {
    const groups = new Map();
    purchaseRequests.filter((request) => request.status === 'pending').forEach((request) => {
      const key = `${request.storeId}|${request.supplierId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          storeId: request.storeId,
          supplierId: request.supplierId,
          requests: [],
          itemsByProduct: new Map(),
          requesters: new Set(),
        });
      }
      const group = groups.get(key);
      group.requests.push(request);
      if (request.requestedBy?.userName) group.requesters.add(request.requestedBy.userName);
      (request.items || []).forEach((item) => {
        const existing = group.itemsByProduct.get(item.productId);
        if (existing) {
          existing.qtyRequested = Number((existing.qtyRequested + Number(item.qtyRequested)).toFixed(2));
          existing.requestIds.push(request.id);
        } else {
          group.itemsByProduct.set(item.productId, {
            ...item,
            qtyRequested: Number(item.qtyRequested),
            requestIds: [request.id],
          });
        }
      });
    });
    return [...groups.values()]
      .map((group) => ({
        ...group,
        items: [...group.itemsByProduct.values()],
        requests: group.requests.sort((a, b) => a.createdAtMs - b.createdAtMs),
        requesters: [...group.requesters],
      }))
      .sort((a, b) => (b.requests.at(-1)?.createdAtMs || 0) - (a.requests.at(-1)?.createdAtMs || 0));
  }, [purchaseRequests]);
  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.status !== 'archived'),
    [suppliers],
  );
  const storeProducts = useMemo(
    () => products
      .filter((product) => product.storeId === orderForm.storeId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')),
    [products, orderForm.storeId],
  );
  const catalogOptions = useMemo(() => {
    const enabled = new Set(storeProducts.map((product) => product.catalogId));
    return catalog
      .filter((item) => item.status !== 'archived' && !enabled.has(item.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  }, [catalog, storeProducts]);
  const categories = useMemo(
    () => [...new Set([...storeProducts, ...catalog].map((product) => String(product.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [storeProducts, catalog],
  );

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const approvalProducts = useMemo(() => {
    const group = approvalModal?.group;
    if (!group) return [];
    return products
      .filter((product) => product.storeId === group.storeId
        && catalogById.get(product.catalogId)?.supplierId === group.supplierId)
      .sort((first, second) => String(first.name).localeCompare(String(second.name), 'es'));
  }, [approvalModal, catalogById, products]);
  const lineSupplierId = useMemo(() => {
    for (const line of orderForm.lines) {
      const catalogId = line.catalogId || products.find((candidate) => candidate.id === line.productId)?.catalogId;
      const supplierId = catalogId ? catalogById.get(catalogId)?.supplierId : null;
      if (supplierId) return supplierId;
    }
    return '';
  }, [orderForm.lines, products, catalogById]);
  const needsSupplierPick = !lineSupplierId && orderForm.lines.some((line) => line.newProduct);
  const orderSupplierId = lineSupplierId || (needsSupplierPick ? orderForm.supplierId : '');
  const orderSupplier = activeSuppliers.find((supplier) => supplier.id === orderSupplierId) || null;
  const supplierNote = (catalogId) => {
    const supplierId = catalogById.get(catalogId)?.supplierId;
    if (!supplierId || !activeSuppliers.some((supplier) => supplier.id === supplierId)) return ' (sin proveedor)';
    if (lineSupplierId && supplierId !== lineSupplierId) return ' (otro proveedor)';
    return '';
  };

  const run = async (task, successMessage) => {
    setActionError('');
    setBusy(true);
    try {
      await task();
      if (successMessage) {
        setNotice(successMessage);
        setTimeout(() => setNotice(''), 4000);
      }
      return true;
    } catch (error) {
      setActionError(error.message || 'No se pudo completar la acción.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openSupplierModal = (supplier = null) => {
    setActionError('');
    setSupplierModal(supplier ? { ...EMPTY_SUPPLIER, ...supplier } : { ...EMPTY_SUPPLIER });
  };

  const handleSaveSupplier = async (event) => {
    event.preventDefault();
    const ok = await run(
      () => (supplierModal.id
        ? updateSupplier(supplierModal.id, supplierModal)
        : addSupplier(supplierModal, currentUser)),
      supplierModal.id ? 'Proveedor actualizado.' : 'Proveedor agregado.',
    );
    if (ok) setSupplierModal(null);
  };

  const openOrderModal = () => {
    setActionError('');
    setCsvImportReport(null);
    const defaultStoreId = activeStoreId || (stores.length === 1 ? stores[0].id : '');
    setOrderForm({ storeId: defaultStoreId, supplierId: '', notes: '', lines: [{ productId: '', qty: '', unitCost: '' }] });
    setOrderModalOpen(true);
  };

  const downloadOrderTemplate = () => {
    const url = URL.createObjectURL(new Blob([`\uFEFF${PURCHASE_ORDER_CSV_TEMPLATE}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-orden-compra.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleOrderCsvFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setActionError('');
    if (file.size > 1024 * 1024) {
      setCsvImportReport({ imported: 0, errors: [{ line: 0, message: 'El archivo CSV es demasiado grande (máximo 1 MB).' }] });
      return;
    }

    const parsed = parsePurchaseOrderCsv(await file.text());
    const errors = [...parsed.errors];
    const candidates = [
      ...storeProducts.map((product) => ({ ...product, productId: product.id, orderCatalogId: '', supplierCatalogId: product.catalogId })),
      ...catalogOptions.map((item) => ({ ...item, productId: '', orderCatalogId: item.id, supplierCatalogId: item.id })),
    ];
    const normalizedName = (value) => String(value || '').trim().toLocaleLowerCase('es-MX');
    const lines = [];
    let importedSupplierId = '';

    parsed.rows.forEach((row) => {
      const matches = candidates.filter((candidate) => normalizedName(candidate.name) === normalizedName(row.name));
      if (matches.length !== 1) {
        errors.push({ line: row.line, message: matches.length ? 'El nombre coincide con más de un producto.' : `No se encontró "${row.name}" en esta tienda ni en el catálogo disponible.` });
        return;
      }
      const candidate = matches[0];
      const supplierId = catalogById.get(candidate.supplierCatalogId)?.supplierId;
      if (!supplierId || !activeSuppliers.some((supplier) => supplier.id === supplierId)) {
        errors.push({ line: row.line, message: `"${row.name}" no tiene un proveedor activo asignado.` });
        return;
      }
      if (importedSupplierId && supplierId !== importedSupplierId) {
        errors.push({ line: row.line, message: 'La orden solo puede incluir productos del mismo proveedor.' });
        return;
      }
      importedSupplierId = supplierId;
      lines.push({
        productId: candidate.productId,
        catalogId: candidate.orderCatalogId,
        qty: String(row.qty),
        unitCost: String(row.unitCost),
      });
    });

    if (lines.length > 0) setOrderForm((previous) => ({ ...previous, lines, supplierId: importedSupplierId }));
    setCsvImportReport({ imported: lines.length, errors });
  };

  const updateLine = (index, changes) => {
    setOrderForm((previous) => ({
      ...previous,
      lines: previous.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)),
    }));
  };

  const handleProductPick = (index, productId) => {
    if (productId === NEW_PRODUCT) {
      updateLine(index, { productId: '', catalogId: '', unitCost: '', newProduct: { ...EMPTY_NEW_PRODUCT, category: categories[0] || '' } });
      return;
    }
    if (productId.startsWith(CATALOG_PREFIX)) {
      updateLine(index, { productId: '', catalogId: productId.slice(CATALOG_PREFIX.length), newProduct: null, unitCost: '' });
      return;
    }
    const product = products.find((candidate) => candidate.id === productId);
    updateLine(index, { productId, catalogId: '', newProduct: null, unitCost: product ? String(product.cost ?? '') : '' });
  };

  const updateNewProduct = (index, changes) => {
    setOrderForm((previous) => ({
      ...previous,
      lines: previous.lines.map((line, lineIndex) => (
        lineIndex === index ? { ...line, newProduct: { ...line.newProduct, ...changes } } : line
      )),
    }));
  };

  const handleLineCost = (index, value) => {
    setOrderForm((previous) => ({
      ...previous,
      lines: previous.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const cost = parseFloat(value);
        const autoPrice = line.newProduct?.priceAuto && Number.isFinite(cost) && cost > 0;
        return {
          ...line,
          unitCost: value,
          newProduct: autoPrice
            ? { ...line.newProduct, price: suggestedSalePrice(cost).toFixed(2) }
            : line.newProduct,
        };
      }),
    }));
  };

  const orderTotal = orderForm.lines.reduce(
    (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitCost) || 0),
    0,
  );

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    const supplier = orderSupplier;
    const ok = await run(
      () => createPurchaseOrder({
        storeId: orderForm.storeId,
        supplier,
        notes: orderForm.notes,
        products,
        catalog,
        user: currentUser,
        lines: orderForm.lines.map((line) => ({
          productId: line.productId,
          catalogId: line.catalogId || '',
          qty: Number(line.qty),
          unitCost: Number(line.unitCost),
          newProduct: line.newProduct
            ? {
              name: line.newProduct.name,
              category: line.newProduct.category === CUSTOM_CATEGORY
                ? line.newProduct.customCategory
                : line.newProduct.category,
              unit: line.newProduct.unit,
              price: Number(line.newProduct.price),
            }
            : null,
        })),
      }),
      'Orden de compra creada.',
    );
    if (ok) setOrderModalOpen(false);
  };

  const openReceiveModal = (order) => {
    setActionError('');
    setReceiveModal({
      order,
      inputs: order.items.map((item) => ({
        qty: '',
        unitCost: String((item.lastReceivedCostCents ?? item.unitCostCents) / 100),
      })),
    });
  };

  const pendingQty = (item) => Number((item.qtyOrdered - item.qtyReceived).toFixed(2));

  const updateReceiveInput = (index, changes) => {
    setReceiveModal((previous) => ({
      ...previous,
      inputs: previous.inputs.map((input, inputIndex) => (inputIndex === index ? { ...input, ...changes } : input)),
    }));
  };

  const handleReceiveAll = () => {
    setReceiveModal((previous) => ({
      ...previous,
      inputs: previous.inputs.map((input, index) => ({
        ...input,
        qty: pendingQty(previous.order.items[index]) > 0 ? String(pendingQty(previous.order.items[index])) : '',
      })),
    }));
  };

  const handleReceive = async (event) => {
    event.preventDefault();
    const modal = receiveModal;
    const canUpdatePrices = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';

    if (canUpdatePrices && !modal.plan) {
      const plan = modal.inputs.flatMap((input, index) => {
        const qty = Number(input.qty) || 0;
        const unitCost = Number(input.unitCost);
        const item = modal.order.items[index];
        const product = products.find((candidate) => candidate.id === item.productId);
        if (qty <= 0 || !product || !Number.isFinite(unitCost)) return [];
        const averageCost = weightedAverageCost(product.currentStock, product.cost, qty, unitCost);
        const suggested = suggestedSalePrice(averageCost);
        if (suggested <= 0 || suggested === Number(product.price)) return [];
        return [{
          index,
          productName: item.productName,
          currentStock: Number(product.currentStock) || 0,
          currentCost: Number(product.cost) || 0,
          currentPrice: Number(product.price) || 0,
          averageCost,
          suggested,
          apply: true,
          price: String(suggested),
        }];
      });
      if (plan.length > 0) {
        setActionError('');
        setReceiveModal({ ...modal, plan });
        return;
      }
    }

    const priceByIndex = new Map((modal.plan || [])
      .filter((entry) => entry.apply)
      .map((entry) => [entry.index, Number(entry.price)]));
    const ok = await run(
      () => receivePurchaseOrder({
        orderId: modal.order.id,
        user: currentUser,
        receipts: modal.inputs.map((input, index) => ({
          index,
          qty: Number(input.qty) || 0,
          unitCost: Number(input.unitCost),
          newPrice: priceByIndex.get(index),
        })),
      }),
      'Recepción registrada: inventario y costo promedio actualizados.',
    );
    if (ok) setReceiveModal(null);
  };

  const updatePlanEntry = (position, changes) => {
    setReceiveModal((previous) => ({
      ...previous,
      plan: previous.plan.map((entry, entryIndex) => (entryIndex === position ? { ...entry, ...changes } : entry)),
    }));
  };

  const handleCancelOrder = async (order) => {
    if (!window.confirm(`¿Cancelar la orden ${order.orderNumber}? Esta acción no se puede deshacer.`)) return;
    await run(() => cancelPurchaseOrder(order.id, currentUser), 'Orden cancelada.');
  };

  const handleClosePartialOrder = async (order) => {
    const pendingItems = order.items
      .filter((item) => pendingQty(item) > 0)
      .map((item) => `${item.productName}: ${pendingQty(item)} ${item.unit}`)
      .join('\n');
    if (!window.confirm(`¿Cerrar la orden ${order.orderNumber}? Ya no podrás registrar la mercancía pendiente.\n\nPendiente:\n${pendingItems}`)) return;
    await run(() => closePartialPurchaseOrder(order.id, currentUser), 'Orden cerrada con recepción parcial.');
  };

  const handleApproveRequestGroup = async (group) => {
    const supplier = activeSuppliers.find((candidate) => candidate.id === group.supplierId);
    if (!supplier) {
      setActionError('El proveedor de esta solicitud no está activo. Reactívalo antes de aprobarla.');
      return;
    }
    if (group.items.length > 50 || group.requests.length > 50) {
      setActionError('Una orden admite máximo 50 productos o solicitudes. Divide esta solicitud antes de aprobarla.');
      return;
    }
    const lines = group.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return {
        productId: item.productId,
        qty: String(item.qtyRequested),
        unitCost: String(product?.cost ?? ''),
        requestIds: item.requestIds,
      };
    });
    setActionError('');
    setApprovalModal({ group, lines });
  };

  const updateApprovalLine = (index, changes) => {
    setApprovalModal((previous) => ({
      ...previous,
      lines: previous.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)),
    }));
  };

  const handleApprovalProductPick = (index, productId) => {
    const product = approvalProducts.find((candidate) => candidate.id === productId);
    updateApprovalLine(index, {
      productId,
      unitCost: product ? String(product.cost ?? 0) : '',
    });
  };

  const handleAddApprovalLine = () => {
    const selectedIds = new Set(approvalModal.lines.map((line) => line.productId).filter(Boolean));
    const product = approvalProducts.find((candidate) => !selectedIds.has(candidate.id));
    if (!product) {
      setActionError('No hay más productos de este proveedor disponibles en la tienda.');
      return;
    }
    setActionError('');
    setApprovalModal((previous) => ({
      ...previous,
      lines: [...previous.lines, { productId: product.id, qty: '', unitCost: String(product.cost ?? 0), requestIds: [] }],
    }));
  };

  const handleSubmitApproval = async (event) => {
    event.preventDefault();
    if (!approvalModal || busy) return;
    const { group } = approvalModal;
    const supplier = activeSuppliers.find((candidate) => candidate.id === group.supplierId);
    if (!supplier) {
      setActionError('El proveedor de esta solicitud ya no está activo. Reactívalo antes de aprobarla.');
      return;
    }
    const ok = await run(async () => {
      const requestIds = [...new Set(approvalModal.lines.flatMap((line) => line.requestIds || []))];
      if (requestIds.length === 0) throw new Error('Incluye al menos un producto de las solicitudes originales.');
      if (approvalModal.lines.length === 0 || approvalModal.lines.length > 50) {
        throw new Error('La orden debe incluir entre 1 y 50 productos.');
      }
      const seen = new Set();
      const lines = approvalModal.lines.map((line) => {
        const product = approvalProducts.find((candidate) => candidate.id === line.productId);
        const qty = Number(line.qty);
        const unitCost = Number(line.unitCost);
        if (!product) throw new Error('Selecciona un producto vigente de esta tienda y proveedor en cada renglón.');
        if (seen.has(product.id)) throw new Error(`${product.name} aparece más de una vez en la orden.`);
        if (!Number.isFinite(qty) || qty <= 0 || Number((qty * 100).toFixed(0)) / 100 !== qty) {
          throw new Error(`Indica una cantidad válida para ${product.name}.`);
        }
        if (!Number.isFinite(unitCost) || unitCost < 0 || Number((unitCost * 100).toFixed(0)) / 100 !== unitCost) {
          throw new Error(`Indica un costo unitario válido para ${product.name}.`);
        }
        seen.add(product.id);
        return { productId: product.id, qty, unitCost };
      });
      await createPurchaseOrder({
        storeId: group.storeId,
        supplier,
        notes: `OC creada desde ${requestIds.length} solicitud(es) de resurtido.`,
        products,
        catalog,
        user: currentUser,
        requestIds,
        lines,
      });
    }, 'Solicitudes aprobadas y orden de compra creada.');
    if (ok) setApprovalModal(null);
  };

  const handleRejectRequestGroup = async (group) => {
    const supplier = activeSuppliers.find((candidate) => candidate.id === group.supplierId);
    const supplierName = supplier?.name || 'Proveedor archivado';
    if (!window.confirm(`¿Rechazar ${group.requests.length} solicitud(es) de ${supplierName} para ${storeNameById.get(group.storeId) || 'esta tienda'}?`)) return;
    await run(() => rejectPurchaseRequests(group.requests.map((request) => request.id), currentUser), 'Solicitudes rechazadas.');
  };

  const handleToggleSupplier = async (supplier) => {
    const archiving = supplier.status !== 'archived';
    if (archiving && !window.confirm(`¿Archivar a "${supplier.name}"? No podrás crear órdenes nuevas con este proveedor.`)) return;
    await run(
      () => setSupplierStatus(supplier.id, archiving ? 'archived' : 'active'),
      archiving ? 'Proveedor archivado.' : 'Proveedor reactivado.',
    );
  };

  const tabClass = (id) => `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
    visibleSection === id
      ? 'bg-cyan-500 text-slate-950 font-semibold'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  }`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-slate-700/80 bg-slate-900 p-1">
          <button type="button" onClick={() => setSection('orders')} className={tabClass('orders')}>
            <Truck className="h-4 w-4" /> Órdenes de compra
          </button>
          {canManagePurchases && (
            <button type="button" onClick={() => setSection('requests')} className={tabClass('requests')}>
              <PackagePlus className="h-4 w-4" /> Solicitudes
              {pendingRequestGroups.length > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-950">{pendingRequestGroups.length}</span>
              )}
            </button>
          )}
          {canManagePurchases && (
            <button type="button" onClick={() => setSection('suppliers')} className={tabClass('suppliers')}>
              <Users className="h-4 w-4" /> Proveedores
            </button>
          )}
        </div>
        {canManagePurchases && section === 'orders' ? (
          <button
            type="button"
            onClick={openOrderModal}
            disabled={stores.length === 0 || activeSuppliers.length === 0 || (products.length === 0 && catalog.length === 0)}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Nueva orden
          </button>
        ) : canManagePurchases && section === 'suppliers' ? (
          <button
            type="button"
            onClick={() => openSupplierModal()}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </button>
        ) : null}
      </div>

      {loadError && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>
      )}
      {actionError && !supplierModal && !orderModalOpen && !approvalModal && !receiveModal && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{actionError}</p>
      )}

      {canManagePurchases && section === 'requests' && (
        <div className="space-y-3">
          {pendingRequestGroups.length === 0 ? (
            <p className="rounded-2xl border border-slate-700 bg-slate-800 py-10 text-center text-sm text-slate-400">
              No hay solicitudes de compra pendientes.
            </p>
          ) : pendingRequestGroups.map((group) => {
            const supplier = suppliers.find((candidate) => candidate.id === group.supplierId);
            const unavailableProduct = group.items.find((item) => (
              !products.some((product) => product.id === item.productId && product.storeId === group.storeId)
            ));
            return (
              <section key={group.key} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      {supplier?.name || 'Proveedor no disponible'}
                      <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">{group.requests.length} solicitud(es)</span>
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {storeNameById.get(group.storeId) || 'Tienda'} · {group.requests.at(-1)?.createdAtLabel || 'Fecha no disponible'}
                      {group.requesters.length > 0 && ` · ${group.requesters.join(', ')}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRejectRequestGroup(group)}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveRequestGroup(group)}
                      disabled={busy || !supplier || Boolean(unavailableProduct) || group.items.length > 50 || group.requests.length > 50}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprobar y crear OC
                    </button>
                  </div>
                </div>
                {unavailableProduct && (
                  <p className="mt-3 text-xs text-rose-300">No se puede aprobar: {unavailableProduct.productName} ya no está habilitado en esta tienda.</p>
                )}
                {!supplier && <p className="mt-3 text-xs text-rose-300">Reactiva el proveedor para poder crear la orden.</p>}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-96 text-left text-xs text-slate-300">
                    <thead className="border-b border-slate-700 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Cantidad solicitada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      {group.items.map((item) => (
                        <tr key={item.productId}>
                          <td className="px-3 py-2 text-slate-100">{item.productName}</td>
                          <td className="px-3 py-2 font-mono">{item.qtyRequested} {item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {canManagePurchases && section === 'suppliers' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-800">
          {suppliers.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Aún no hay proveedores. Agrega el primero.</p>
          ) : (
            <table className="w-full min-w-160 text-left text-xs text-slate-300">
              <thead className="border-b border-slate-700 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Teléfono / correo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-100">{supplier.name}</span>
                      {supplier.notes && <span className="block max-w-64 truncate text-[10px] text-slate-500">{supplier.notes}</span>}
                    </td>
                    <td className="px-4 py-3">{supplier.contactName || '—'}</td>
                    <td className="px-4 py-3">
                      {supplier.phone || '—'}
                      {supplier.email && <span className="block text-[10px] text-slate-500">{supplier.email}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        supplier.status === 'archived'
                          ? 'border-slate-600 bg-slate-600/30 text-slate-400'
                          : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      }`}
                      >
                        {supplier.status === 'archived' ? 'Archivado' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openSupplierModal(supplier)} className="rounded-lg border border-slate-600 px-2.5 py-1 font-semibold text-slate-200 hover:bg-slate-700">
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSupplier(supplier)}
                          disabled={busy}
                          className="rounded-lg border border-slate-600 px-2.5 py-1 font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                        >
                          {supplier.status === 'archived' ? 'Reactivar' : 'Archivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {visibleSection === 'orders' && (
        stores.length === 0 ? (
          <p className="rounded-2xl border border-slate-700 bg-slate-800 py-10 text-center text-sm text-slate-400">
            No hay tiendas activas para registrar órdenes de compra.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              {activeStoreId
                ? <>Tienda: <strong className="text-slate-200">{storeNameById.get(activeStoreId) || ''}</strong></>
                : 'Mostrando las órdenes de todas las tiendas activas.'}
            </p>
            {canManagePurchases && activeSuppliers.length === 0 && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                Agrega al menos un proveedor activo para crear órdenes de compra.
              </p>
            )}
            {visibleOrders.length === 0 ? (
              <p className="rounded-2xl border border-slate-700 bg-slate-800 py-10 text-center text-sm text-slate-400">
                {isCashier ? 'No hay órdenes de compra para esta tienda.' : 'Esta tienda aún no tiene órdenes de compra.'}
              </p>
            ) : visibleOrders.map((order) => {
              const status = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
              const isOpen = expandedOrderId === order.id;
              const canReceive = order.status === 'pending' || order.status === 'partial';
              return (
                <div key={order.id} className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
                        {order.orderNumber}
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {order.supplierName} · {storeNameById.get(order.storeId) || 'Tienda'} · {order.createdAtLabel} · {order.createdBy?.userName || 'Desconocido'}
                      </p>
                    </div>
                    {canManagePurchases && (
                      <div className="text-right text-xs">
                        <p className="font-mono text-base font-bold text-cyan-400">{formatCurrency((order.totalCents || 0) / 100)}</p>
                        {order.receivedCents > 0 && (
                          <p className="text-slate-400">Recibido {formatCurrency(order.receivedCents / 100)}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isOpen ? null : order.id)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onPrintOrder?.(order, isCashier)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      <Printer className="h-3.5 w-3.5" /> Imprimir
                    </button>
                    {canReceive && (
                      <button
                        type="button"
                        onClick={() => openReceiveModal(order)}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                      >
                        <PackagePlus className="h-3.5 w-3.5" /> Recibir
                      </button>
                    )}
                    {canManagePurchases && order.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order)}
                        disabled={busy}
                        className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        Cancelar orden
                      </button>
                    )}
                    {canManagePurchases && order.status === 'partial' && (
                      <button
                        type="button"
                        onClick={() => handleClosePartialOrder(order)}
                        disabled={busy}
                        className="rounded-lg border border-slate-500 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                      >
                        Cerrar orden
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-120 text-left text-xs text-slate-300">
                        <thead className="border-b border-slate-700 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="px-3 py-2">Producto</th>
                            <th className="px-3 py-2">Pedido</th>
                            <th className="px-3 py-2">Recibido</th>
                            {canManagePurchases && <th className="px-3 py-2">Costo unit.</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                          {order.items.map((item) => (
                            <tr key={item.productId}>
                              <td className="px-3 py-2 text-slate-100">{item.productName}</td>
                              <td className="px-3 py-2 font-mono">{item.qtyOrdered} {item.unit}</td>
                              <td className="px-3 py-2 font-mono">{item.qtyReceived} {item.unit}</td>
                              {canManagePurchases && (
                                <td className="px-3 py-2 font-mono">{formatCurrency(item.unitCostCents / 100)}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {order.notes && <p className="mt-2 text-xs text-slate-400">Notas: {order.notes}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {supplierModal && (
        <Modal
          title={supplierModal.id ? 'Editar proveedor' : 'Nuevo proveedor'}
          onClose={() => setSupplierModal(null)}
          busy={busy}
        >
          <form onSubmit={handleSaveSupplier} className="space-y-3">
            <div>
              <label htmlFor="supplier-name" className={labelClass}>Nombre *</label>
              <input id="supplier-name" required maxLength={120} value={supplierModal.name} onChange={(event) => setSupplierModal({ ...supplierModal, name: event.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="supplier-contact" className={labelClass}>Contacto</label>
              <input id="supplier-contact" maxLength={120} value={supplierModal.contactName} onChange={(event) => setSupplierModal({ ...supplierModal, contactName: event.target.value })} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="supplier-phone" className={labelClass}>Teléfono</label>
                <input id="supplier-phone" maxLength={40} value={supplierModal.phone} onChange={(event) => setSupplierModal({ ...supplierModal, phone: event.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="supplier-email" className={labelClass}>Correo</label>
                <input id="supplier-email" type="email" maxLength={200} value={supplierModal.email} onChange={(event) => setSupplierModal({ ...supplierModal, email: event.target.value })} className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="supplier-notes" className={labelClass}>Notas</label>
              <textarea id="supplier-notes" rows={2} maxLength={500} value={supplierModal.notes} onChange={(event) => setSupplierModal({ ...supplierModal, notes: event.target.value })} className={inputClass} />
            </div>
            {actionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSupplierModal(null)} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={busy} className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
                {busy ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {orderModalOpen && (
        <Modal title="Nueva orden de compra" onClose={() => setOrderModalOpen(false)} busy={busy} wide>
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="order-store" className={labelClass}>Tienda *</label>
                <select
                  id="order-store"
                  required
                  value={orderForm.storeId}
                  onChange={(event) => {
                    setOrderForm({
                      ...orderForm,
                      storeId: event.target.value,
                      lines: [{ productId: '', qty: '', unitCost: '' }],
                    });
                    setCsvImportReport(null);
                  }}
                  className={inputClass}
                >
                  <option value="">Selecciona una tienda</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
              <div>
                <span className={labelClass}>Proveedor</span>
                {needsSupplierPick ? (
                  <select id="order-supplier" required aria-label="Proveedor del producto nuevo" value={orderForm.supplierId} onChange={(event) => setOrderForm({ ...orderForm, supplierId: event.target.value })} className={inputClass}>
                    <option value="">Proveedor del producto nuevo</option>
                    {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                ) : (
                  <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                    {orderSupplier ? orderSupplier.name : 'Se toma del producto que elijas'}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={downloadOrderTemplate} className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">
                  <Download className="h-3.5 w-3.5" /> Plantilla CSV
                </button>
                <button type="button" onClick={() => orderCsvInputRef.current?.click()} disabled={!orderForm.storeId || busy} className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50">
                  <Upload className="h-3.5 w-3.5" /> Importar CSV
                </button>
                <input ref={orderCsvInputRef} type="file" accept=".csv,text/csv" onChange={handleOrderCsvFile} className="hidden" aria-label="Archivo CSV de la orden de compra" />
              </div>
              {csvImportReport && (
                <div role="status" className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
                  <p>{csvImportReport.imported} producto(s) importado(s){csvImportReport.errors.length ? `; ${csvImportReport.errors.length} fila(s) omitida(s)` : '.'}</p>
                  {csvImportReport.errors.length > 0 && (
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-rose-300">
                      {csvImportReport.errors.slice(0, 10).map((item) => (
                        <li key={`${item.line}-${item.message}`}>{item.line ? `Fila ${item.line}: ` : ''}{item.message}</li>
                      ))}
                      {csvImportReport.errors.length > 10 && <li>Y {csvImportReport.errors.length - 10} error(es) más.</li>}
                    </ul>
                  )}
                </div>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_2.25rem] gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Producto</span>
                <span>Cantidad</span>
                <span>Costo unit. ($)</span>
                <span />
              </div>
              {orderForm.lines.map((line, index) => {
                const chosen = new Set(orderForm.lines.map((other) => other.productId));
                const chosenCatalog = new Set(orderForm.lines.map((other) => other.catalogId).filter(Boolean));
                const product = products.find((candidate) => candidate.id === line.productId)
                  || catalog.find((candidate) => candidate.id === line.catalogId);
                return (
                  <div key={index} className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_2.25rem] items-center gap-2">
                    <div>
                      <select aria-label="Producto" required disabled={!orderForm.storeId} value={line.newProduct ? NEW_PRODUCT : (line.catalogId ? `${CATALOG_PREFIX}${line.catalogId}` : line.productId)} onChange={(event) => handleProductPick(index, event.target.value)} className={inputClass}>
                        <option value="">{orderForm.storeId ? 'Producto' : 'Elige tienda primero'}</option>
                        <option value={NEW_PRODUCT}>+ Producto nuevo…</option>
                        <optgroup label="En esta tienda">
                          {storeProducts.map((candidate) => (
                            <option key={candidate.id} value={candidate.id} disabled={(chosen.has(candidate.id) && candidate.id !== line.productId) || (candidate.id !== line.productId && supplierNote(candidate.catalogId) !== '')}>
                              {candidate.name}{supplierNote(candidate.catalogId)}
                            </option>
                          ))}
                        </optgroup>
                        {catalogOptions.length > 0 && (
                          <optgroup label="Del catálogo (se habilita en la tienda)">
                            {catalogOptions.map((candidate) => (
                              <option key={candidate.id} value={`${CATALOG_PREFIX}${candidate.id}`} disabled={(chosenCatalog.has(candidate.id) && candidate.id !== line.catalogId) || (candidate.id !== line.catalogId && supplierNote(candidate.id) !== '')}>
                                {candidate.name}{supplierNote(candidate.id)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    <input aria-label="Cantidad" required type="number" min="0.01" step="0.01" placeholder={line.newProduct?.unit || product?.unit || '0'} value={line.qty} onChange={(event) => updateLine(index, { qty: event.target.value })} className={inputClass} />
                    <input aria-label="Costo unitario" required type="number" min="0" step="0.01" placeholder="0.00" value={line.unitCost} onChange={(event) => handleLineCost(index, event.target.value)} className={inputClass} />
                    <button
                      type="button"
                      aria-label="Quitar producto"
                      disabled={orderForm.lines.length === 1}
                      onClick={() => setOrderForm({ ...orderForm, lines: orderForm.lines.filter((_, lineIndex) => lineIndex !== index) })}
                      className="p-2 text-slate-500 hover:text-red-400 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {line.newProduct && (
                    <div className="grid gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 sm:grid-cols-2">
                      <p className="text-[11px] text-cyan-200 sm:col-span-2">
                        Producto nuevo: se crea con stock 0 y recibe el stock cuando registres la recepción.
                      </p>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>Nombre *</label>
                        <input required maxLength={120} value={line.newProduct.name} onChange={(event) => updateNewProduct(index, { name: event.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Categoría *</label>
                        <select required value={line.newProduct.category} onChange={(event) => updateNewProduct(index, { category: event.target.value })} className={inputClass}>
                          <option value="">Selecciona</option>
                          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                          <option value={CUSTOM_CATEGORY}>+ Otra categoría…</option>
                        </select>
                        {line.newProduct.category === CUSTOM_CATEGORY && (
                          <input required maxLength={60} placeholder="Nombre de la categoría" value={line.newProduct.customCategory} onChange={(event) => updateNewProduct(index, { customCategory: event.target.value })} className={`${inputClass} mt-2`} />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelClass}>Unidad</label>
                          <select value={line.newProduct.unit} onChange={(event) => updateNewProduct(index, { unit: event.target.value })} className={inputClass}>
                            {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Precio venta ($) *</label>
                          <input required type="number" min="0.01" step="0.01" value={line.newProduct.price} onChange={(event) => updateNewProduct(index, { price: event.target.value, priceAuto: false })} className={inputClass} />
                          {line.newProduct.priceAuto && line.newProduct.price && (
                            <p className="mt-1 text-[10px] text-slate-400">Sugerido con 50% de margen; puedes editarlo.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setOrderForm({ ...orderForm, lines: [...orderForm.lines, { productId: '', qty: '', unitCost: '' }] })}
                disabled={orderForm.lines.length >= 50}
                className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar producto
              </button>
            </div>
            <div>
              <label htmlFor="order-notes" className={labelClass}>Notas</label>
              <textarea id="order-notes" rows={2} maxLength={500} value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} className={inputClass} />
            </div>
            <div className="flex items-center justify-between border-t border-slate-700 pt-3">
              <p className="text-xs text-slate-400">Total estimado: <strong className="font-mono text-base text-cyan-400">{formatCurrency(orderTotal)}</strong></p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOrderModalOpen(false)} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={busy} className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
                  {busy ? 'Creando...' : 'Crear orden'}
                </button>
              </div>
            </div>
            {actionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{actionError}</p>}
          </form>
        </Modal>
      )}

      {approvalModal && (
        <Modal
          title="Revisar orden de compra"
          subtitle={`${activeSuppliers.find((supplier) => supplier.id === approvalModal.group.supplierId)?.name || 'Proveedor'} · ${storeNameById.get(approvalModal.group.storeId) || 'Tienda'}`}
          onClose={() => setApprovalModal(null)}
          busy={busy}
          wide
        >
          <form onSubmit={handleSubmitApproval} className="space-y-4">
            <p className="text-xs text-slate-400">
              Puedes cambiar productos, cantidades y costos antes de aprobar. El inventario aumentará únicamente al registrar la recepción.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-xs text-slate-300">
                <thead className="border-b border-slate-700 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Producto</th>
                    <th className="px-2 py-2">Cantidad</th>
                    <th className="px-2 py-2">Costo unitario</th>
                    <th className="px-2 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {approvalModal.lines.map((line, index) => (
                    <tr key={`${index}-${line.productId}`}>
                      <td className="px-2 py-2">
                        <select
                          required
                          aria-label={`Producto de la línea ${index + 1}`}
                          value={line.productId}
                          onChange={(event) => handleApprovalProductPick(index, event.target.value)}
                          className={inputClass}
                        >
                          <option value="">Selecciona producto</option>
                          {approvalProducts.map((product) => (
                            <option
                              key={product.id}
                              value={product.id}
                              disabled={approvalModal.lines.some((candidate, otherIndex) => (
                                otherIndex !== index && candidate.productId === product.id
                              ))}
                            >
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          required
                          aria-label={`Cantidad de ${approvalProducts.find((product) => product.id === line.productId)?.name || 'producto'}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.qty}
                          onChange={(event) => updateApprovalLine(index, { qty: event.target.value })}
                          className={`${inputClass} w-28`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          required
                          aria-label={`Costo unitario de ${approvalProducts.find((product) => product.id === line.productId)?.name || 'producto'}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitCost}
                          onChange={(event) => updateApprovalLine(index, { unitCost: event.target.value })}
                          className={`${inputClass} w-28`}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          aria-label="Quitar producto de la orden"
                          title="Quitar producto"
                          disabled={busy || approvalModal.lines.length === 1}
                          onClick={() => setApprovalModal((previous) => ({
                            ...previous,
                            lines: previous.lines.filter((_, lineIndex) => lineIndex !== index),
                          }))}
                          className="p-1 text-slate-400 hover:text-rose-300 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={handleAddApprovalLine}
              disabled={busy || approvalModal.lines.length >= 50 || approvalProducts.every((product) => (
                approvalModal.lines.some((line) => line.productId === product.id)
              ))}
              className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar producto
            </button>
            <div className="flex items-center justify-between border-t border-slate-700 pt-3">
              <p className="text-xs text-slate-400">
                Total estimado:{' '}
                <strong className="font-mono text-base text-cyan-400">
                  {formatCurrency(approvalModal.lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitCost) || 0), 0))}
                </strong>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setApprovalModal(null)} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={busy || approvalModal.lines.length === 0} className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                  <Check className="h-4 w-4" /> {busy ? 'Creando...' : 'Aprobar y crear OC'}
                </button>
              </div>
            </div>
            {actionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{actionError}</p>}
          </form>
        </Modal>
      )}

      {receiveModal && (
        <Modal
          title={`Recibir mercancía · ${receiveModal.order.orderNumber}`}
          subtitle={`${receiveModal.order.supplierName}. Captura lo que llegó; el resto queda pendiente.`}
          onClose={() => setReceiveModal(null)}
          busy={busy}
          wide
        >
          <form onSubmit={handleReceive} className="space-y-4">
            {receiveModal.plan ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  El costo se recalcula como promedio ponderado entre el stock actual y lo que recibes.
                  Revisa el precio de venta sugerido (50% de margen sobre el costo promedio) y decide si actualizarlo.
                </p>
                {receiveModal.plan.map((entry, position) => (
                  <div key={entry.index} className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                    <p className="text-sm font-semibold text-white">{entry.productName}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Costo actual {formatCurrency(entry.currentCost)} → promedio{' '}
                      <strong className="text-cyan-300">{formatCurrency(entry.averageCost)}</strong>
                      {' '}· Precio actual {formatCurrency(entry.currentPrice)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={entry.apply}
                          onChange={(event) => updatePlanEntry(position, { apply: event.target.checked })}
                        />
                        Actualizar precio de venta
                      </label>
                      <input
                        aria-label={`Nuevo precio de venta de ${entry.productName}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        required={entry.apply}
                        disabled={!entry.apply}
                        value={entry.price}
                        onChange={(event) => updatePlanEntry(position, { price: event.target.value })}
                        className={`${inputClass} w-28`}
                      />
                      <span className="text-[10px] text-slate-500">Sugerido {formatCurrency(entry.suggested)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-140 text-left text-xs text-slate-300">
                <thead className="border-b border-slate-700 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Producto</th>
                    <th className="px-2 py-2">Pendiente</th>
                    <th className="px-2 py-2">Recibido ahora</th>
                    {canManagePurchases && <th className="px-2 py-2">Costo unit. ($)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {receiveModal.order.items.map((item, index) => {
                    const pending = pendingQty(item);
                    return (
                      <tr key={item.productId}>
                        <td className="px-2 py-2 text-slate-100">{item.productName}</td>
                        <td className="px-2 py-2 font-mono">{pending} {item.unit}</td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`Cantidad recibida de ${item.productName}`}
                            type="number"
                            min="0"
                            max={pending}
                            step="0.01"
                            disabled={pending <= 0}
                            value={receiveModal.inputs[index].qty}
                            onChange={(event) => updateReceiveInput(index, { qty: event.target.value })}
                            className={`${inputClass} w-28`}
                          />
                        </td>
                        {canManagePurchases && <td className="px-2 py-2">
                          <input
                            aria-label={`Costo unitario de ${item.productName}`}
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={pending <= 0}
                            value={receiveModal.inputs[index].unitCost}
                            onChange={(event) => updateReceiveInput(index, { unitCost: event.target.value })}
                            className={`${inputClass} w-28`}
                          />
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">
              {isCashier
                ? 'Al registrar la recepción, las cantidades se agregarán al inventario de esta tienda.'
                : 'Al recibir se suma el stock y el costo del producto pasa a ser el promedio ponderado entre el stock actual y lo recibido.'}
            </p>
            </>
            )}
            {actionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{actionError}</p>}
            <div className="flex flex-wrap justify-between gap-2">
              {receiveModal.plan ? (
                <button type="button" onClick={() => setReceiveModal({ ...receiveModal, plan: null })} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                  Volver
                </button>
              ) : (
                <button type="button" onClick={handleReceiveAll} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                  Recibir todo lo pendiente
                </button>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setReceiveModal(null)} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={busy} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                  {busy ? 'Registrando...' : receiveModal.plan ? 'Confirmar recepción' : 'Registrar recepción'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
