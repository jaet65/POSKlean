import { useEffect, useMemo, useRef, useState } from 'react';
import PrintTicket from './components/PrintTicket';
import POSCatalog from './components/POSCatalog';
import POSCartPanel from './components/POSCartPanel';
import InventoryTable from './components/InventoryTable';
import PurchasingPanel from './components/PurchasingPanel';
import CatalogPanel from './components/CatalogPanel';
import AdminPanel from './components/admin/AdminPanel';
import { DEFAULT_CHANNELS, subscribeToSalesChannels } from './services/channelService';
import { formatOtherUnits, summarizeVolume } from './utils/volume';
import { formatCurrency } from './utils/currency';
import { 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Store, 
  Truck, 
  MessageSquare, 
  DollarSign,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Droplet,
  Layers,
  Printer,
  Users,
  ShieldCheck,
  LogOut,
  Lock,
  Key,
  User,
  History,
  ClipboardCheck,
} from 'lucide-react';
import { usePOSData } from './hooks/usePOSData';
import { useCashShift } from './hooks/useCashShift';
import {
  deleteProduct as removeProduct,
  updateProductMinStock as saveMinStock,
  completeInventoryAudit as saveInventoryAudit,
} from './services/inventoryService';
import { createSale } from './services/salesService';
import { createPurchaseRequest, subscribeToPurchaseRequests } from './services/purchaseService';
import { setStorePriceOverride } from './services/catalogService';
import { transferInventory } from './services/transferService';
import { closeCashShift, openCashShift } from './services/cashShiftService';
import {
  DEFAULT_PERMISSIONS,
  MIN_PASSWORD_LENGTH,
  SUPER_ADMIN_EMAIL,
  addUser as saveUser,
  deleteUser as removeUser,
  loginWithCredentials,
  loginWithGoogle,
  logoutUser,
  subscribeAuthState,
  subscribeToUsers,
  updateUser as saveUserUpdate,
} from './services/userService';
import {
  addStore as saveStore,
  subscribeToStores,
  updateStoreReceiptWidth as saveStoreReceiptWidth,
  updateStore as saveStoreUpdate,
  updateStoreStatus as saveStoreStatus,
} from './services/storeService';

const INITIAL_USER_FORM = {
  authType: 'credentials', // 'credentials' | 'google'
  username: '',
  password: '',
  email: '',
  displayName: '',
  role: 'cajero',
  permissions: { pos: true, inventory: true, sales: true, users: false },
  status: 'active',
  storeId: '',
};

const getCurrentDayRange = () => {
  const today = new Date();
  return {
    start: new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
    end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime(),
  };
};

const INITIAL_DAY_RANGE = getCurrentDayRange();
const MIN_RECEIPT_WIDTH_MM = 30;
const MAX_RECEIPT_WIDTH_MM = 120;

