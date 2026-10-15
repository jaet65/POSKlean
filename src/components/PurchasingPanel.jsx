import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Plus, Trash2, Truck, Users, X } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import {
  addSupplier,
  setSupplierStatus,
  subscribeToSuppliers,
  updateSupplier,
} from '../services/supplierService';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  receivePurchaseOrder,
  subscribeToPurchaseOrders,
  suggestedSalePrice,
  weightedAverageCost,
} from '../services/purchaseService';

const STATUS_LABELS = {
  pending: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  partial: { label: 'Recibida parcial', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  received: { label: 'Recibida', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  cancelled: { label: 'Cancelada', className: 'bg-slate-600/30 text-slate-400 border-slate-600' },
};

const EMPTY_SUPPLIER = { name: '', contactName: '', phone: '', email: '', notes: '' };
const NEW_PRODUCT = '__new__';
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

export default function PurchasingPanel({ currentUser, activeStoreId, stores = [], products }) {
  const [section, setSection] = useState('orders');
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const [supplierModal, setSupplierModal] = useState(null); // { id?, ...fields }
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({ storeId: '', supplierId: '', notes: '', lines: [] });
  const [receiveModal, setReceiveModal] = useState(null); // { order, inputs }
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => subscribeToSuppliers(
    (list) => { setSuppliers(list); setLoadError(''); },
    (error) => setLoadError(`No se pudieron cargar los proveedores: ${error.message}`),
  ), []);

  const storeIdsKey = activeStoreId || stores.map((store) => store.id).join('|');
  useEffect(() => subscribeToPurchaseOrders(
    storeIdsKey ? storeIdsKey.split('|') : [],
    (list) => { setOrders(list); setLoadError(''); },
    (error) => setLoadError(`No se pudieron cargar las órdenes de compra: ${error.message}`),
  ), [storeIdsKey]);

  const storeNameById = useMemo(
    () => new Map(stores.map((store) => [store.id, store.name])),
    [stores],
  );
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
  const categories = useMemo(
    () => [...new Set(storeProducts.map((product) => String(product.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [storeProducts],
  );

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
    const defaultStoreId = activeStoreId || (stores.length === 1 ? stores[0].id : '');
    setOrderForm({ storeId: defaultStoreId, supplierId: '', notes: '', lines: [{ productId: '', qty: '', unitCost: '' }] });
    setOrderModalOpen(true);
  };

  const updateLine = (index, changes) => {
    setOrderForm((previous) => ({
      ...previous,
      lines: previous.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)),
    }));
  };

  const handleProductPick = (index, productId) => {
    if (productId === NEW_PRODUCT) {
      updateLine(index, { productId: '', unitCost: '', newProduct: { ...EMPTY_NEW_PRODUCT, category: categories[0] || '' } });
      return;
    }
    const product = products.find((candidate) => candidate.id === productId);
    updateLine(index, { productId, newProduct: null, unitCost: product ? String(product.cost ?? '') : '' });
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
    const supplier = suppliers.find((candidate) => candidate.id === orderForm.supplierId);
    const ok = await run(
      () => createPurchaseOrder({
        storeId: orderForm.storeId,
        supplier,
        notes: orderForm.notes,
        products,
        user: currentUser,
        lines: orderForm.lines.map((line) => ({
          productId: line.productId,
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

  const handleToggleSupplier = async (supplier) => {
    const archiving = supplier.status !== 'archived';
    if (archiving && !window.confirm(`¿Archivar a "${supplier.name}"? No podrás crear órdenes nuevas con este proveedor.`)) return;
    await run(
      () => setSupplierStatus(supplier.id, archiving ? 'archived' : 'active'),
      archiving ? 'Proveedor archivado.' : 'Proveedor reactivado.',
    );
  };

  const tabClass = (id) => `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
    section === id
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
          <button type="button" onClick={() => setSection('suppliers')} className={tabClass('suppliers')}>
            <Users className="h-4 w-4" /> Proveedores
          </button>
        </div>
        {section === 'orders' ? (
          <button
            type="button"
            onClick={openOrderModal}
            disabled={stores.length === 0 || activeSuppliers.length === 0 || products.length === 0}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Nueva orden
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openSupplierModal()}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </button>
        )}
      </div>

      {loadError && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>
      )}
      {actionError && !supplierModal && !orderModalOpen && !receiveModal && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{actionError}</p>
      )}

      {section === 'suppliers' && (
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

      {section === 'orders' && (
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
            {activeSuppliers.length === 0 && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                Agrega al menos un proveedor activo para crear órdenes de compra.
              </p>
            )}
            {orders.length === 0 ? (
              <p className="rounded-2xl border border-slate-700 bg-slate-800 py-10 text-center text-sm text-slate-400">
                Esta tienda aún no tiene órdenes de compra.
              </p>
            ) : orders.map((order) => {
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
                    <div className="text-right text-xs">
                      <p className="font-mono text-base font-bold text-cyan-400">{formatCurrency((order.totalCents || 0) / 100)}</p>
                      {order.receivedCents > 0 && (
                        <p className="text-slate-400">Recibido {formatCurrency(order.receivedCents / 100)}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isOpen ? null : order.id)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
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
                    {order.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order)}
                        disabled={busy}
                        className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        Cancelar orden
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
                            <th className="px-3 py-2">Costo unit.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                          {order.items.map((item) => (
                            <tr key={item.productId}>
                              <td className="px-3 py-2 text-slate-100">{item.productName}</td>
                              <td className="px-3 py-2 font-mono">{item.qtyOrdered} {item.unit}</td>
                              <td className="px-3 py-2 font-mono">{item.qtyReceived} {item.unit}</td>
                              <td className="px-3 py-2 font-mono">{formatCurrency(item.unitCostCents / 100)}</td>
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
                  onChange={(event) => setOrderForm({
                    ...orderForm,
                    storeId: event.target.value,
                    lines: [{ productId: '', qty: '', unitCost: '' }],
                  })}
                  className={inputClass}
                >
                  <option value="">Selecciona una tienda</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="order-supplier" className={labelClass}>Proveedor *</label>
                <select id="order-supplier" required value={orderForm.supplierId} onChange={(event) => setOrderForm({ ...orderForm, supplierId: event.target.value })} className={inputClass}>
                  <option value="">Selecciona un proveedor</option>
                  {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <p className={labelClass}>Productos</p>
              <div className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_2.25rem] gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Producto</span>
                <span>Cantidad</span>
                <span>Costo unit. ($)</span>
                <span />
              </div>
              {orderForm.lines.map((line, index) => {
                const chosen = new Set(orderForm.lines.map((other) => other.productId));
                const product = products.find((candidate) => candidate.id === line.productId);
                return (
                  <div key={index} className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_2.25rem] items-center gap-2">
                    <div>
                      <select aria-label="Producto" required disabled={!orderForm.storeId} value={line.newProduct ? NEW_PRODUCT : line.productId} onChange={(event) => handleProductPick(index, event.target.value)} className={inputClass}>
                        <option value="">{orderForm.storeId ? 'Producto' : 'Elige tienda primero'}</option>
                        <option value={NEW_PRODUCT}>+ Producto nuevo…</option>
                        {storeProducts.map((candidate) => (
                          <option key={candidate.id} value={candidate.id} disabled={chosen.has(candidate.id) && candidate.id !== line.productId}>
                            {candidate.name}
                          </option>
                        ))}
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
                    <th className="px-2 py-2">Costo unit. ($)</th>
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
                        <td className="px-2 py-2">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">Al recibir se suma el stock y el costo del producto pasa a ser el promedio ponderado entre el stock actual y lo recibido.</p>
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