export default function App() {
  const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'inventory', 'sales'
  const [stores, setStores] = useState([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const hasPromptedFirstStore = useRef(false);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState(null);
  const [storeForm, setStoreForm] = useState({ name: '', address: '', phone: '', cashierIds: [] });
  const [storeError, setStoreError] = useState('');
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pendingPurchaseRequestsCount, setPendingPurchaseRequestsCount] = useState(0);
  const [isSavingSale, setIsSavingSale] = useState(false);
  const [isSubmittingPurchaseRequest, setIsSubmittingPurchaseRequest] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [ticketToPrint, setTicketToPrint] = useState(null);
  const [lastCompletedSale, setLastCompletedSale] = useState(null);
  const [isSavingReceiptWidth, setIsSavingReceiptWidth] = useState(false);
  const [dayRange, setDayRange] = useState(INITIAL_DAY_RANGE);
  
  // POS State
  const [cart, setCart] = useState([]);
  const [lastCartTouch, setLastCartTouch] = useState({ id: null, n: 0 });
  const [cartQuantityDrafts, setCartQuantityDrafts] = useState({});
  const [chosenChannel, setSelectedChannel] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const pendingProductRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);
  const [cashShiftModal, setCashShiftModal] = useState(null);
  const [openingCashDraft, setOpeningCashDraft] = useState('0');
  const [countedCashDraft, setCountedCashDraft] = useState('');
  const [cashShiftActionError, setCashShiftActionError] = useState('');
  const [isSavingCashShift, setIsSavingCashShift] = useState(false);

  // Inventory Modal State
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [restockError, setRestockError] = useState('');
  const [isInventoryHistoryOpen, setIsInventoryHistoryOpen] = useState(false);
  const [inventoryTargetStoreId, setInventoryTargetStoreId] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('all');
  const [isInventoryAuditOpen, setIsInventoryAuditOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ sourceStoreId: '', stockId: '', destStoreId: '', amount: '' });
  const [transferError, setTransferError] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showPreviousAuditTickets, setShowPreviousAuditTickets] = useState(false);
  const [inventoryAuditCounts, setInventoryAuditCounts] = useState({});
  const [isSavingInventoryAudit, setIsSavingInventoryAudit] = useState(false);
  const [inventoryAuditError, setInventoryAuditError] = useState('');
  const [inventoryAuditResult, setInventoryAuditResult] = useState(null);
  const [editingMinStockProductId, setEditingMinStockProductId] = useState(null);
  const [minStockDraft, setMinStockDraft] = useState('');
  const [isSavingMinStock, setIsSavingMinStock] = useState(false);
  const [editingPriceProductId, setEditingPriceProductId] = useState(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Add Product Modal State
  const [addProductSuccess, setAddProductSuccess] = useState('');

  // Auth & Permissions State
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginMode, setLoginMode] = useState('credentials'); // 'credentials' | 'google'
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const { products, catalog, sales: salesHistory, movements, loading, error: dataError } = usePOSData(
    currentUser?.role === 'cajero' ? currentUser?.storeId : selectedStoreId,
    Boolean(currentUser?.status === 'active'
      && (currentUser?.role !== 'cajero' || currentUser?.storeId)),
  );
  const activeStores = useMemo(
    () => stores.filter((store) => store.status !== 'archived'),
    [stores],
  );

  // Users Management State (Admin)
  const [usersList, setUsersList] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(INITIAL_USER_FORM);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userFormError, setUserFormError] = useState('');
  const [userSuccessMessage, setUserSuccessMessage] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeAuthState((profile) => {
      setSelectedStoreId(null);
      setCurrentUser(profile);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const canAccessUsers = currentUser?.role === 'admin' 
    || currentUser?.permissions?.users 
    || currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const isAdmin = currentUser?.role === 'admin';
  const [storedChannels, setStoredChannels] = useState([]);
  useEffect(() => {
    if (!currentUser) {
      setStoredChannels([]);
      return undefined;
    }
    return subscribeToSalesChannels(setStoredChannels, () => setStoredChannels([]));
  }, [currentUser?.id, currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const salesChannelNames = storedChannels.length > 0
    ? storedChannels.map((channel) => channel.name)
    : DEFAULT_CHANNELS;
  // Con un único canal disponible se usa automáticamente; un canal elegido que ya no existe se descarta.
  const hasSingleChannel = salesChannelNames.length === 1;
  const selectedChannel = hasSingleChannel
    ? salesChannelNames[0]
    : (salesChannelNames.includes(chosenChannel) ? chosenChannel : null);
  const isEditingArchivedStore = stores.some(
    (store) => store.id === editingStoreId && store.status === 'archived',
  );
  const canAccessPos = currentUser?.role === 'admin' || currentUser?.permissions?.pos;
  const canAccessInventory = currentUser?.role === 'admin' || currentUser?.permissions?.inventory;
  const canAccessSales = currentUser?.role === 'admin' || currentUser?.permissions?.sales;
  const currentUserId = currentUser?.id || currentUser?.uid || null;
  const isStoreManager = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const isCashier = currentUser?.role === 'cajero';
  const canAccessPurchases = currentUser?.status === 'active'
    && (isStoreManager || (isCashier && Boolean(currentUser?.storeId)));
  const canAccessCatalog = currentUser?.status === 'active' && isStoreManager;
  const activeStoreId = isStoreManager ? selectedStoreId : currentUser?.storeId || null;
  const activeStore = stores.find((store) => store.id === activeStoreId) || null;
  const storedReceiptWidth = Number(activeStore?.receiptWidth);
  const receiptWidth = Number.isFinite(storedReceiptWidth)
    && storedReceiptWidth >= MIN_RECEIPT_WIDTH_MM
    && storedReceiptWidth <= MAX_RECEIPT_WIDTH_MM
    ? String(storedReceiptWidth)
    : '58';
  const isGeneralView = isStoreManager && !selectedStoreId;
  const purchaseRequestStoreIds = isStoreManager
    ? selectedStoreId ? [selectedStoreId] : activeStores.map((store) => store.id)
    : [];
  const purchaseRequestStoreIdsKey = purchaseRequestStoreIds.join('|');
  const canUsePos = canAccessPos && !isGeneralView;
  const { shift: cashShift, loading: cashShiftLoading, error: cashShiftError } = useCashShift(
    activeStoreId,
    currentUserId,
    Boolean(canUsePos && activeStoreId && currentUserId),
  );
  const isCashShiftOpen = cashShift?.status === 'open' && cashShift.storeId === activeStoreId;
  const cashShiftStoreMismatch = cashShift?.status === 'open' && !isCashShiftOpen;
  const [usersLoadedForUserId, setUsersLoadedForUserId] = useState(null);
  const usersLoading = Boolean(canAccessUsers && usersLoadedForUserId !== (currentUserId || 'unknown'));

  useEffect(() => {
    if (!canAccessPurchases || !isStoreManager || !purchaseRequestStoreIdsKey) return undefined;
    return subscribeToPurchaseRequests(
      purchaseRequestStoreIdsKey.split('|'),
      (requests) => setPendingPurchaseRequestsCount(
        requests.filter((request) => request.status === 'pending').length,
      ),
      (error) => setActionError(`No se pudieron contar las solicitudes de compra: ${error.message}`),
    );
  }, [canAccessPurchases, isStoreManager, purchaseRequestStoreIdsKey]);

  useEffect(() => {
    if (!currentUser || currentUser.status !== 'active') {
      return undefined;
    }

    const unsubscribe = subscribeToStores(
      (nextStores) => {
        setStores(nextStores);
        setStoresLoaded(true);
      },
      (error) => {
        setStoreError(`No se pudieron cargar las tiendas: ${error.message}`);
        setStoresLoaded(true);
      },
    );
    return () => {
      unsubscribe();
      setStoresLoaded(false);
    };
  }, [currentUser, currentUserId, currentUser?.status]);

  // Primer inicio: si no existe ninguna tienda, se le pide al administrador crear una.
  const needsFirstStore = Boolean(isAdmin && storesLoaded && stores.length === 0);
  useEffect(() => {
    if (needsFirstStore && !hasPromptedFirstStore.current) {
      hasPromptedFirstStore.current = true;
      setEditingStoreId(null);
      setStoreForm({ name: '', address: '', phone: '', cashierIds: [] });
      setStoreError('');
      setIsStoreModalOpen(true);
    }
  }, [needsFirstStore]);

  useEffect(() => {
    if (!canAccessUsers) {
      return undefined;
    }
    const userKey = currentUserId || 'unknown';
    const unsubscribe = subscribeToUsers(
      (list) => {
        setUsersList(list);
        setUsersLoadedForUserId(userKey);
      },
      (err) => {
        setActionError(`Error al cargar usuarios: ${err.message}`);
        setUsersLoadedForUserId(userKey);
      }
    );
    return () => unsubscribe();
  }, [canAccessUsers, currentUserId]);

  const pendingUsersCount = useMemo(() => {
    return usersList.filter(u => u.status === 'pending').length;
  }, [usersList]);

  const tabPermissions = {
    pos: canUsePos,
    inventory: canAccessInventory,
    sales: canAccessSales,
    purchases: canAccessPurchases,
    catalog: canAccessCatalog,
    users: canAccessUsers,
  };
  const fallbackTabs = {
    pos: ['inventory', 'purchases', 'catalog', 'sales', 'users'],
    inventory: ['pos', 'purchases', 'catalog', 'sales', 'users'],
    purchases: ['pos', 'inventory', 'catalog', 'sales', 'users'],
    catalog: ['pos', 'inventory', 'purchases', 'sales', 'users'],
    sales: ['pos', 'inventory', 'purchases', 'catalog', 'users'],
    users: ['pos', 'inventory', 'purchases', 'catalog', 'sales'],
  };
  const visibleTab = !currentUser || currentUser.status !== 'active' || tabPermissions[activeTab]
    ? activeTab
    : fallbackTabs[activeTab]?.find((tab) => tabPermissions[tab]) || activeTab;

  useEffect(() => {
    if (!ticketToPrint) return undefined;

    const clearPrintedDocument = () => {
      setTicketToPrint(null);
    };
    window.addEventListener('afterprint', clearPrintedDocument);
    window.print();
    return () => window.removeEventListener('afterprint', clearPrintedDocument);
  }, [ticketToPrint]);

  useEffect(() => {
    const timer = window.setInterval(() => setDayRange(getCurrentDayRange()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const salesToday = useMemo(() => {
    return salesHistory.filter((sale) => sale.timestampMs >= dayRange.start && sale.timestampMs < dayRange.end);
  }, [salesHistory, dayRange]);

  // --- Filtrado por perfil: cajeros solo ven sus propias ventas ---
  const isCajero = currentUser?.role === 'cajero';
  const visibleSalesHistory = useMemo(() => {
    if (!isCajero || !currentUserId) return salesHistory;
    return salesHistory.filter(
      (sale) => sale.createdBy?.userId === currentUserId,
    );
  }, [salesHistory, isCajero, currentUserId]);

  const visibleSalesToday = useMemo(() => {
    if (!isCajero || !currentUserId) return salesToday;
    return salesToday.filter(
      (sale) => sale.createdBy?.userId === currentUserId,
    );
  }, [salesToday, isCajero, currentUserId]);

  const currentShiftPaymentTotals = useMemo(() => ({
    cash: (cashShift?.paymentTotalsCents?.cash || 0) / 100,
    card: (cashShift?.paymentTotalsCents?.card || 0) / 100,
    transfer: (cashShift?.paymentTotalsCents?.transfer || 0) / 100,
  }), [cashShift]);
  const currentShiftExpectedCash = Number(
    (((cashShift?.openingCashCents || 0) / 100) + currentShiftPaymentTotals.cash).toFixed(2),
  );

  const cashClosureSummary = useMemo(() => {
    const channels = new Map();
    const storesSummary = new Map();
    const products = new Map();
    visibleSalesToday.forEach((sale) => {
      const storeId = sale.storeId || null;
      const currentStore = storesSummary.get(storeId) || { storeId, total: 0, tickets: 0 };
      storesSummary.set(storeId, {
        ...currentStore,
        total: currentStore.total + sale.total,
        tickets: currentStore.tickets + 1,
      });

      const channel = sale.channel || 'Sin canal';
      const current = channels.get(channel) || { total: 0, tickets: 0 };
      channels.set(channel, {
        total: current.total + sale.total,
        tickets: current.tickets + 1,
      });

      sale.items.forEach((item) => {
        const productKey = item.productId || item.name;
        const currentProduct = products.get(productKey) || {
          key: productKey,
          name: item.name,
          unit: item.unit || 'L',
          quantity: 0,
          total: 0,
        };
        products.set(productKey, {
          ...currentProduct,
          quantity: currentProduct.quantity + item.qty,
          total: currentProduct.total + (item.total ?? item.qty * item.price),
        });
      });
    });

    return {
      total: visibleSalesToday.reduce((sum, sale) => sum + sale.total, 0),
      tickets: visibleSalesToday.length,
      ...summarizeVolume(visibleSalesToday.flatMap((sale) => sale.items)),
      channels: Array.from(channels, ([channel, summary]) => ({ channel, ...summary }))
        .sort((first, second) => first.channel.localeCompare(second.channel, 'es')),
      stores: Array.from(storesSummary.values())
        .sort((first, second) => second.total - first.total),
      products: Array.from(products.values())
        .sort((first, second) => second.total - first.total),
    };
  }, [visibleSalesToday]);

  const inventoryProductsForEdit = useMemo(() => (
    isGeneralView
      ? products.filter((product) => product.storeId === inventoryTargetStoreId)
      : products
  ), [isGeneralView, inventoryTargetStoreId, products]);

  const inventoryAuditPreview = useMemo(() => inventoryProductsForEdit.reduce((summary, product) => {
    const rawCount = inventoryAuditCounts[product.id];
    if (rawCount === undefined || rawCount.trim() === '') return summary;

    const countedStock = Number(rawCount);
    if (!Number.isFinite(countedStock) || countedStock < 0
      || Number((countedStock * 100).toFixed(0)) / 100 !== countedStock) {
      return summary;
    }

    const difference = Number((countedStock - product.currentStock).toFixed(2));
    const shortage = Math.max(0, -difference);
    return {
      countedProducts: summary.countedProducts + 1,
      shortageUnits: summary.shortageUnits + shortage,
      lossValue: summary.lossValue + shortage * product.price,
      surplusUnits: summary.surplusUnits + Math.max(0, difference),
      surplusValue: summary.surplusValue + Math.max(0, difference) * product.price,
      adjustedProducts: summary.adjustedProducts + Number(difference !== 0),
    };
  }, {
    countedProducts: 0,
    shortageUnits: 0,
    lossValue: 0,
    surplusUnits: 0,
    surplusValue: 0,
    adjustedProducts: 0,
  }), [inventoryProductsForEdit, inventoryAuditCounts]);

  const lowStockProducts = useMemo(() => {
    return products.filter((product) => product.currentStock <= product.minStock);
  }, [products]);
  const lowStockCount = lowStockProducts.length;

  const filteredMovements = useMemo(() => (
    movementTypeFilter === 'all'
      ? movements
      : movements.filter((movement) => movement.type === movementTypeFilter)
  ), [movements, movementTypeFilter]);

  const previousInventoryAudits = useMemo(() => {
    const auditsById = new Map();
    movements
      .filter((movement) => movement.type === 'audit')
      .forEach((movement) => {
        const auditId = movement.auditId || movement.referenceId;
        if (!auditId) return;

        const audit = auditsById.get(auditId) || {
          auditId,
          ticketId: movement.ticketId || `AUD-${auditId.slice(0, 8).toUpperCase()}`,
          storeId: movement.storeId || null,
          createdBy: movement.createdBy || { userName: 'Desconocido' },
          timestamp: movement.timestamp || 'Fecha no disponible',
          timestampMs: movement.timestampMs || 0,
          lines: [],
          shortageUnits: 0,
          lossValue: 0,
          surplusUnits: 0,
          surplusValue: 0,
        };
        const line = {
          productId: movement.productId || movement.id,
          productName: movement.productName || 'Producto',
          unit: movement.unit || 'L',
          expectedStock: movement.expectedStock ?? movement.previousStock ?? 0,
          countedStock: movement.countedStock ?? movement.newStock ?? 0,
          difference: movement.difference ?? movement.amount ?? 0,
          shortage: movement.shortage ?? Math.max(0, -(movement.difference ?? movement.amount ?? 0)),
          surplus: movement.surplus ?? Math.max(0, movement.difference ?? movement.amount ?? 0),
          lossValue: movement.lossValue ?? 0,
          surplusValue: movement.surplusValue ?? 0,
        };
        audit.lines.push(line);
        audit.shortageUnits += line.shortage;
        audit.lossValue += line.lossValue;
        audit.surplusUnits += line.surplus;
        audit.surplusValue += line.surplusValue;
        auditsById.set(auditId, audit);
      });

    return Array.from(auditsById.values())
      .map((audit) => ({
        ...audit,
        auditedProducts: audit.lines.length,
        adjustedProducts: audit.lines.filter((line) => line.difference !== 0).length,
      }))
      .sort((first, second) => second.timestampMs - first.timestampMs);
  }, [movements]);

  const inventoryValueAtCost = useMemo(() => {
    return products.reduce((acc, product) => acc + (product.currentStock * product.cost), 0);
  }, [products]);

  const inventoryValueAtSalePrice = useMemo(() => {
    return products.reduce((acc, product) => acc + (product.currentStock * product.price), 0);
  }, [products]);

  const availableCategories = useMemo(() => {
    const cats = new Set();
    products.forEach((p) => {
      if (p.category && typeof p.category === 'string' && p.category.trim()) {
        cats.add(p.category.trim());
      }
    });
    return Array.from(cats);
  }, [products]);

  useEffect(() => {
    if (selectedCategory !== 'Todos' && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory('Todos');
    }
  }, [availableCategories, selectedCategory]);

  const storeNameById = useMemo(
    () => new Map(stores.map((store) => [store.id, store.name])),
    [stores],
  );

  const inventoryTableProducts = useMemo(() => {
    if (!isGeneralView) return products;

    return [...products].sort((first, second) => {
      const firstStoreName = storeNameById.get(first.storeId) || 'Sin tienda';
      const secondStoreName = storeNameById.get(second.storeId) || 'Sin tienda';
      return firstStoreName.localeCompare(secondStoreName, 'es')
        || first.name.localeCompare(second.name, 'es');
    });
  }, [isGeneralView, products, storeNameById]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleSelectProductToCart = (product, channelOverride = null) => {
    if (isGeneralView) return;
    if (!channelOverride && !selectedChannel) {
      pendingProductRef.current = product;
      setShowChannelModal(true);
      return;
    }
    const existingItem = cart.find((item) => item.id === product.id);
    const nextQuantity = Number(((existingItem?.qty || 0) + 1).toFixed(2));

    if (nextQuantity > product.currentStock) {
      alert(`⚠️ Stock insuficiente. Solo quedan ${product.currentStock} ${product.unit} disponibles.`);
      return;
    }

    setLastCartTouch((previous) => ({ id: product.id, n: previous.n + 1 }));
    setCart(existingItem
      ? cart.map((item) => item.id === product.id
        ? { ...item, qty: nextQuantity, total: Number((nextQuantity * product.price).toFixed(2)) }
        : item)
      : [...cart, {
        id: product.id,
        name: product.name,
        price: product.price,
        unit: product.unit,
        qty: 1,
        total: Number(product.price.toFixed(2)),
      }]);
  };

  const handleCartQuantityChange = (productId, value) => {
    setCartQuantityDrafts((previous) => ({ ...previous, [productId]: value }));
    const quantity = parseFloat(value);
    const product = products.find((item) => item.id === productId);
    if (!value || !Number.isFinite(quantity) || quantity <= 0
      || Number((quantity * 100).toFixed(0)) / 100 !== quantity
      || !product || quantity > product.currentStock) {
      return;
    }

    setCart((previous) => previous.map((item) => item.id === productId
      ? { ...item, qty: quantity, total: Number((quantity * item.price).toFixed(2)) }
      : item));
  };

  const handleCartQuantityBlur = (productId) => {
    const quantity = parseFloat(cartQuantityDrafts[productId]);
    const product = products.find((item) => item.id === productId);
    if (Number.isFinite(quantity) && quantity > 0
      && Number((quantity * 100).toFixed(0)) / 100 === quantity
      && product && quantity <= product.currentStock) {
      setCart((previous) => previous.map((item) => item.id === productId
        ? { ...item, qty: quantity, total: Number((quantity * item.price).toFixed(2)) }
        : item));
    }
    setCartQuantityDrafts((previous) => {
      const next = { ...previous };
      delete next[productId];
      return next;
    });
  };

  const handleRemoveFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
    setCartQuantityDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.total, 0);
  }, [cart]);

  const cartVolume = useMemo(() => summarizeVolume(cart), [cart]);

  const handleCompleteSale = async (paymentMethod) => {
    if (isGeneralView || !selectedChannel || cart.length === 0 || isSavingSale) return;
    if (!isCashShiftOpen) {
      setShowPaymentModal(false);
      setCashShiftActionError('Abre un turno de caja antes de registrar ventas.');
      return;
    }
    setActionError('');
    setIsSavingSale(true);
    try {
      const sale = await createSale({
        cart,
        channel: selectedChannel,
        paymentMethod,
        shiftId: cashShift.id,
        user: currentUser,
        storeId: activeStoreId,
      });
      setCart([]);
      setSelectedChannel(null);
      setCartQuantityDrafts({});
      setShowPaymentModal(false);
      setLastCompletedSale(sale);
      setShowCheckoutSuccess(true);
      setTimeout(() => setShowCheckoutSuccess(false), 3000);
    } catch (error) {
      setActionError(error.message || 'No se pudo registrar la venta.');
    } finally {
      setIsSavingSale(false);
    }
  };

  const handleOpenCashShift = async (event) => {
    event.preventDefault();
    if (isSavingCashShift || !activeStoreId || cashShift?.status === 'open') return;
    setCashShiftActionError('');
    setIsSavingCashShift(true);
    try {
      await openCashShift({
        storeId: activeStoreId,
        user: currentUser,
        openingCash: Number(openingCashDraft),
      });
      setCashShiftModal(null);
      setOpeningCashDraft('0');
    } catch (error) {
      setCashShiftActionError(error.message || 'No se pudo abrir el turno.');
    } finally {
      setIsSavingCashShift(false);
    }
  };

  const handleCloseCashShift = async (event) => {
    event.preventDefault();
    if (isSavingCashShift || !activeStoreId || !isCashShiftOpen) return;
    if (cart.length > 0) {
      setCashShiftActionError('Vacía el carrito antes de cerrar el turno.');
      return;
    }
    setCashShiftActionError('');
    setIsSavingCashShift(true);
    try {
      const closedShift = await closeCashShift({
        shiftId: cashShift.id,
        storeId: activeStoreId,
        user: currentUser,
        countedCash: Number(countedCashDraft),
      });
      setCashShiftModal(null);
      setCountedCashDraft('');
      setTicketToPrint({
        type: 'cashShift',
        data: {
          ...closedShift,
          storeName: storeNameById.get(activeStoreId) || activeStoreId,
        },
      });
    } catch (error) {
      setCashShiftActionError(error.message || 'No se pudo cerrar el turno.');
    } finally {
      setIsSavingCashShift(false);
    }
  };

  const handleOpenRestock = (product) => {
    setRestockProduct(product);
    setRestockAmount('');
    setRestockError('');
    setIsRestockOpen(true);
  };

  const handleDeleteProduct = async (product) => {
    if (!isAdmin || Number(product.currentStock) !== 0 || deletingProductId) return;
    if (!window.confirm(`¿Eliminar el producto "${product.name}" de esta tienda?`)) return;

    setActionError('');
    setDeletingProductId(product.id);
    try {
      await removeProduct(product.id, currentUser, product.storeId || activeStoreId);
      setAddProductSuccess(`Producto "${product.name}" eliminado correctamente.`);
      setTimeout(() => setAddProductSuccess(''), 4000);
    } catch (error) {
      setActionError(error.message || 'No se pudo eliminar el producto.');
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleOpenTransfer = () => {
    setTransferForm({
      sourceStoreId: isGeneralView ? '' : activeStoreId || '',
      stockId: '',
      destStoreId: '',
      amount: '',
    });
    setTransferError('');
    setIsTransferOpen(true);
  };

  const handleSubmitTransfer = async (event) => {
    event.preventDefault();
    if (isTransferring) return;
    const source = products.find((product) => product.id === transferForm.stockId);
    const amount = Number(transferForm.amount);
    if (!source || !transferForm.destStoreId) {
      setTransferError('Selecciona el producto y la tienda destino.');
      return;
    }
    if (!(amount > 0) || amount > Number(source.currentStock)) {
      setTransferError(`Indica una cantidad entre 0 y ${source.currentStock}.`);
      return;
    }
    setIsTransferring(true);
    setTransferError('');
    try {
      await transferInventory({
        sourceStockId: source.id,
        destStoreId: transferForm.destStoreId,
        amount,
        user: currentUser,
      });
      setIsTransferOpen(false);
      setAddProductSuccess(`Transferencia de "${source.name}" a ${storeNameById.get(transferForm.destStoreId) || 'la tienda destino'} completada.`);
      setTimeout(() => setAddProductSuccess(''), 4000);
    } catch (error) {
      setTransferError(error.message || 'No se pudo completar la transferencia.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleOpenInventoryAudit = () => {
    if (!isAdmin) return;
    const productsToAudit = isGeneralView
      ? products.filter((product) => product.storeId === inventoryTargetStoreId)
      : products;
    setInventoryAuditCounts(Object.fromEntries(productsToAudit.map((product) => [product.id, ''])));
    setInventoryAuditError('');
    setInventoryAuditResult(null);
    setShowPreviousAuditTickets(false);
    setIsInventoryAuditOpen(true);
  };

  const handleInventoryAuditStoreChange = (storeId) => {
    setInventoryTargetStoreId(storeId);
    setInventoryAuditCounts(Object.fromEntries(
      products
        .filter((product) => product.storeId === storeId)
        .map((product) => [product.id, '']),
    ));
    setInventoryAuditError('');
  };

  const handleCompleteInventoryAudit = async (event) => {
    event.preventDefault();
    if (!isAdmin || isSavingInventoryAudit) return;
    if (isGeneralView && !inventoryTargetStoreId) {
      setInventoryAuditError('Selecciona la tienda que deseas auditar.');
      return;
    }
    if (inventoryAuditPreview.countedProducts !== inventoryProductsForEdit.length || inventoryProductsForEdit.length === 0) {
      setInventoryAuditError('Captura un conteo válido para cada producto antes de continuar.');
      return;
    }

    setInventoryAuditError('');
    setIsSavingInventoryAudit(true);
    try {
      const result = await saveInventoryAudit({
        counts: inventoryProductsForEdit.map((product) => ({
          productId: product.id,
          countedStock: Number(inventoryAuditCounts[product.id]),
        })),
        user: currentUser,
        storeId: isGeneralView ? inventoryTargetStoreId : activeStoreId,
      });
      setInventoryAuditResult(result);
    } catch (error) {
      setInventoryAuditError(error.message || 'No se pudo completar la auditoría.');
    } finally {
      setIsSavingInventoryAudit(false);
    }
  };

  const handleSubmitPurchaseRequest = async (event) => {
    event.preventDefault();
    const targetProduct = restockProduct;
    const targetStoreId = targetProduct?.storeId || activeStoreId;
    const amount = Number(restockAmount);
    const catalogProduct = catalog.find((item) => item.id === targetProduct?.catalogId);
    if (!targetProduct || !targetStoreId || !Number.isFinite(amount) || amount <= 0
      || Number((amount * 100).toFixed(0)) / 100 !== amount || isSubmittingPurchaseRequest) {
      setRestockError('Indica una cantidad solicitada válida.');
      return;
    }
    if (!catalogProduct?.supplierId) {
      setRestockError('Este producto no tiene un proveedor asignado en el catálogo.');
      return;
    }

    setRestockError('');
    setIsSubmittingPurchaseRequest(true);
    try {
      await createPurchaseRequest({
        storeId: targetStoreId,
        product: targetProduct,
        supplierId: catalogProduct.supplierId,
        qtyRequested: amount,
        user: currentUser,
      });
      setIsRestockOpen(false);
      setRestockProduct(null);
      setRestockAmount('');
      setAddProductSuccess(`Solicitud enviada: ${amount} ${targetProduct.unit} de ${targetProduct.name}. El inventario no cambia hasta recibir la orden.`);
      setTimeout(() => setAddProductSuccess(''), 5000);
    } catch (error) {
      setRestockError(error.message || 'No se pudo enviar la solicitud de compra.');
    } finally {
      setIsSubmittingPurchaseRequest(false);
    }
  };

  const handleSavePrice = async (event, product) => {
    event.preventDefault();
    if (!isStoreManager || isSavingPrice) return;
    const price = parseFloat(priceDraft);
    if (!Number.isFinite(price) || price <= 0
      || Number((price * 100).toFixed(0)) / 100 !== price) {
      setActionError('Indica un precio de venta mayor a 0 con máximo dos decimales.');
      return;
    }
    setActionError('');
    setIsSavingPrice(true);
    try {
      await setStorePriceOverride(product.id, price === product.globalPrice ? null : price, currentUser);
      setEditingPriceProductId(null);
      setPriceDraft('');
    } catch (error) {
      setActionError(error.message || 'No se pudo actualizar el precio de venta.');
    } finally {
      setIsSavingPrice(false);
    }
  };

  const handleSaveReceiptWidth = async (value) => {
    if (!isAdmin || !activeStoreId || isSavingReceiptWidth) return false;
    const width = Number(value);
    if (!Number.isFinite(width) || width < MIN_RECEIPT_WIDTH_MM || width > MAX_RECEIPT_WIDTH_MM) {
      setActionError('El ancho del ticket debe estar entre 30 y 120 mm.');
      return false;
    }

    setActionError('');
    setIsSavingReceiptWidth(true);
    try {
      await saveStoreReceiptWidth(activeStoreId, width);
      return true;
    } catch (error) {
      setActionError(error.message || 'No se pudo guardar el ancho del ticket.');
      return false;
    } finally {
      setIsSavingReceiptWidth(false);
    }
  };

  const handleSaveMinStock = async (event, productId) => {
    event.preventDefault();
    const minStock = parseFloat(minStockDraft);
    if (!isAdmin || isSavingMinStock) return;
    if (isGeneralView && !inventoryTargetStoreId) {
      setActionError('Selecciona la tienda donde deseas editar el mínimo.');
      return;
    }
    const sourceProduct = products.find((product) => product.id === productId);
    const targetProduct = isGeneralView
      ? products.find((product) => product.name === sourceProduct?.name
        && product.storeId === inventoryTargetStoreId)
      : sourceProduct;
    if (!targetProduct) {
      setActionError('No se encontró el producto en la tienda seleccionada.');
      return;
    }
    if (!Number.isFinite(minStock) || minStock < 0
      || Number((minStock * 100).toFixed(0)) / 100 !== minStock) {
      setActionError('Indica un mínimo de alerta válido con máximo dos decimales.');
      return;
    }

    setActionError('');
    setIsSavingMinStock(true);
    try {
      await saveMinStock(
        targetProduct.id,
        minStock,
        currentUser,
      );
      setEditingMinStockProductId(null);
      setMinStockDraft('');
    } catch (error) {
      setActionError(error.message || 'No se pudo actualizar el mínimo de alerta.');
    } finally {
      setIsSavingMinStock(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setAuthError(err.message || 'No se pudo iniciar sesión con Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCredentialsLogin = async (e) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      setAuthError('Ingresa tu usuario y contraseña.');
      return;
    }
    setIsLoggingIn(true);
    setAuthError('');
    try {
      await loginWithCredentials(loginUsername, loginPassword);
    } catch (err) {
      setAuthError(err.message || 'Error al iniciar sesión.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setCurrentUser(null);
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  const handleSaveStore = async (event) => {
    event.preventDefault();
    if (!isAdmin || isSavingStore) return;
    setStoreError('');
    setIsSavingStore(true);
    try {
      if (editingStoreId) {
        const previousCashierIds = usersList
          .filter((user) => user.role === 'cajero' && user.storeId === editingStoreId)
          .map((user) => user.id);
        await saveStoreUpdate(editingStoreId, { ...storeForm, previousCashierIds });
      } else {
        await saveStore({ ...storeForm, previousCashierIds: [] });
      }
      setIsStoreModalOpen(false);
      setEditingStoreId(null);
      setStoreForm({ name: '', address: '', phone: '', cashierIds: [] });
    } catch (error) {
      setStoreError(error.message || 'No se pudo guardar la tienda.');
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleOpenStoreModal = (store = null) => {
    setEditingStoreId(store?.id || null);
    setStoreForm(store ? {
      name: store.name || '',
      address: store.address || '',
      phone: store.phone || '',
      cashierIds: store.status === 'archived'
        ? []
        : usersLoading && Array.isArray(store.cashierIds)
          ? store.cashierIds
          : usersList
            .filter((user) => user.role === 'cajero' && user.storeId === store.id)
            .map((user) => user.id),
    } : { name: '', address: '', phone: '', cashierIds: [] });
    setStoreError('');
    setIsStoreModalOpen(true);
  };

  const handleCloseStoreModal = () => {
    if (isSavingStore) return;
    setIsStoreModalOpen(false);
    setEditingStoreId(null);
    setStoreForm({ name: '', address: '', phone: '', cashierIds: [] });
    setStoreError('');
  };

  const handleStoreStatusChange = async (store, status) => {
    if (!isAdmin || isSavingStore) return;
    const isArchiving = status === 'archived';
    const action = isArchiving ? 'archivar' : 'reactivar';
    const confirmation = isArchiving
      ? `¿Archivar "${store.name}"? Primero deben cerrarse todos los turnos abiertos. Después, los cajeros asignados quedarán sin tienda y sin acceso al POS; al reactivarla tendrás que asignarlos de nuevo.`
      : `¿Reactivar "${store.name}"? Los cajeros no se reasignarán automáticamente; asígnalos desde la edición de la tienda.`;
    if (!window.confirm(confirmation)) return;

    setStoreError('');
    setIsSavingStore(true);
    try {
      await saveStoreStatus(store.id, status);
      if (isArchiving && selectedStoreId === store.id) {
        handleStoreChange('');
      }
    } catch (error) {
      setStoreError(`No se pudo ${action} la tienda: ${error.message}`);
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleStoreChange = (storeId) => {
    setCart([]);
    setSelectedChannel(null);
    setCartQuantityDrafts({});
    setCashShiftModal(null);
    setCashShiftActionError('');
    setIsRestockOpen(false);
    setIsInventoryAuditOpen(false);
    setEditingMinStockProductId(null);
    setEditingPriceProductId(null);
    setInventoryTargetStoreId(storeId || '');
    setActionError('');
    setSelectedStoreId(storeId || null);
  };

  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserForm(INITIAL_USER_FORM);
    setUserFormError('');
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (userToEdit) => {
    setEditingUser(userToEdit);
    setUserForm({
      authType: userToEdit.authType || (userToEdit.passwordHash ? 'credentials' : 'google'),
      username: userToEdit.username || '',
      password: '',
      email: userToEdit.email || '',
      displayName: userToEdit.displayName || '',
      role: userToEdit.role || 'cajero',
      permissions: userToEdit.permissions || DEFAULT_PERMISSIONS[userToEdit.role] || DEFAULT_PERMISSIONS.cajero,
      status: userToEdit.status || 'active',
      storeId: userToEdit.storeId || '',
    });
    setUserFormError('');
    setIsUserModalOpen(true);
  };

  const handleCloseUserModal = () => {
    if (isSavingUser) return;
    setIsUserModalOpen(false);
    setEditingUser(null);
    setUserFormError('');
  };

  const handleRoleChangeInForm = (newRole) => {
    const defaultPerms = DEFAULT_PERMISSIONS[newRole] || DEFAULT_PERMISSIONS.custom;
    setUserForm(prev => ({
      ...prev,
      role: newRole,
      storeId: newRole === 'cajero'
        ? prev.storeId || (editingUser?.role === 'cajero' ? editingUser.storeId || '' : '')
        : '',
      permissions: newRole === 'custom' ? prev.permissions : defaultPerms,
    }));
  };

  const handlePermissionToggle = (permKey) => {
    setUserForm(prev => ({
      ...prev,
      role: 'custom',
      permissions: {
        ...prev.permissions,
        [permKey]: !prev.permissions[permKey],
      },
    }));
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (isSavingUser) return;

    if (userForm.authType === 'credentials') {
      const cleanUsername = userForm.username.toLowerCase().trim();
      if (!cleanUsername) {
        setUserFormError('Ingresa un nombre de usuario válido.');
        return;
      }
      if (!editingUser && (!userForm.password || userForm.password.length < MIN_PASSWORD_LENGTH)) {
        setUserFormError(`La contraseña inicial debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
        return;
      }
    } else {
      const cleanEmail = userForm.email.toLowerCase().trim();
      if (!cleanEmail) {
        setUserFormError('Ingresa un correo electrónico válido.');
        return;
      }
    }
    if (userForm.role === 'cajero' && !userForm.storeId) {
      setUserFormError('Asigna una tienda al cajero.');
      return;
    }

    setIsSavingUser(true);
    setUserFormError('');
    try {
      const targetIdentifier = userForm.authType === 'credentials' 
        ? userForm.username.toLowerCase().trim() 
        : userForm.email.toLowerCase().trim();

      if (editingUser) {
        await saveUserUpdate(editingUser.id, userForm);
        setUserSuccessMessage(`Usuario ${targetIdentifier} actualizado exitosamente.`);
      } else {
        await saveUser(userForm);
        setUserSuccessMessage(`Usuario ${targetIdentifier} registrado exitosamente.`);
      }
      setIsUserModalOpen(false);
      setEditingUser(null);
      setTimeout(() => setUserSuccessMessage(''), 4000);
    } catch (err) {
      setUserFormError(err.message || 'Error al guardar usuario.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    if (userToDelete.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
      alert('No es posible eliminar al Administrador Principal (agrazmario@gmail.com).');
      return;
    }
    const displayNameOrUsername = userToDelete.displayName || userToDelete.username || userToDelete.email;
    if (!window.confirm(`¿Estás seguro de eliminar el acceso para "${displayNameOrUsername}"?`)) {
      return;
    }
    try {
      await removeUser(userToDelete.id, userToDelete.email);
      setUserSuccessMessage(`Usuario ${displayNameOrUsername} eliminado.`);
      setTimeout(() => setUserSuccessMessage(''), 4000);
    } catch (err) {
      setActionError(err.message || 'No se pudo eliminar el usuario.');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400 font-medium font-mono">Iniciando POSKlean...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center">
            <div className="inline-flex p-3.5 bg-linear-to-r from-cyan-500 to-blue-600 rounded-2xl shadow-lg shadow-cyan-500/20 mx-auto">
              <Droplet className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight mt-3">
              POS<span className="text-cyan-400">Klean</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">Control de Inventarios • Punto de Venta</p>
          </div>

          {/* Switch Modo de Ingreso */}
          <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
            <button
              type="button"
              onClick={() => { setLoginMode('credentials'); setAuthError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                loginMode === 'credentials'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Usuario / Clave</span>
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('google'); setAuthError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                loginMode === 'google'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Google</span>
            </button>
          </div>

          {authError && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs text-left">
              {authError}
            </div>
          )}

          {loginMode === 'credentials' ? (
            <form onSubmit={handleCredentialsLogin} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Nombre de Usuario:
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Ej. cajero1"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Contraseña:
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <Key className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-2xl text-sm transition shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{isLoggingIn ? 'Iniciando sesión...' : 'Entrar al Sistema'}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl text-sm transition shadow-lg shadow-white/10 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isLoggingIn ? 'Conectando con Google...' : 'Continuar con Google'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentUser.status !== 'active') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 text-center">
          <div className="inline-flex p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Acceso Pendiente de Aprobación</h2>
            <p className="text-xs text-slate-400 mt-2">
              Has iniciado sesión como <strong className="text-cyan-300 font-mono">{currentUser.email}</strong>.
            </p>
          </div>
          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60 text-xs text-slate-300 text-left space-y-2">
            <p>Tu cuenta aún no tiene permisos activos asignados en POSKlean.</p>
            <p>Ponte en contacto con el Administrador para que active tu cuenta:</p>
            <p className="font-mono text-cyan-400 font-semibold">{SUPER_ADMIN_EMAIL}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-2xl text-xs transition border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión / Usar Otra Cuenta</span>
          </button>
        </div>
      </div>
    );
  }

  if (!activeStoreId && !isStoreManager) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center">
            <div className="inline-flex p-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-2xl">
              <Store className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mt-3">
              Tienda no asignada
            </h2>
            <p className="text-xs text-slate-400 mt-2">
              Solicita al administrador que configure tu tienda desde el menú Usuarios.
            </p>
          </div>

          {storeError && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs">
              {storeError}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-2xl text-xs transition border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-3 py-3 shadow-md sm:px-4 lg:gap-4 xl:px-6">
        <div className="flex shrink-0 items-center space-x-3">
          <div className="bg-linear-to-r from-cyan-500 to-blue-600 p-2.5 rounded-xl shadow-lg shadow-cyan-500/20">
            <Droplet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              POS<span className="text-cyan-400">Klean</span>
              <span className="text-xs bg-slate-700 text-cyan-300 font-mono px-2 py-0.5 rounded-full border border-slate-600">v1.0</span>
            </h1>
            <p className="text-xs text-slate-400">• Control • Inventarios •</p>
          </div>
        </div>

        {/* Global Quick Metrics & User Info */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 lg:justify-end lg:gap-3">
          <div className={`flex h-11 items-center gap-2 border px-2.5 rounded-xl text-xs font-semibold ${
            lowStockCount > 0 
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse' 
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}>
            <AlertTriangle className="w-4 h-4" />
            <span>{lowStockCount > 0 ? `${lowStockCount} Bajo Stock` : 'Stock Saludable'}</span>
          </div>

          {isStoreManager && (
            <label className="flex h-11 items-center gap-2 bg-slate-900/90 border border-slate-700/80 px-2.5 rounded-xl text-xs">
              <Store className="w-4 h-4 text-cyan-400" />
              <select
                aria-label="Tienda activa"
                value={selectedStoreId || ''}
                onChange={(event) => handleStoreChange(event.target.value)}
                className="max-w-40 bg-transparent text-slate-200 font-semibold focus:outline-none"
              >
                <option value="" className="bg-slate-800">General</option>
                {activeStores.map((store) => (
                  <option key={store.id} value={store.id} className="bg-slate-800">
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {currentUser.role === 'cajero' && (
            <div
              aria-label={`Tienda activa: ${storeNameById.get(activeStoreId) || activeStoreId}`}
              className="flex h-11 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 text-xs"
            >
              <Store className="h-4 w-4 shrink-0 text-cyan-400" />
              <span className="text-slate-400">Tienda activa:</span>
              <strong className="max-w-40 truncate text-slate-200">
                {storeNameById.get(activeStoreId) || activeStoreId}
              </strong>
            </div>
          )}

          {activeStoreId && (
            <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 text-xs">
              <DollarSign className="h-4 w-4 shrink-0 text-cyan-400" />
              {cashShiftLoading ? (
                <span className="text-slate-400">Consultando turno...</span>
              ) : cashShiftError ? (
                <span role="alert" className="max-w-56 truncate text-rose-300" title={cashShiftError}>{cashShiftError}</span>
              ) : cashShiftStoreMismatch ? (
                <span
                  className="max-w-56 truncate text-amber-300"
                  title="Cierra ese turno en su tienda antes de cambiar."
                >
                  Turno abierto en {storeNameById.get(cashShift.storeId) || cashShift.storeId}
                </span>
              ) : isCashShiftOpen ? (
                <>
                  <span className="font-semibold text-emerald-300">Turno abierto</span>
                  <span className="hidden text-slate-400 xl:inline">
                    Fondo {formatCurrency(cashShift.openingCashCents / 100)} · Esperado {formatCurrency(currentShiftExpectedCash)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCountedCashDraft('');
                      setCashShiftActionError('');
                      setCashShiftModal('close');
                    }}
                    disabled={cart.length > 0 || isSavingCashShift}
                    title={cart.length > 0 ? 'Vacía el carrito antes de cerrar el turno.' : undefined}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cerrar caja
                  </button>
                </>
              ) : (
                <>
                  <span className="text-amber-300">Sin turno abierto</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpeningCashDraft('0');
                      setCashShiftActionError('');
                      setCashShiftModal('open');
                    }}
                    disabled={isSavingCashShift}
                    className="rounded-lg bg-cyan-500 px-2 py-1 font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Abrir turno
                  </button>
                </>
              )}
            </div>
          )}

          {canAccessInventory && lowStockCount > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <p className="text-xs font-bold">Alerta: stock mínimo alcanzado</p>
                <p className="mt-1 text-[10px] text-amber-100/80">
                  {lowStockProducts.slice(0, 3).map((product) =>
                    `${product.name}: ${product.currentStock} de ${product.minStock} ${product.unit}`
                  ).join(' · ')}
                  {lowStockCount > 3 && ` · y ${lowStockCount - 3} productos más`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className="shrink-0 rounded-lg border border-amber-500/40 px-2 py-1 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-500/15"
              >
                Ver inventario
              </button>
            </div>
          )}

          {/* User Profile Badge */}
          <div className="ml-auto flex h-11 shrink-0 items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 lg:ml-0">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName}
                className="w-7 h-7 rounded-full border border-slate-600 object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30">
                {(currentUser.displayName || currentUser.username || currentUser.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block text-left pr-1">
              <p className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-32.5">
                {currentUser.displayName || currentUser.username || (currentUser.email ? currentUser.email.split('@')[0] : 'Usuario')}
              </p>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md ${
                currentUser.role === 'admin' ? 'bg-purple-500/20 text-purple-300' :
                currentUser.role === 'supervisor' ? 'bg-blue-500/20 text-blue-300' :
                'bg-emerald-500/20 text-emerald-300'
              }`}>
                {currentUser.role === 'admin' ? 'Admin' : currentUser.role}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar Sesión"
              className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg transition hover:bg-slate-800 cursor-pointer ml-0.5"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav aria-label="Secciones principales" className="flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900 p-1">
          {canUsePos && (
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              aria-label="Punto de Venta"
              title="Punto de Venta"
              className={`flex-none flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4 ${
                visibleTab === 'pos' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden lg:inline">Punto de Venta</span>
            </button>
          )}
          
          {canAccessInventory && (
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              aria-label="Inventario"
              title="Inventario"
              className={`relative flex-none flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4 ${
                visibleTab === 'inventory' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              <span className="hidden lg:inline">Inventario</span>
              {lowStockCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-slate-900">
                  {lowStockCount}
                </span>
              )}
            </button>
          )}

          {canAccessPurchases && (
            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              aria-label={pendingPurchaseRequestsCount > 0
                ? `Compras, ${pendingPurchaseRequestsCount} solicitudes pendientes`
                : 'Compras'}
              title="Compras"
              className={`relative flex-none flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4 ${
                visibleTab === 'purchases' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span className="hidden lg:inline">Compras</span>
              {isStoreManager && pendingPurchaseRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 rounded-full border border-slate-900 bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-950">
                  {pendingPurchaseRequestsCount > 99 ? '99+' : pendingPurchaseRequestsCount}
                </span>
              )}
            </button>
          )}

          {canAccessCatalog && (
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              aria-label="Catálogo"
              title="Catálogo"
              className={`flex-none flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4 ${
                visibleTab === 'catalog'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span className="hidden lg:inline">Catálogo</span>
            </button>
          )}

          {canAccessSales && (
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              aria-label="Ventas y Reportes"
              title="Ventas y Reportes"
              className={`flex-none flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4 ${
                visibleTab === 'sales' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span className="hidden lg:inline">Ventas / Reporte</span>
            </button>
          )}

          {canAccessUsers && (
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              aria-label="Administración"
              title="Administración"
              className={`relative flex-none flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4 ${
                visibleTab === 'users' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="hidden lg:inline">Administración</span>
              {pendingUsersCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-slate-900 animate-pulse">
                  {pendingUsersCount}
                </span>
              )}
            </button>
          )}
        </nav>
      </header>

      {/* Main Content Area */}
      { (dataError || actionError) && (
        <div role="alert" className="mx-auto mt-3 w-full max-w-screen-2xl px-3 sm:px-5">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {dataError || actionError}
          </div>
        </div>
      )}
      {loading && (
        <div role="status" className="mx-auto mt-3 w-full max-w-screen-2xl px-3 sm:px-5 text-sm text-slate-400">
          Conectando con Firestore...
        </div>
      )}

      <main className="mx-auto w-full max-w-screen-2xl flex-1 p-3 sm:p-5 xl:p-6">
        {/* TAB 1: PUNTO DE VENTA (POS) */}
        {visibleTab === 'pos' && canUsePos && activeStoreId && !isCashShiftOpen && (
          <section className="mx-auto mt-10 flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center shadow-md">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-cyan-400">
              <DollarSign className="h-8 w-8" />
            </div>
            {cashShiftLoading ? (
              <p className="text-sm text-slate-400">Consultando turno...</p>
            ) : cashShiftError ? (
              <p role="alert" className="text-sm text-rose-300">{cashShiftError}</p>
            ) : cashShiftStoreMismatch ? (
              <>
                <h2 className="text-lg font-bold text-white">Turno abierto en otra tienda</h2>
                <p className="text-sm text-amber-300">
                  Tienes un turno abierto en {storeNameById.get(cashShift.storeId) || cashShift.storeId}. Vuelve a esa tienda y ciérralo antes de cambiar.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-white">Abre un turno para vender</h2>
                <p className="text-sm text-slate-400">
                  Registra el fondo de caja inicial para habilitar el punto de venta.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpeningCashDraft('0');
                    setCashShiftActionError('');
                    setCashShiftModal('open');
                  }}
                  disabled={isSavingCashShift}
                  className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Abrir turno
                </button>
              </>
            )}
          </section>
        )}
        {visibleTab === 'pos' && canUsePos && !(activeStoreId && !isCashShiftOpen) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
            
            <POSCatalog
              availableCategories={availableCategories}
              cart={cart}
              filteredProducts={filteredProducts}
              isCashShiftOpen={isCashShiftOpen}
              isGeneralView={isGeneralView}
              onCategoryChange={setSelectedCategory}
              onProductSelect={handleSelectProductToCart}
              onSearchChange={setSearchTerm}
              searchTerm={searchTerm}
              selectedCategory={selectedCategory}
            />

            <POSCartPanel
              cart={cart}
              cartQuantityDrafts={cartQuantityDrafts}
              cartTotal={cartTotal}
              cartVolume={cartVolume}
              cashShiftActionError={cashShiftActionError}
              cashShiftModal={cashShiftModal}
              hasSingleChannel={hasSingleChannel}
              isCashShiftOpen={isCashShiftOpen}
              isGeneralView={isGeneralView}
              isSavingSale={isSavingSale}
              lastCartTouch={lastCartTouch}
              lastCompletedSale={lastCompletedSale}
              loading={loading}
              onCartQuantityBlur={handleCartQuantityBlur}
              onCartQuantityChange={handleCartQuantityChange}
              onClearActionError={() => setActionError('')}
              onOpenChannelModal={() => setShowChannelModal(true)}
              onOpenPaymentModal={() => setShowPaymentModal(true)}
              onPrintLastTicket={() => setTicketToPrint({ type: 'sale', data: lastCompletedSale })}
              onRemoveFromCart={handleRemoveFromCart}
              products={products}
              selectedChannel={selectedChannel}
              showCheckoutSuccess={showCheckoutSuccess}
            />

          </div>
        )}

        {visibleTab === 'purchases' && canAccessPurchases && (
          <PurchasingPanel
            currentUser={currentUser}
            activeStoreId={activeStoreId}
            stores={activeStores}
            products={products}
            catalog={catalog}
            onPrintOrder={(order, hideCosts) => setTicketToPrint({
              type: 'purchaseOrder',
              data: { ...order, hideCosts },
            })}
          />
        )}

        {visibleTab === 'catalog' && canAccessCatalog && (
          <CatalogPanel
            currentUser={currentUser}
            catalog={catalog}
            products={products}
            stores={activeStores}
            activeStoreId={activeStoreId}
          />
        )}

        {/* TAB 2: INVENTARIO & RESURTIDO */}
        {visibleTab === 'inventory' && canAccessInventory && (
          <div className="space-y-5">
            {addProductSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>{addProductSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddProductSuccess('')}
                  className="text-emerald-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>
            )}
            
            {/* Header Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {currentUser.role !== 'cajero' && (
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                  <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-medium">Inventario Total</p>
                    <p className="text-sm font-bold text-orange-400 font-mono">Compra: {formatCurrency(inventoryValueAtCost)} MXN</p>
                    <p className="text-sm font-bold text-emerald-400 font-mono">Venta: {formatCurrency(inventoryValueAtSalePrice)} MXN</p>
                    <p className="text-sm font-bold text-purple-400 font-mono">
                      Ganancia: {formatCurrency(inventoryValueAtSalePrice - inventoryValueAtCost)} MXN
                    </p>
                  </div>
                </div>
              )}

              {lowStockCount > 0 && (
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                  <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Productos por Resurtir</p>
                    <p className="text-2xl font-bold text-amber-400 font-mono">{lowStockCount}</p>
                  </div>
                </div>
              )}

              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Total de SKU / Productos</p>
                  <p className="text-2xl font-bold text-white font-mono">{products.length}</p>
                </div>
              </div>
            </div>

            <InventoryTable
              activeStoreCount={activeStores.length}
              deletingProductId={deletingProductId}
              editingMinStockProductId={editingMinStockProductId}
              editingPriceProductId={editingPriceProductId}
              inventoryTableProducts={inventoryTableProducts}
              isAdmin={isAdmin}
              isCajero={isCajero}
              isGeneralView={isGeneralView}
              isSavingMinStock={isSavingMinStock}
              isSavingPrice={isSavingPrice}
              isStoreManager={isStoreManager}
              minStockDraft={minStockDraft}
              onCancelMinStock={() => setEditingMinStockProductId(null)}
              onCancelPrice={() => setEditingPriceProductId(null)}
              onDeleteProduct={handleDeleteProduct}
              onEditMinStock={(product) => {
                setEditingMinStockProductId(product.id);
                setMinStockDraft(String(product.minStock));
              }}
              onEditPrice={(product) => {
                setEditingPriceProductId(product.id);
                setPriceDraft(String(product.price));
              }}
              onGoToCatalog={() => setActiveTab('catalog')}
              onMinStockDraftChange={setMinStockDraft}
              onOpenHistory={() => setIsInventoryHistoryOpen(true)}
              onOpenInventoryAudit={handleOpenInventoryAudit}
              onOpenRestock={handleOpenRestock}
              onOpenTransfer={handleOpenTransfer}
              onPriceDraftChange={setPriceDraft}
              onSaveMinStock={handleSaveMinStock}
              onSavePrice={handleSavePrice}
              priceDraft={priceDraft}
              products={products}
              storeNameById={storeNameById}
            />

            {isInventoryHistoryOpen && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
                  <div className="flex justify-between items-center border-b border-slate-700 p-5">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <History className="w-5 h-5 text-cyan-400" />
                      Historial de inventario
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsInventoryHistoryOpen(false)}
                      aria-label="Cerrar historial"
                      className="text-slate-400 hover:text-white p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="overflow-y-auto p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label htmlFor="inventory-movement-filter" className="text-xs font-medium text-slate-300">
                        Tipo de movimiento
                      </label>
                      <select
                        id="inventory-movement-filter"
                        value={movementTypeFilter}
                        onChange={(event) => setMovementTypeFilter(event.target.value)}
                        className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="all">Todos</option>
                        <option value="initial">Alta de producto</option>
                        <option value="restock">Resurtido</option>
                        <option value="purchase">Compra a proveedor</option>
                        <option value="sale">Venta</option>
                        <option value="audit">Auditoría</option>
                        <option value="transfer_out">Transferencia enviada</option>
                        <option value="transfer_in">Transferencia recibida</option>
                      </select>
                    </div>
                    {movements.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-10">Aún no hay movimientos registrados.</p>
                    ) : filteredMovements.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-10">No hay movimientos de este tipo.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-162.5 text-left text-xs text-slate-300">
                          <thead className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
                            <tr>
                              <th className="px-3 py-3">Fecha</th>
                              <th className="px-3 py-3">Movimiento</th>
                              <th className="px-3 py-3">Producto</th>
                              <th className="px-3 py-3">Cantidad</th>
                              <th className="px-3 py-3">Responsable</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/60">
                            {filteredMovements.map((movement) => {
                              const counterpartName = storeNameById.get(movement.counterpartStoreId) || 'otra tienda';
                              const movementLabel = movement.type === 'transfer_out'
                                ? `Transferencia a ${counterpartName}`
                                : movement.type === 'transfer_in'
                                  ? `Transferencia de ${counterpartName}`
                                  : movement.type === 'restock'
                                ? 'Resurtido'
                                : movement.type === 'purchase'
                                  ? `Compra${movement.orderNumber ? ` ${movement.orderNumber}` : ''}`
                                  : movement.type === 'sale'
                                  ? `Venta${movement.ticketId ? ` ${movement.ticketId}` : ''}`
                                  : movement.type === 'audit'
                                    ? `Auditoría${movement.ticketId ? ` ${movement.ticketId}` : ''}`
                                    : 'Producto creado';
                              const quantity = Math.abs(movement.amount || 0);
                              return (
                                <tr key={movement.id} className="hover:bg-slate-700/30">
                                  <td className="px-3 py-3 whitespace-nowrap">{movement.timestamp}</td>
                                  <td className="px-3 py-3 font-semibold text-slate-100">{movementLabel}</td>
                                  <td className="px-3 py-3">{movement.productName || 'Producto'}</td>
                                  <td className="px-3 py-3 font-mono">
                                    {movement.type === 'audit'
                                      ? movement.difference === 0
                                        ? `Sin diferencia (${movement.countedStock} ${movement.unit || ''})`
                                        : `${movement.difference < 0 ? '-' : '+'}${quantity} ${movement.unit || ''}${(movement.lossValue ?? movement.lossCost) > 0 ? ` · pérdida ${formatCurrency(movement.lossValue ?? movement.lossCost)}` : ''}`
                                      : `${movement.amount < 0 ? '-' : '+'}${quantity} ${movement.unit || ''}`}
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="text-slate-100">{movement.createdBy?.userName || 'Desconocido'}</span>
                                    {movement.createdBy?.userRole && (
                                      <span className="block text-[10px] text-slate-500">{movement.createdBy.userRole}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isTransferOpen && isStoreManager && (
              <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
                <form onSubmit={handleSubmitTransfer} className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl space-y-4">
                  <h3 className="flex items-center gap-2 text-base font-bold text-white">
                    <ArrowLeftRight className="h-5 w-5 text-cyan-400" />
                    Transferir inventario
                  </h3>
                  <div>
                    <label htmlFor="transfer-source" className="block text-xs font-semibold text-slate-400 mb-1">Tienda origen</label>
                    <select
                      id="transfer-source"
                      value={transferForm.sourceStoreId}
                      onChange={(event) => setTransferForm({ sourceStoreId: event.target.value, stockId: '', destStoreId: '', amount: '' })}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="">Selecciona la tienda origen</option>
                      {activeStores
                        .filter((store) => (isGeneralView
                          ? products.some((product) => product.storeId === store.id)
                          : store.id === activeStoreId))
                        .map((store) => (
                          <option key={store.id} value={store.id}>{store.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="transfer-product" className="block text-xs font-semibold text-slate-400 mb-1">Producto</label>
                    <select
                      id="transfer-product"
                      value={transferForm.stockId}
                      disabled={!transferForm.sourceStoreId}
                      onChange={(event) => setTransferForm((form) => ({ ...form, stockId: event.target.value, amount: '' }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                    >
                      <option value="">Selecciona un producto</option>
                      {products
                        .filter((product) => (product.storeId || activeStoreId) === transferForm.sourceStoreId && Number(product.currentStock) > 0)
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.currentStock} {product.unit})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="transfer-dest" className="block text-xs font-semibold text-slate-400 mb-1">Tienda destino</label>
                    <select
                      id="transfer-dest"
                      value={transferForm.destStoreId}
                      disabled={!transferForm.sourceStoreId}
                      onChange={(event) => setTransferForm((form) => ({ ...form, destStoreId: event.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="">Selecciona la tienda</option>
                      {activeStores
                        .filter((store) => store.id !== transferForm.sourceStoreId)
                        .map((store) => (
                          <option key={store.id} value={store.id}>{store.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="transfer-amount" className="block text-xs font-semibold text-slate-400 mb-1">Cantidad a transferir</label>
                    <input
                      id="transfer-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={transferForm.amount}
                      onChange={(event) => setTransferForm((form) => ({ ...form, amount: event.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Si el producto no existe en la tienda destino, se habilita con el costo del origen; si existe, se promedia el costo por cantidad.
                  </p>
                  {transferError && <p className="text-xs text-red-400">{transferError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsTransferOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isTransferring}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 disabled:opacity-50 cursor-pointer"
                    >
                      {isTransferring ? 'Transfiriendo...' : 'Transferir'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {isInventoryAuditOpen && isAdmin && (
              <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
                <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl">
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-700 p-5">
                    <h3 className="flex items-center gap-2 text-base font-bold text-white">
                      <ClipboardCheck className="h-5 w-5 text-amber-400" />
                      {showPreviousAuditTickets
                        ? 'Tickets previos'
                        : inventoryAuditResult ? 'Auditoría completada' : 'Auditoría de inventario'}
                    </h3>
                    <div className="flex items-center gap-3">
                      {!showPreviousAuditTickets && (
                        <button
                          type="button"
                          onClick={() => setShowPreviousAuditTickets(true)}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                        >
                          Tickets previos
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsInventoryAuditOpen(false)}
                        disabled={isSavingInventoryAudit}
                        aria-label="Cerrar auditoría"
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {showPreviousAuditTickets ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                      {previousInventoryAudits.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-400">
                          No hay auditorías anteriores para esta vista.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {previousInventoryAudits.map((audit) => (
                            <div
                              key={audit.auditId}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3"
                            >
                              <div className="min-w-0 text-xs">
                                <p className="font-mono font-semibold text-slate-100">{audit.ticketId}</p>
                                <p className="text-slate-400">
                                  {audit.timestamp} · {storeNameById.get(audit.storeId) || audit.storeId || 'Sin tienda'}
                                  {' · '}{audit.auditedProducts} productos
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setTicketToPrint({ type: 'audit', data: audit })}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Imprimir ticket
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-auto flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowPreviousAuditTickets(false)}
                          className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-600"
                        >
                          Volver
                        </button>
                      </div>
                    </div>
                  ) : inventoryAuditResult ? (
                    <div className="space-y-4 overflow-y-auto p-5">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg bg-slate-900 p-3">
                          <p className="text-[11px] text-slate-400">Productos contados</p>
                          <p className="mt-1 font-mono text-lg font-bold text-white">{inventoryAuditResult.auditedProducts}</p>
                        </div>
                        <div className="rounded-lg bg-slate-900 p-3">
                          <p className="text-[11px] text-slate-400">Productos ajustados</p>
                          <p className="mt-1 font-mono text-lg font-bold text-white">{inventoryAuditResult.adjustedProducts}</p>
                        </div>
                        <div className="rounded-lg bg-slate-900 p-3">
                          <p className="text-[11px] text-slate-400">Faltante</p>
                          <p className="mt-1 font-mono text-lg font-bold text-rose-300">{inventoryAuditResult.shortageUnits.toFixed(2)}</p>
                          <p className="mt-1 text-[11px] text-rose-200">Pérdida a precio de venta: {formatCurrency(inventoryAuditResult.lossValue)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-900 p-3">
                          <p className="text-[11px] text-slate-400">Sobrante</p>
                          <p className="mt-1 font-mono text-lg font-bold text-emerald-300">{inventoryAuditResult.surplusUnits.toFixed(2)}</p>
                          <p className="mt-1 text-[11px] text-emerald-200">Monto a favor a precio de venta: {formatCurrency(inventoryAuditResult.surplusValue)}</p>
                        </div>
                      </div>

                      <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-700">
                        <table className="w-full min-w-170 text-left text-xs text-slate-300">
                          <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="px-3 py-3">Producto</th>
                              <th className="px-3 py-3">Stock esperado</th>
                              <th className="px-3 py-3">Conteo físico</th>
                              <th className="px-3 py-3">Diferencia</th>
                              <th className="px-3 py-3">Valor (precio de venta)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/60">
                            {inventoryAuditResult.lines.map((line) => (
                              <tr key={line.productId}>
                                <td className="px-3 py-2.5 font-medium text-slate-100">{line.productName}</td>
                                <td className="px-3 py-2.5 font-mono">{line.expectedStock.toFixed(2)} {line.unit}</td>
                                <td className="px-3 py-2.5 font-mono">{line.countedStock.toFixed(2)} {line.unit}</td>
                                <td className={`px-3 py-2.5 font-mono font-semibold ${line.difference < 0 ? 'text-rose-300' : line.difference > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                                  {line.difference > 0 ? '+' : ''}{line.difference.toFixed(2)} {line.unit}
                                </td>
                                <td className={`px-3 py-2.5 font-mono ${line.shortage > 0 ? 'text-rose-300' : line.surplus > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                                  {line.shortage > 0
                                    ? `-${formatCurrency(line.lossValue)}`
                                    : line.surplus > 0
                                      ? `+${formatCurrency(line.surplusValue)}`
                                      : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setTicketToPrint({ type: 'audit', data: inventoryAuditResult })}
                          className="flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                        >
                          <Printer className="h-4 w-4" />
                          Imprimir ticket
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsInventoryAuditOpen(false)}
                          className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-600"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleCompleteInventoryAudit} className="flex min-h-0 flex-1 flex-col">
                      <div className="space-y-4 overflow-y-auto p-5">
                        {isGeneralView && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-300">
                              Tienda a auditar: <span className="text-cyan-400">*</span>
                            </label>
                            <select
                              required
                              value={inventoryTargetStoreId}
                              onChange={(event) => handleInventoryAuditStoreChange(event.target.value)}
                              className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                            >
                              <option value="">Selecciona una tienda</option>
                              {activeStores.map((store) => (
                                <option key={store.id} value={store.id}>{store.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <p className="text-xs text-slate-400">
                          Compara cada conteo físico con el stock esperado. Al guardar, las diferencias corregirán las existencias.
                        </p>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                            <p className="text-[11px] text-slate-400">Productos contados</p>
                            <p className="mt-1 font-mono font-bold text-white">{inventoryAuditPreview.countedProducts} / {inventoryProductsForEdit.length}</p>
                          </div>
                          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                            <p className="text-[11px] text-slate-400">Faltante</p>
                            <p className="mt-1 font-mono font-bold text-rose-300">{inventoryAuditPreview.shortageUnits.toFixed(2)}</p>
                            <p className="mt-1 text-[11px] text-rose-200">Pérdida a precio de venta: {formatCurrency(inventoryAuditPreview.lossValue)}</p>
                          </div>
                          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                            <p className="text-[11px] text-slate-400">Sobrante</p>
                            <p className="mt-1 font-mono font-bold text-emerald-300">{inventoryAuditPreview.surplusUnits.toFixed(2)}</p>
                            <p className="mt-1 text-[11px] text-emerald-200">Monto a favor a precio de venta: {formatCurrency(inventoryAuditPreview.surplusValue)}</p>
                          </div>
                        </div>

                        {inventoryProductsForEdit.length > 250 && (
                          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                            Esta auditoría admite hasta 250 productos por transacción.
                          </p>
                        )}
                        {inventoryProductsForEdit.length === 0 ? (
                          <p className="py-8 text-center text-sm text-slate-400">No hay productos para auditar.</p>
                        ) : (
                          <div className="max-h-[45vh] overflow-auto rounded-xl border border-slate-700">
                            <table className="w-full min-w-175 text-left text-xs text-slate-300">
                              <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
                                <tr>
                                  <th className="px-3 py-3">Producto</th>
                                  <th className="px-3 py-3">Stock esperado</th>
                                  <th className="px-3 py-3">Conteo físico</th>
                                  <th className="px-3 py-3">Diferencia preliminar</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-700/60">
                                {inventoryProductsForEdit.map((product) => {
                                  const rawCount = inventoryAuditCounts[product.id] ?? '';
                                  const countedStock = rawCount === '' ? null : Number(rawCount);
                                  const validCount = Number.isFinite(countedStock)
                                    && countedStock >= 0
                                    && Number((countedStock * 100).toFixed(0)) / 100 === countedStock;
                                  const difference = validCount
                                    ? Number((countedStock - product.currentStock).toFixed(2))
                                    : null;
                                  const shortage = difference === null ? 0 : Math.max(0, -difference);

                                  return (
                                    <tr key={product.id}>
                                      <td className="px-3 py-2.5 font-medium text-slate-100">{product.name}</td>
                                      <td className="px-3 py-2.5 font-mono">{product.currentStock.toFixed(2)} {product.unit}</td>
                                      <td className="px-3 py-2.5">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          required
                                          aria-label={`Conteo físico de ${product.name}`}
                                          value={rawCount}
                                          onChange={(event) => setInventoryAuditCounts((previous) => ({
                                            ...previous,
                                            [product.id]: event.target.value,
                                          }))}
                                          className="w-28 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 font-mono text-white focus:outline-none focus:border-cyan-400"
                                        />
                                        <span className="ml-2 text-slate-400">{product.unit}</span>
                                      </td>
                                      <td className="px-3 py-2.5">
                                        {difference === null ? (
                                          <span className="text-slate-500">Pendiente</span>
                                        ) : difference < 0 ? (
                                          <span className="text-rose-300">Faltan {shortage.toFixed(2)} {product.unit} · {formatCurrency(shortage * product.price)}</span>
                                        ) : difference > 0 ? (
                                          <span className="text-emerald-300">
                                            Sobran +{difference.toFixed(2)} {product.unit} · {formatCurrency(difference * product.price)}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">Sin diferencia</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {inventoryAuditError && (
                          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                            {inventoryAuditError}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-700 p-4">
                        <button
                          type="button"
                          onClick={() => setIsInventoryAuditOpen(false)}
                          disabled={isSavingInventoryAudit}
                          className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingInventoryAudit || inventoryProductsForEdit.length === 0 || inventoryProductsForEdit.length > 250 || inventoryAuditPreview.countedProducts !== inventoryProductsForEdit.length}
                          className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ClipboardCheck className="h-4 w-4" />
                          {isSavingInventoryAudit ? 'Aplicando ajustes...' : 'Aplicar conteo y guardar'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* Modal de solicitud de compra */}
            {isRestockOpen && restockProduct && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <Truck className="w-5 h-5 text-cyan-400" />
                      Solicitar compra
                    </h3>
                    <button type="button" onClick={() => setIsRestockOpen(false)} disabled={isSubmittingPurchaseRequest} className="text-slate-400 hover:text-white disabled:opacity-50">✕</button>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 space-y-1">
                    <p className="text-xs text-slate-400">Producto seleccionado:</p>
                    <p className="font-bold text-sm text-white">{restockProduct.name}</p>
                    <p className="text-xs text-cyan-400">Stock Actual: {restockProduct.currentStock} {restockProduct.unit}</p>
                    <p className="text-xs text-slate-400">Tienda: {storeNameById.get(restockProduct.storeId) || 'Tienda asignada'}</p>
                  </div>

                  <form onSubmit={handleSubmitPurchaseRequest} className="space-y-4">
                    {restockError && (
                      <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                        <p>{restockError}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Cantidad solicitada ({restockProduct.unit}):</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Ej. 50, 100, 200"
                        required
                        value={restockAmount}
                        onChange={(e) => setRestockAmount(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-lg font-bold text-cyan-400 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Las solicitudes del mismo proveedor se agruparán para generar una sola orden. El inventario no cambia hasta recibirla.</p>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsRestockOpen(false)}
                        disabled={isSubmittingPurchaseRequest}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingPurchaseRequest}
                        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {isSubmittingPurchaseRequest ? 'Enviando...' : 'Enviar solicitud'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: VENTAS Y REPORTE DIARIO */}
        {visibleTab === 'sales' && canAccessSales && (
          <div className="space-y-5">
            
            {/* Indicador: cajero ve solo sus ventas */}
            {isCajero && (
              <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 p-3 rounded-xl text-xs flex items-center gap-2">
                <User className="w-4 h-4 shrink-0" />
                <span>Estás viendo únicamente <strong>tus ventas</strong>. Los totales y el historial reflejan solo las transacciones que registraste.</span>
              </div>
            )}

            {cashShift?.status === 'closed' && cashShift.storeId === activeStoreId && (
              <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-white">Último cierre de caja</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {cashShift.closedAt?.toDate
                        ? cashShift.closedAt.toDate().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
                        : 'Fecha no disponible'}
                      {' · Turno '}{cashShift.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTicketToPrint({
                      type: 'cashShift',
                      data: {
                        ...cashShift,
                        storeName: storeNameById.get(activeStoreId) || activeStoreId,
                        timestamp: cashShift.closedAt?.toDate
                          ? cashShift.closedAt.toDate().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
                          : 'Fecha no disponible',
                      },
                    })}
                    className="flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir cierre
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-slate-400">Efectivo esperado</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-white">{formatCurrency(cashShift.expectedCashCents / 100)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Efectivo contado</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-white">{formatCurrency(cashShift.countedCashCents / 100)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Diferencia</p>
                    <p className={`mt-1 font-mono text-sm font-semibold ${cashShift.cashDifferenceCents === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {formatCurrency(cashShift.cashDifferenceCents / 100)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Tickets</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-white">{cashShift.saleCount}</p>
                  </div>
                </div>
              </section>
            )}

            {/* Sales Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">{isCajero ? 'Mi Venta del Día' : 'Venta Total del Día'}</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {formatCurrency(visibleSalesToday.reduce((acc, s) => acc + s.total, 0))} MXN
                  </p>
                </div>
              </div>

              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                  <Droplet className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">{isCajero ? 'Litros que Despaché Hoy' : 'Litros Despachados Hoy'}</p>
                  <p className="text-2xl font-bold text-white font-mono">
                    {cashClosureSummary.liters.toFixed(1)} L
                  </p>
                  {cashClosureSummary.others.length > 0 && (
                    <p className="text-xs text-slate-400 font-mono">+ {formatOtherUnits(cashClosureSummary.others)}</p>
                  )}
                </div>
              </div>

              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">{isCajero ? 'Mis Tickets' : 'Tickets Registrados'}</p>
                  <p className="text-2xl font-bold text-white font-mono">{visibleSalesHistory.length}</p>
                </div>
              </div>
            </div>

            <section className="bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-cyan-400" />
                    Resumen de ventas del día
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(dayRange.start).toLocaleDateString('es-MX', { dateStyle: 'long' })}
                    {isCajero ? ' · Cierre personal' : ' · Cierre general'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTicketToPrint({
                    type: 'cashClosure',
                    data: {
                      ...cashClosureSummary,
                      date: new Date(dayRange.start).toLocaleDateString('es-MX', { dateStyle: 'short' }),
                      closedAt: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                      closedBy: currentUser.displayName || currentUser.username || currentUser.email || 'Usuario',
                    },
                  })}
                  disabled={cashClosureSummary.tickets === 0}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir resumen
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div>
                  <p className="text-xs text-slate-400">Ventas registradas</p>
                  <p className="text-xl font-bold font-mono text-emerald-400">{formatCurrency(cashClosureSummary.total)} MXN</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Tickets</p>
                  <p className="text-xl font-bold font-mono text-white">{cashClosureSummary.tickets}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Litros despachados</p>
                  <p className="text-xl font-bold font-mono text-white">{cashClosureSummary.liters.toFixed(2)} L</p>
                  {cashClosureSummary.others.length > 0 && (
                    <p className="text-xs text-slate-400 font-mono">+ {formatOtherUnits(cashClosureSummary.others)}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-slate-700 pt-3">
                <div>
                  <p className="text-xs font-semibold text-slate-300 mb-2">Desglose por canal</p>
                  {cashClosureSummary.channels.length === 0 ? (
                    <p className="text-xs text-slate-500">Sin ventas registradas hoy.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {cashClosureSummary.channels.map(({ channel, tickets, total }) => (
                        <div key={channel} className="flex justify-between gap-3 text-xs">
                          <span className="text-slate-400">{channel} · {tickets} {tickets === 1 ? 'ticket' : 'tickets'}</span>
                          <span className="font-mono font-semibold text-slate-200">{formatCurrency(total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-300 mb-2">Desglose por producto</p>
                  {cashClosureSummary.products.length === 0 ? (
                    <p className="text-xs text-slate-500">Sin productos vendidos hoy.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {cashClosureSummary.products.map(({ key, name, unit, quantity, total }) => (
                        <div key={key} className="flex justify-between gap-3 text-xs">
                          <span className="text-slate-400 truncate">{name} · {quantity.toFixed(2)} {unit}</span>
                          <span className="font-mono font-semibold text-slate-200 whitespace-nowrap">{formatCurrency(total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Sales Log Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md">
              <div className="p-4 border-b border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-cyan-400" />
                    Historial de Transacciones Recientes
                  </h2>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Hora / Fecha</th>
                      <th className="px-4 py-3">Canal</th>
                      <th className="px-4 py-3">Pago</th>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3">Detalle</th>
                      <th className="px-4 py-3">Cantidad</th>
                      <th className="px-4 py-3 text-right">Total ($ MXN)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {visibleSalesHistory.map(sale => (
                      <tr key={sale.id} className="hover:bg-slate-700/30 transition">
                        <td className="px-4 py-3 font-mono font-bold text-cyan-400">{sale.ticketId}</td>
                        <td className="px-4 py-3 text-slate-400">{sale.timestamp}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            sale.channel === 'Mostrador' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                            sale.channel === 'Uber Flash' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                            'bg-green-500/10 text-green-300 border-green-500/30'
                          }`}>
                            {sale.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {sale.paymentMethod === 'cash' ? 'Efectivo'
                            : sale.paymentMethod === 'card' ? 'Tarjeta'
                              : sale.paymentMethod === 'transfer' ? 'Transferencia'
                                : 'No registrado'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="text-slate-200 font-medium truncate max-w-30">
                              {sale.createdBy?.userName || 'Desconocido'}
                            </span>
                          </div>
                          {sale.createdBy?.userRole && (
                            <span className={`mt-0.5 inline-block px-1.5 py-0 rounded text-[9px] font-semibold border ${
                              sale.createdBy.userRole === 'admin' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' :
                              sale.createdBy.userRole === 'supervisor' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                              'bg-slate-500/15 text-slate-400 border-slate-500/30'
                            }`}>
                              {sale.createdBy.userRole === 'admin' ? 'Admin' :
                               sale.createdBy.userRole === 'supervisor' ? 'Supervisor' :
                               sale.createdBy.userRole === 'cajero' ? 'Cajero' : sale.createdBy.userRole}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-xs">
                          {sale.items.map((it, idx) => (
                            <span key={idx} className="block truncate">
                              • {it.name}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          {sale.items.map((it, idx) => (
                            <span key={it.productId || `${it.name}-${idx}`} className="block truncate">
                              • {it.qty} {it.unit || 'L'}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 text-sm">
                          <span>{formatCurrency(sale.total)}</span>
                          <button
                            type="button"
                            onClick={() => setTicketToPrint({ type: 'sale', data: sale })}
                            className="ml-3 inline-flex items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-cyan-500 hover:text-slate-950"
                          >
                            <Printer className="h-3 w-3" />
                            Imprimir Ticket
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: CONTROL DE USUARIOS Y PERMISOS */}
        {visibleTab === 'users' && canAccessUsers && (
          <AdminPanel
            currentUser={currentUser}
            isAdmin={isAdmin}
            receiptWidth={receiptWidth}
            receiptWidthStoreId={activeStoreId || ''}
            receiptWidthStoreName={activeStore?.name || ''}
            canEditReceiptWidth={Boolean(isAdmin && activeStoreId)}
            isSavingReceiptWidth={isSavingReceiptWidth}
            onReceiptWidthChange={handleSaveReceiptWidth}
            channels={storedChannels}
            successMessage={userSuccessMessage}
            onDismissSuccess={() => setUserSuccessMessage('')}
            usersList={usersList}
            usersLoading={usersLoading}
            pendingUsersCount={pendingUsersCount}
            stores={stores}
            storeNameById={storeNameById}
            storeError={storeError}
            isSavingStore={isSavingStore}
            onOpenStoreModal={handleOpenStoreModal}
            onStoreStatusChange={handleStoreStatusChange}
            onAddUser={handleOpenAddUser}
            onEditUser={handleOpenEditUser}
            onDeleteUser={handleDeleteUser}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-3 px-4 text-center text-xs text-slate-500">
        POSKlean • Gestión de inventarios y punto de venta integral. • 
      </footer>

      {showChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="channel-modal-title"
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h2 id="channel-modal-title" className="text-base font-bold text-white">¿Por qué canal es la venta?</h2>
                <p className="mt-1 text-xs text-slate-400">Puedes cambiarlo mientras armas el ticket.</p>
              </div>
              <button
                type="button"
                onClick={() => { pendingProductRef.current = null; setShowChannelModal(false); }}
                aria-label="Cerrar"
                className="p-1 text-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {salesChannelNames.map((channelName) => {
                const Icon = { Mostrador: Store, 'Uber Flash': Truck, WhatsApp: MessageSquare }[channelName] || Store;
                const color = { Mostrador: 'text-emerald-400', 'Uber Flash': 'text-amber-400', WhatsApp: 'text-green-400' }[channelName] || 'text-cyan-400';
                return (
                  <button
                    key={channelName}
                    type="button"
                    onClick={() => {
                      const pending = pendingProductRef.current;
                      pendingProductRef.current = null;
                      setSelectedChannel(channelName);
                      setShowChannelModal(false);
                      if (pending) handleSelectProductToCart(pending, channelName);
                    }}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border bg-slate-900 px-2 py-4 text-xs font-medium text-slate-200 transition hover:border-cyan-500 hover:bg-slate-700 ${
                      selectedChannel === channelName ? 'border-cyan-500' : 'border-slate-700'
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${color}`} />
                    <span>{channelName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h2 id="payment-modal-title" className="text-base font-bold text-white">¿Cómo pagó el cliente?</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Total a cobrar: <strong className="font-mono text-cyan-400">{formatCurrency(cartTotal)} MXN</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                disabled={isSavingSale}
                aria-label="Cerrar"
                className="p-1 text-lg text-slate-400 hover:text-white disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cash', label: 'Efectivo', icon: Banknote, color: 'text-emerald-400' },
                { id: 'card', label: 'Tarjeta', icon: CreditCard, color: 'text-sky-400' },
                { id: 'transfer', label: 'Transferencia', icon: ArrowLeftRight, color: 'text-violet-400' },
              ].map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => handleCompleteSale(method.id)}
                    disabled={isSavingSale}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-2 py-4 text-xs font-medium text-slate-200 transition hover:border-cyan-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon className={`h-6 w-6 ${method.color}`} />
                    <span>{method.label}</span>
                  </button>
                );
              })}
            </div>
            {isSavingSale && <p className="text-center text-xs text-slate-400">Procesando...</p>}
            {actionError && (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
                {actionError}
              </p>
            )}
          </div>
        </div>
      )}

      {cashShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cash-shift-modal-title"
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h2 id="cash-shift-modal-title" className="text-base font-bold text-white">
                  {cashShiftModal === 'open' ? 'Abrir turno de caja' : 'Cerrar turno y hacer cierre'}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {storeNameById.get(activeStoreId) || 'Tienda seleccionada'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCashShiftModal(null)}
                disabled={isSavingCashShift}
                aria-label="Cerrar"
                className="p-1 text-lg text-slate-400 hover:text-white disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {cashShiftModal === 'open' ? (
              <form onSubmit={handleOpenCashShift} className="space-y-4">
                <p className="text-xs text-slate-300">
                  Captura el efectivo que queda en caja al iniciar. Las ventas de turnos anteriores no se incluirán.
                </p>
                <div>
                  <label htmlFor="opening-cash" className="mb-1 block text-xs font-medium text-slate-300">
                    Fondo inicial (MXN)
                  </label>
                  <input
                    id="opening-cash"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    autoFocus
                    value={openingCashDraft}
                    onChange={(event) => setOpeningCashDraft(event.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                {cashShiftActionError && (
                  <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                    {cashShiftActionError}
                  </p>
                )}
                <div className="flex justify-end gap-2 border-t border-slate-700 pt-3">
                  <button
                    type="button"
                    onClick={() => setCashShiftModal(null)}
                    disabled={isSavingCashShift}
                    className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCashShift}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {isSavingCashShift ? 'Abriendo...' : 'Abrir turno'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCloseCashShift} className="space-y-4">
                <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs">
                  <div className="flex justify-between gap-3 text-slate-300">
                    <span>Fondo inicial</span>
                    <strong className="font-mono">{formatCurrency((cashShift?.openingCashCents || 0) / 100)}</strong>
                  </div>
                  <div className="flex justify-between gap-3 text-slate-300">
                    <span>Ventas en efectivo ({cashShift?.saleCount || 0} tickets totales)</span>
                    <strong className="font-mono">{formatCurrency(currentShiftPaymentTotals.cash)}</strong>
                  </div>
                  <div className="flex justify-between gap-3 text-slate-300">
                    <span>Ventas con tarjeta</span>
                    <strong className="font-mono">{formatCurrency(currentShiftPaymentTotals.card)}</strong>
                  </div>
                  <div className="flex justify-between gap-3 text-slate-300">
                    <span>Ventas por transferencia</span>
                    <strong className="font-mono">{formatCurrency(currentShiftPaymentTotals.transfer)}</strong>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-slate-700 pt-2 font-semibold text-white">
                    <span>Efectivo esperado</span>
                    <strong className="font-mono text-cyan-300">{formatCurrency(currentShiftExpectedCash)}</strong>
                  </div>
                </div>
                <div>
                  <label htmlFor="counted-cash" className="mb-1 block text-xs font-medium text-slate-300">
                    Efectivo contado al cierre (MXN)
                  </label>
                  <input
                    id="counted-cash"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    autoFocus
                    value={countedCashDraft}
                    onChange={(event) => setCountedCashDraft(event.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                {countedCashDraft !== '' && Number.isFinite(Number(countedCashDraft)) && (
                  <p className="text-xs text-slate-300">
                    Diferencia estimada:{' '}
                    <strong className={Number(countedCashDraft) - currentShiftExpectedCash === 0
                      ? 'text-emerald-300'
                      : 'text-amber-300'}
                    >
                      {formatCurrency(Number(countedCashDraft) - currentShiftExpectedCash)}
                    </strong>
                  </p>
                )}
                {cashShiftActionError && (
                  <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                    {cashShiftActionError}
                  </p>
                )}
                <div className="flex justify-end gap-2 border-t border-slate-700 pt-3">
                  <button
                    type="button"
                    onClick={() => setCashShiftModal(null)}
                    disabled={isSavingCashShift}
                    className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCashShift}
                    className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                  >
                    {isSavingCashShift ? 'Cerrando...' : 'Guardar cierre'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {isStoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-modal-title"
            className="my-8 w-full max-w-xl space-y-5 rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 id="store-modal-title" className="flex items-center gap-2 text-base font-bold text-white">
                <Store className="h-5 w-5 text-cyan-400" />
                {editingStoreId ? 'Editar tienda' : 'Crear tienda'}
              </h3>
              <button
                type="button"
                onClick={handleCloseStoreModal}
                disabled={isSavingStore}
                aria-label="Cerrar"
                className="p-1 text-lg text-slate-400 hover:text-white disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {needsFirstStore && !editingStoreId && (
              <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 text-xs text-cyan-200">
                Aún no hay tiendas registradas. Crea la primera para comenzar a usar el sistema.
              </div>
            )}

            {storeError && (
              <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/20 p-3 text-xs text-red-300">
                {storeError}
              </div>
            )}

            <form onSubmit={handleSaveStore} className="space-y-4">
              <div>
                <label htmlFor="store-name" className="mb-1 block text-xs font-medium text-slate-300">
                  Tienda: <span className="text-cyan-400">*</span>
                </label>
                <input
                  id="store-name"
                  required
                  autoFocus
                  type="text"
                  value={storeForm.name}
                  onChange={(event) => setStoreForm((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="Nombre de la tienda"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="store-address" className="mb-1 block text-xs font-medium text-slate-300">
                  Dirección
                </label>
                <input
                  id="store-address"
                  type="text"
                  value={storeForm.address}
                  onChange={(event) => setStoreForm((previous) => ({ ...previous, address: event.target.value }))}
                  placeholder="Dirección de la tienda"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-slate-300">Asignar cajeros</legend>
                <p className="text-[11px] text-slate-400">
                  {isEditingArchivedStore
                    ? 'Reactiva esta tienda antes de asignarle cajeros.'
                    : 'La selección reemplaza la asignación actual de esta tienda. Un cajero seleccionado se moverá aquí desde otra tienda.'}
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2">
                  {usersLoading ? (
                    <p className="p-2 text-xs text-slate-500">Cargando cajeros...</p>
                  ) : usersList.filter((user) => user.role === 'cajero').length === 0 ? (
                    <p className="p-2 text-xs text-slate-500">No hay usuarios con rol de cajero.</p>
                  ) : usersList
                    .filter((user) => user.role === 'cajero')
                    .map((cashier) => {
                      const assignedElsewhere = cashier.storeId && cashier.storeId !== editingStoreId;
                      const assignedStoreName = assignedElsewhere
                        ? storeNameById.get(cashier.storeId) || 'otra tienda'
                        : '';
                      return (
                        <label
                          key={cashier.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          <input
                            type="checkbox"
                            disabled={isEditingArchivedStore}
                            checked={storeForm.cashierIds.includes(cashier.id)}
                            onChange={(event) => setStoreForm((previous) => ({
                              ...previous,
                              cashierIds: event.target.checked
                                ? [...new Set([...previous.cashierIds, cashier.id])]
                                : previous.cashierIds.filter((id) => id !== cashier.id),
                            }))}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-400"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {cashier.displayName || cashier.username || cashier.email || cashier.id}
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-500">
                            {assignedElsewhere ? `Asignado a ${assignedStoreName}` : cashier.status || ''}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </fieldset>

              <div>
                <label htmlFor="store-phone" className="mb-1 block text-xs font-medium text-slate-300">
                  Teléfono
                </label>
                <input
                  id="store-phone"
                  type="tel"
                  value={storeForm.phone}
                  onChange={(event) => setStoreForm((previous) => ({ ...previous, phone: event.target.value }))}
                  placeholder="Teléfono de contacto"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-700 pt-4">
                <button
                  type="button"
                  onClick={handleCloseStoreModal}
                  disabled={isSavingStore}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingStore || usersLoading}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  {usersLoading ? 'Cargando cajeros...' : isSavingStore ? 'Guardando...' : editingStoreId ? 'Guardar cambios' : 'Crear tienda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Add / Edit User */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto font-sans">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                {editingUser ? 'Editar Usuario y Permisos' : 'Agregar Nuevo Usuario'}
              </h3>
              <button
                type="button"
                onClick={handleCloseUserModal}
                className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {userFormError && (
              <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs">
                {userFormError}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4">
              {/* Selector de Tipo de Cuenta: solo al editar; las cuentas nuevas son usuario/contraseña */}
              {editingUser && (
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Tipo de Acceso / Autenticación:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                      userForm.authType === 'credentials'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Usuario / Clave</span>
                  </button>
                  <button
                    type="button"
                    disabled
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                      userForm.authType === 'google'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Google</span>
                  </button>
                </div>
              </div>
              )}

              {userForm.authType === 'credentials' ? (
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">
                    Nombre de Usuario: <span className="text-cyan-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Ej. cajero1"
                      required
                      disabled={Boolean(editingUser)}
                      value={userForm.username}
                      onChange={(e) => setUserForm(prev => ({ ...prev, username: e.target.value.toLowerCase() }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                    />
                  </div>
                  {editingUser && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      El nombre de usuario no puede cambiarse una vez creado.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">
                    Correo Electrónico (Cuenta Google): <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="ejemplo@gmail.com"
                    required
                    disabled={Boolean(editingUser)}
                    onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                  {editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL && (
                    <p className="text-[11px] text-amber-400 mt-1">
                      El correo del Administrador Principal no puede modificarse.
                    </p>
                  )}
                </div>
              )}

              {!editingUser ? (
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">
                    Contraseña Inicial: <span className="text-cyan-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      value={userForm.password}
                      onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  La contraseña no puede verse ni cambiarse desde este panel. Si se olvida, crea un nuevo usuario.
                </p>
              )}

              {/* Nombre Completo */}
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Nombre Completo: <span className="text-cyan-400"></span>
                </label>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  //required
                  value={userForm.displayName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Rol y Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">
                    Rol Asignado:
                  </label>
                  <select
                    disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                    value={userForm.role}
                    onChange={(e) => handleRoleChangeInForm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  >
                    <option value="admin">Administrador (Acceso Total)</option>
                    <option value="supervisor">Supervisor (POS, Inv., Ventas)</option>
                    <option value="cajero">Cajero (POS e Inv.)</option>
                    <option value="custom">Personalizado (Manual)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">
                    Estado de la Cuenta:
                  </label>
                  <select
                    disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                    value={userForm.status}
                    onChange={(e) => setUserForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  >
                    <option value="active">Activo (Permite acceso)</option>
                    <option value="inactive">Inactivo (Acceso bloqueado)</option>
                    <option value="pending">Pendiente (En revisión)</option>
                  </select>
                </div>
              </div>

              {userForm.role === 'cajero' && (
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">
                    Tienda asignada: <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    required
                    value={userForm.storeId}
                    onChange={(e) => setUserForm(prev => ({ ...prev, storeId: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">Selecciona una tienda</option>
                    {activeStores.map((store) => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                    {userForm.storeId
                      && !activeStores.some((store) => store.id === userForm.storeId)
                      && stores.find((store) => store.id === userForm.storeId) && (
                        <option value={userForm.storeId}>
                          {stores.find((store) => store.id === userForm.storeId).name} (Archivada)
                        </option>
                      )}
                  </select>
                </div>
              )}

              {/* Permisos Granulares */}
              <div>
                <label className="text-xs text-slate-300 block mb-2 font-medium">
                  Permisos de Acceso al Sistema:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-900/90 p-3.5 rounded-xl border border-slate-700/80">
                  <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(userForm.permissions?.pos)}
                      onChange={() => handlePermissionToggle('pos')}
                      disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                      className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-600 focus:ring-cyan-400"
                    />
                    <div>
                      <p className="font-semibold text-white">Punto de Venta</p>
                      <p className="text-[11px] text-slate-400">Despacho, cobro y tickets</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(userForm.permissions?.inventory)}
                      onChange={() => handlePermissionToggle('inventory')}
                      disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                      className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-600 focus:ring-cyan-400"
                    />
                    <div>
                      <p className="font-semibold text-white">Inventario</p>
                      <p className="text-[11px] text-slate-400">Ver stock, resurtir y productos</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(userForm.permissions?.sales)}
                      onChange={() => handlePermissionToggle('sales')}
                      disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                      className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-600 focus:ring-cyan-400"
                    />
                    <div>
                      <p className="font-semibold text-white">Ventas y Reportes</p>
                      <p className="text-[11px] text-slate-400">Historial y métricas de dinero</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(userForm.permissions?.users)}
                      onChange={() => handlePermissionToggle('users')}
                      disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                      className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-600 focus:ring-cyan-400"
                    />
                    <div>
                      <p className="font-semibold text-white">Gestión de Usuarios</p>
                      <p className="text-[11px] text-slate-400">Administrar cuentas y roles</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Botones del Modal */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={handleCloseUserModal}
                  disabled={isSavingUser}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isSavingUser ? 'Guardando...' : editingUser ? 'Actualizar Usuario' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrintTicket ticket={ticketToPrint} receiptWidth={receiptWidth} stores={stores} />

    </div>
  );
}