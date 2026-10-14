import React, { useEffect, useMemo, useState } from 'react';
import { 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  PlusCircle, 
  AlertTriangle, 
  Search, 
  Trash2, 
  CheckCircle, 
  RefreshCw, 
  Store, 
  Truck, 
  MessageSquare, 
  DollarSign,
  Droplet,
  Layers,
  Printer,
  Users,
  ShieldCheck,
  LogOut,
  Edit,
  UserPlus,
  Lock,
  Key,
  User,
  History,
} from 'lucide-react';
import { usePOSData } from './hooks/usePOSData';
import {
  addProduct as saveNewProduct,
  restockProduct as saveRestock,
  updateProductMinStock as saveMinStock,
} from './services/inventoryService';
import { createSale } from './services/salesService';
import {
  DEFAULT_PERMISSIONS,
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

const INITIAL_USER_FORM = {
  authType: 'credentials', // 'credentials' | 'google'
  username: '',
  password: '',
  newPassword: '',
  email: '',
  displayName: '',
  role: 'cajero',
  permissions: { pos: true, inventory: true, sales: true, users: false },
  status: 'active',
};

const PRODUCT_COLORS = [
  { name: 'Cian', class: 'bg-cyan-500' },
  { name: 'Azul', class: 'bg-blue-500' },
  { name: 'Esmeralda', class: 'bg-emerald-500' },
  { name: 'Ámbar', class: 'bg-amber-500' },
  { name: 'Púrpura', class: 'bg-purple-500' },
  { name: 'Rosa', class: 'bg-rose-500' },
  { name: 'Índigo', class: 'bg-indigo-500' },
  { name: 'Lima', class: 'bg-lime-500' },
  { name: 'Naranja', class: 'bg-orange-500' },
  { name: 'Rojo', class: 'bg-red-500' },
];

const INITIAL_PRODUCT_FORM = {
  name: '',
  category: 'Jabón',
  customCategory: '',
  currentStock: '0',
  minStock: '10',
  unit: 'L',
  price: '',
  cost: '',
  color: 'bg-cyan-500',
  isPriceAutoSuggested: true,
};

const getCurrentDayRange = () => {
  const today = new Date();
  return {
    start: new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
    end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime(),
  };
};

const INITIAL_DAY_RANGE = getCurrentDayRange();

export default function App() {
  const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'inventory', 'sales'
  const { products, sales: salesHistory, movements, loading, error: dataError } = usePOSData();
  const [actionError, setActionError] = useState('');
  const [isSavingSale, setIsSavingSale] = useState(false);
  const [isRestocking, setIsRestocking] = useState(false);
  const [saleToPrint, setSaleToPrint] = useState(null);
  const [lastCompletedSale, setLastCompletedSale] = useState(null);
  const [receiptWidth, setReceiptWidth] = useState('58');
  const [dayRange, setDayRange] = useState(INITIAL_DAY_RANGE);
  
  // POS State
  const [cart, setCart] = useState([]);
  const [cartQuantityDrafts, setCartQuantityDrafts] = useState({});
  const [selectedChannel, setSelectedChannel] = useState('Mostrador');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);

  // Inventory Modal State
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [isInventoryHistoryOpen, setIsInventoryHistoryOpen] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState('all');
  const [editingMinStockProductId, setEditingMinStockProductId] = useState(null);
  const [minStockDraft, setMinStockDraft] = useState('');
  const [isSavingMinStock, setIsSavingMinStock] = useState(false);

  // Add Product Modal State
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [productFormError, setProductFormError] = useState('');
  const [addProductSuccess, setAddProductSuccess] = useState('');
  const [newProductForm, setNewProductForm] = useState(INITIAL_PRODUCT_FORM);

  // Auth & Permissions State
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginMode, setLoginMode] = useState('credentials'); // 'credentials' | 'google'
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

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
      setCurrentUser(profile);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const canAccessUsers = currentUser?.role === 'admin' 
    || currentUser?.permissions?.users 
    || currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const isAdmin = currentUser?.role === 'admin';
  const canAccessPos = currentUser?.role === 'admin' || currentUser?.permissions?.pos;
  const canAccessInventory = currentUser?.role === 'admin' || currentUser?.permissions?.inventory;
  const canAccessSales = currentUser?.role === 'admin' || currentUser?.permissions?.sales;
  const currentUserId = currentUser?.id || currentUser?.uid || null;
  const [usersLoadedForUserId, setUsersLoadedForUserId] = useState(null);
  const usersLoading = Boolean(canAccessUsers && usersLoadedForUserId !== (currentUserId || 'unknown'));

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
    pos: canAccessPos,
    inventory: canAccessInventory,
    sales: canAccessSales,
    users: canAccessUsers,
  };
  const fallbackTabs = {
    pos: ['inventory', 'sales', 'users'],
    inventory: ['pos', 'sales', 'users'],
    sales: ['pos', 'inventory', 'users'],
    users: ['pos', 'inventory', 'sales'],
  };
  const visibleTab = !currentUser || currentUser.status !== 'active' || tabPermissions[activeTab]
    ? activeTab
    : fallbackTabs[activeTab]?.find((tab) => tabPermissions[tab]) || activeTab;

  useEffect(() => {
    if (!saleToPrint) return undefined;

    const clearPrintedSale = () => setSaleToPrint(null);
    window.addEventListener('afterprint', clearPrintedSale);
    window.print();
    return () => window.removeEventListener('afterprint', clearPrintedSale);
  }, [saleToPrint]);

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

  const lowStockProducts = useMemo(() => {
    return products.filter((product) => product.currentStock <= product.minStock);
  }, [products]);
  const lowStockCount = lowStockProducts.length;

  const filteredMovements = useMemo(() => (
    movementTypeFilter === 'all'
      ? movements
      : movements.filter((movement) => movement.type === movementTypeFilter)
  ), [movements, movementTypeFilter]);

  const totalLitersInStock = useMemo(() => {
    return products.reduce((acc, p) => acc + p.currentStock, 0);
  }, [products]);

  const availableCategories = useMemo(() => {
    const defaultCats = ['Jabón', 'Suavizante'];
    const cats = new Set(defaultCats);
    products.forEach((p) => {
      if (p.category && typeof p.category === 'string' && p.category.trim()) {
        cats.add(p.category.trim());
      }
    });
    return Array.from(cats);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleSelectProductToCart = (product) => {
    const existingItem = cart.find((item) => item.id === product.id);
    const nextQuantity = Number(((existingItem?.qty || 0) + 1).toFixed(2));

    if (nextQuantity > product.currentStock) {
      alert(`⚠️ Stock insuficiente. Solo quedan ${product.currentStock} ${product.unit} disponibles.`);
      return;
    }

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

  const cartTotalLiters = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  const handleCompleteSale = async () => {
    if (cart.length === 0 || isSavingSale) return;
    setActionError('');
    setIsSavingSale(true);
    try {
      const sale = await createSale({ cart, channel: selectedChannel, user: currentUser });
      setCart([]);
      setCartQuantityDrafts({});
      setLastCompletedSale(sale);
      setShowCheckoutSuccess(true);
      setTimeout(() => setShowCheckoutSuccess(false), 3000);
    } catch (error) {
      setActionError(error.message || 'No se pudo registrar la venta.');
    } finally {
      setIsSavingSale(false);
    }
  };

  const handleOpenRestock = (product) => {
    setRestockProduct(product);
    setRestockAmount('');
    setIsRestockOpen(true);
  };

  const handleApplyRestock = async (e) => {
    e.preventDefault();
    const amount = parseFloat(restockAmount);
    if (isNaN(amount) || amount <= 0 || !restockProduct || isRestocking) {
      setActionError('Indica una cantidad de resurtido válida.');
      return;
    }

    setActionError('');
    setIsRestocking(true);
    try {
      await saveRestock(restockProduct.id, amount, currentUser);
      setIsRestockOpen(false);
      setRestockProduct(null);
      setRestockAmount('');
    } catch (error) {
      setActionError(error.message || 'No se pudo actualizar el inventario.');
    } finally {
      setIsRestocking(false);
    }
  };

  const handleSaveMinStock = async (event, productId) => {
    event.preventDefault();
    const minStock = parseFloat(minStockDraft);
    if (!isAdmin || isSavingMinStock) return;
    if (!Number.isFinite(minStock) || minStock < 0
      || Number((minStock * 100).toFixed(0)) / 100 !== minStock) {
      setActionError('Indica un mínimo de alerta válido con máximo dos decimales.');
      return;
    }

    setActionError('');
    setIsSavingMinStock(true);
    try {
      await saveMinStock(productId, minStock, currentUser);
      setEditingMinStockProductId(null);
      setMinStockDraft('');
    } catch (error) {
      setActionError(error.message || 'No se pudo actualizar el mínimo de alerta.');
    } finally {
      setIsSavingMinStock(false);
    }
  };

  const handleOpenAddProduct = () => {
    setNewProductForm({
      ...INITIAL_PRODUCT_FORM,
      category: availableCategories[0] || 'Jabón',
    });
    setProductFormError('');
    setIsAddProductOpen(true);
  };

  const handleCloseAddProduct = () => {
    if (isAddingProduct) return;
    setIsAddProductOpen(false);
    setProductFormError('');
  };

  const handleCostChange = (val) => {
    setNewProductForm(prev => {
      const numCost = parseFloat(val);
      const shouldAutoFill = (!prev.price || prev.isPriceAutoSuggested) && !isNaN(numCost) && numCost > 0;
      return {
        ...prev,
        cost: val,
        price: shouldAutoFill ? (numCost / 0.5).toFixed(2) : prev.price,
        isPriceAutoSuggested: shouldAutoFill ? true : prev.isPriceAutoSuggested,
      };
    });
  };

  const handlePriceChange = (val) => {
    setNewProductForm(prev => ({
      ...prev,
      price: val,
      isPriceAutoSuggested: false,
    }));
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (isAddingProduct) return;

    const trimmedName = newProductForm.name.trim();
    const finalCategory = newProductForm.category === '__custom__'
      ? newProductForm.customCategory.trim()
      : newProductForm.category.trim();

    if (!trimmedName) {
      setProductFormError('Ingresa el nombre del producto.');
      return;
    }

    if (!finalCategory) {
      setProductFormError('Ingresa o selecciona una categoría.');
      return;
    }

    const currentStockNum = parseFloat(newProductForm.currentStock);
    if (isNaN(currentStockNum) || currentStockNum < 0) {
      setProductFormError('El stock inicial debe ser 0 o mayor.');
      return;
    }

    const minStockNum = parseFloat(newProductForm.minStock);
    if (isNaN(minStockNum) || minStockNum < 0) {
      setProductFormError('El stock mínimo debe ser 0 o mayor.');
      return;
    }

    const costNum = parseFloat(newProductForm.cost);
    if (isNaN(costNum) || costNum < 0) {
      setProductFormError('El costo por unidad debe ser 0 o mayor.');
      return;
    }

    const priceNum = parseFloat(newProductForm.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setProductFormError('El precio de venta debe ser mayor a 0.');
      return;
    }

    setProductFormError('');
    setIsAddingProduct(true);

    try {
      await saveNewProduct({
        name: trimmedName,
        category: finalCategory,
        currentStock: currentStockNum,
        minStock: minStockNum,
        unit: newProductForm.unit || 'L',
        price: priceNum,
        cost: costNum,
        color: newProductForm.color || 'bg-cyan-500',
      }, currentUser);

      setIsAddProductOpen(false);
      setAddProductSuccess(`¡Producto "${trimmedName}" registrado con éxito!`);
      setTimeout(() => setAddProductSuccess(''), 4000);
    } catch (error) {
      setProductFormError(error.message || 'No se pudo registrar el producto.');
    } finally {
      setIsAddingProduct(false);
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
      const user = await loginWithCredentials(loginUsername, loginPassword);
      setCurrentUser(user);
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
      newPassword: '',
      email: userToEdit.email || '',
      displayName: userToEdit.displayName || '',
      role: userToEdit.role || 'cajero',
      permissions: userToEdit.permissions || DEFAULT_PERMISSIONS[userToEdit.role] || DEFAULT_PERMISSIONS.cajero,
      status: userToEdit.status || 'active',
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
      if (!editingUser && (!userForm.password || userForm.password.trim().length < 4)) {
        setUserFormError('La contraseña inicial debe tener al menos 4 caracteres.');
        return;
      }
      if (editingUser && userForm.newPassword && userForm.newPassword.trim().length < 4) {
        setUserFormError('La nueva contraseña debe tener al menos 4 caracteres.');
        return;
      }
    } else {
      const cleanEmail = userForm.email.toLowerCase().trim();
      if (!cleanEmail) {
        setUserFormError('Ingresa un correo electrónico válido.');
        return;
      }
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
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60 space-y-1 text-left">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                  <Lock className="w-4 h-4" />
                  <span>Acceso de Administrador</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Inicia sesión con tu cuenta de Google autorizada.
                </p>
              </div>

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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      
      {/* Top Navbar */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center space-x-3">
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
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">Stock Total:</span>
            <span className="font-bold text-slate-200">{totalLitersInStock.toFixed(1)} L</span>
          </div>

          <div className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-semibold ${
            lowStockCount > 0 
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse' 
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}>
            <AlertTriangle className="w-4 h-4" />
            <span>{lowStockCount > 0 ? `${lowStockCount} Bajo Stock` : 'Stock Saludable'}</span>
          </div>

          {/* User Profile Badge */}
          <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-700/80 px-2.5 py-1.5 rounded-xl">
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
        <nav className="flex bg-slate-900 p-1 rounded-xl border border-slate-700/80 w-full md:w-auto">
          {canAccessPos && (
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                visibleTab === 'pos' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Punto de Venta</span>
            </button>
          )}
          
          {canAccessInventory && (
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                visibleTab === 'inventory' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Inventario</span>
              {lowStockCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-slate-900">
                  {lowStockCount}
                </span>
              )}
            </button>
          )}

          {canAccessSales && (
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                visibleTab === 'sales' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Ventas / Reporte</span>
            </button>
          )}

          {canAccessUsers && (
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                visibleTab === 'users' 
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuarios</span>
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
        <div role="alert" className="mx-auto mt-3 w-full max-w-7xl px-3 sm:px-5">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {dataError || actionError}
          </div>
        </div>
      )}
      {loading && (
        <div role="status" className="mx-auto mt-3 w-full max-w-7xl px-3 sm:px-5 text-sm text-slate-400">
          Conectando con Firestore...
        </div>
      )}

      <main className="flex-1 p-3 sm:p-5 max-w-7xl mx-auto w-full">
        {canAccessInventory && lowStockCount > 0 && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Alerta: stock mínimo alcanzado</p>
              <p className="mt-1 text-xs text-amber-100/80">
                {lowStockProducts.slice(0, 3).map((product) =>
                  `${product.name}: ${product.currentStock} de ${product.minStock} ${product.unit}`
                ).join(' · ')}
                {lowStockCount > 3 && ` · y ${lowStockCount - 3} productos más`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className="shrink-0 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/15"
            >
              Ver inventario
            </button>
          </div>
        )}

        {/* TAB 1: PUNTO DE VENTA (POS) */}
        {visibleTab === 'pos' && canAccessPos && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
            
            {/* Catalog & Quick Add (Left Column - 7/12) */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              
              {/* Search & Category Filter */}
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-sm flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar jabón, cloro, suavitel..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                
                <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {['Todos', ...availableCategories].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                        selectedCategory === cat 
                          ? 'bg-slate-700 text-cyan-400 border border-cyan-500/30' 
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-700/50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
                {filteredProducts.map(prod => {
                  const isLow = prod.currentStock <= prod.minStock;
                  const isSelected = cart.some((item) => item.id === prod.id);

                  return (
                    <button
                      key={prod.id}
                      onClick={() => handleSelectProductToCart(prod)}
                      className={`text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between relative group ${
                        isSelected 
                          ? 'bg-slate-800 border-cyan-500 ring-2 ring-cyan-500/20 shadow-lg' 
                          : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-500 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`w-3 h-3 rounded-full ${prod.color}`} />
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            isLow 
                              ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' 
                              : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}>
                            {prod.currentStock} {prod.unit}
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm text-slate-100 line-clamp-2 leading-snug mb-1">
                          {prod.name}
                        </h3>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between">
                        <span className="text-xs text-slate-400">x {prod.unit}</span>
                        <span className="text-base font-bold text-cyan-400">${prod.price.toFixed(2)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cart Panel (Right Column - 5/12) */}
            <div className="lg:col-span-5 flex flex-col gap-4">

              {/* Shopping Cart Summary */}
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex-1 flex flex-col justify-between shadow-md">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5 text-cyan-400" />
                      Ticket de Venta
                    </h3>
                    <span className="text-xs bg-slate-900 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
                      {cart.length} Ítems
                    </span>
                  </div>

                  {/* Channel Selection Buttons */}
                  <div className="mb-3">
                    <label className="text-[11px] text-slate-400 uppercase font-semibold mb-1.5 block">Canal de Venta:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'Mostrador', icon: Store, color: 'text-emerald-400' },
                        { id: 'Uber Flash', icon: Truck, color: 'text-amber-400' },
                        { id: 'WhatsApp', icon: MessageSquare, color: 'text-green-400' }
                      ].map(ch => {
                        const Icon = ch.icon;
                        const isSel = selectedChannel === ch.id;
                        return (
                          <button
                            key={ch.id}
                            onClick={() => setSelectedChannel(ch.id)}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-medium border transition ${
                              isSel 
                                ? 'bg-slate-700 border-cyan-500 text-white shadow-sm' 
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <Icon className={`w-3.5 h-3.5 ${ch.color}`} />
                            <span>{ch.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 text-xs">
                        El carrito está vacío. Haz clic en los productos para comenzar a cobras.
                      </div>
                    ) : (
                      cart.map(item => {
                        const productStock = products.find((product) => product.id === item.id)?.currentStock;
                        return (
                          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto_auto] items-center gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-xs">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-200 line-clamp-1">{item.name}</p>
                              <p className="text-slate-400 text-[11px]">${item.price.toFixed(2)} / {item.unit}</p>
                            </div>
                            <input
                              type="number"
                              min="0.01"
                              max={productStock}
                              step="0.01"
                              aria-label={`Cantidad de ${item.name}`}
                              value={cartQuantityDrafts[item.id] ?? item.qty}
                              onChange={(event) => handleCartQuantityChange(item.id, event.target.value)}
                              onBlur={() => handleCartQuantityBlur(item.id)}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-1.5 py-1.5 text-center font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                            />
                            <span className="font-bold text-slate-100 whitespace-nowrap">${item.total.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(item.id)}
                              aria-label={`Quitar ${item.name}`}
                              className="text-slate-500 hover:text-red-400 p-1 rounded-md transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Checkout Summary Footer */}
                <div className="pt-4 border-t border-slate-700 mt-4">
                  <div className="space-y-1.5 mb-4 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Total Volumen:</span>
                      <span className="font-mono text-slate-200">{cartTotalLiters.toFixed(1)} Litros</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-slate-700/50">
                      <span>Total a Cobrar:</span>
                      <span className="text-xl text-cyan-400 font-mono">${cartTotal.toFixed(2)} MXN</span>
                    </div>
                  </div>

                  {showCheckoutSuccess && (
                    <div className="mb-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-xl text-xs flex items-center justify-center gap-2 animate-bounce">
                      <CheckCircle className="w-4 h-4" />
                      <span>¡Venta registrada con éxito! {lastCompletedSale && `Total: $${lastCompletedSale.total.toFixed(2)}`}</span>
                    </div>
                  )}
                  {lastCompletedSale && (
                    <button
                      type="button"
                      onClick={() => setSaleToPrint(lastCompletedSale)}
                      className="mb-2 w-full py-2 rounded-xl border border-slate-600 text-xs font-semibold text-slate-200 hover:bg-slate-700 flex items-center justify-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Imprimir Ticket
                    </button>
                  )}

                  <button
                    disabled={cart.length === 0 || isSavingSale || loading}
                    onClick={handleCompleteSale}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition shadow-lg flex items-center justify-center gap-2 ${
                      cart.length > 0 && !isSavingSale && !loading
                        ? 'bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/25' 
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    {isSavingSale ? 'Procesando...' : `Registrar Cobro ($${cartTotal.toFixed(2)})`}
                  </button>
                </div>
              </div>

            </div>

          </div>
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
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Volumen Total en Local</p>
                  <p className="text-2xl font-bold text-white font-mono">{totalLitersInStock.toFixed(1)} L</p>
                </div>
              </div>

              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Productos por Resurtir</p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">{lowStockCount}</p>
                </div>
              </div>

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

            {/* Inventory Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Package className="w-5 h-5 text-cyan-400" />
                    Control de Tanques y Porrones
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Barra: rojo en o bajo mínimo · ámbar próximo · verde suficiente. Marca blanca: mínimo.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInventoryHistoryOpen(true)}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer border border-slate-600"
                  >
                    <History className="w-4 h-4" />
                    <span>Historial</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAddProduct}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Nuevo Producto</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Stock Actual</th>
                      <th className="px-4 py-3">Mínimo (Alerta)</th>
                      <th className="px-4 py-3">Costo / Unidad</th>
                      <th className="px-4 py-3">Precio Venta</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                          <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                          <p className="font-semibold text-slate-200 text-sm">No hay productos registrados en el inventario</p>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                            Comienza agregando tus primeros productos, porrones o tanques de limpieza para iniciar el control.
                          </p>
                          <button
                            type="button"
                            onClick={handleOpenAddProduct}
                            className="mt-4 inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                          >
                            <PlusCircle className="w-4 h-4" />
                            <span>Agregar Primer Producto</span>
                          </button>
                        </td>
                      </tr>
                    ) : (
                      products.map(p => {
                        const isLow = p.currentStock <= p.minStock;
                        const stockScaleMax = p.minStock > 0
                          ? p.minStock * 1.5
                          : Math.max(p.currentStock, 1);
                        const stockFillPercent = Math.min((p.currentStock / stockScaleMax) * 100, 100);
                        const stockBarColor = isLow
                          ? 'bg-red-400'
                          : p.currentStock <= p.minStock * 1.5
                            ? 'bg-amber-400'
                            : 'bg-emerald-400';
                        return (
                          <tr key={p.id} className="hover:bg-slate-700/30 transition">
                            <td className="px-4 py-3 font-semibold text-slate-100 flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                              {p.name}
                            </td>
                            <td className="px-4 py-3 text-slate-400">{p.category}</td>
                            <td className="px-4 py-3 font-mono font-bold">
                              <div className="flex flex-col items-start gap-1.5">
                                <span className={`px-2 py-0.5 rounded-md border ${
                                  isLow 
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' 
                                    : 'bg-slate-900 text-slate-200 border-slate-700'
                                }`}>
                                  {p.currentStock} {p.unit}
                                </span>
                                <div
                                  role="meter"
                                  aria-label={`Nivel de stock de ${p.name}`}
                                  aria-valuemin={0}
                                  aria-valuemax={stockScaleMax}
                                  aria-valuenow={Math.min(p.currentStock, stockScaleMax)}
                                  aria-valuetext={`${p.currentStock} ${p.unit}; mínimo ${p.minStock} ${p.unit}`}
                                  title={`Stock: ${p.currentStock} ${p.unit} · Mínimo: ${p.minStock} ${p.unit}`}
                                  className="relative h-1.5 w-20 rounded-full bg-slate-700"
                                >
                                  <div
                                    className={`h-full rounded-full ${stockBarColor}`}
                                    style={{ width: `${stockFillPercent}%` }}
                                  />
                                  {p.minStock > 0 && (
                                    <span
                                      aria-hidden="true"
                                      className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90"
                                      style={{ left: `${(p.minStock / stockScaleMax) * 100}%` }}
                                    />
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400">
                              {isAdmin && editingMinStockProductId === p.id ? (
                                <form
                                  onSubmit={(event) => handleSaveMinStock(event, p.id)}
                                  className="flex items-center gap-1.5"
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    aria-label={`Mínimo de alerta para ${p.name}`}
                                    value={minStockDraft}
                                    onChange={(event) => setMinStockDraft(event.target.value)}
                                    className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-amber-300 focus:outline-none focus:border-cyan-400"
                                  />
                                  <span>{p.unit}</span>
                                  <button
                                    type="submit"
                                    disabled={isSavingMinStock}
                                    aria-label="Guardar mínimo de alerta"
                                    className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSavingMinStock}
                                    onClick={() => setEditingMinStockProductId(null)}
                                    aria-label="Cancelar edición del mínimo"
                                    className="text-slate-400 hover:text-white disabled:opacity-50"
                                  >
                                    ✕
                                  </button>
                                </form>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span>{p.minStock} {p.unit}</span>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMinStockProductId(p.id);
                                        setMinStockDraft(String(p.minStock));
                                      }}
                                      aria-label={`Editar mínimo de alerta para ${p.name}`}
                                      className="text-slate-500 hover:text-cyan-300"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono">${p.cost.toFixed(2)}</td>
                            <td className="px-4 py-3 font-mono text-cyan-400 font-bold">${p.price.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleOpenRestock(p)}
                                className="bg-slate-700 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ml-auto border border-slate-600 cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Resurtir
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

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
                        <option value="sale">Venta</option>
                      </select>
                    </div>
                    {movements.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-10">Aún no hay movimientos registrados.</p>
                    ) : filteredMovements.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-10">No hay movimientos de este tipo.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[650px] text-left text-xs text-slate-300">
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
                              const movementLabel = movement.type === 'restock'
                                ? 'Resurtido'
                                : movement.type === 'sale'
                                  ? `Venta${movement.ticketId ? ` ${movement.ticketId}` : ''}`
                                  : 'Producto creado';
                              const quantity = Math.abs(movement.amount || 0);
                              return (
                                <tr key={movement.id} className="hover:bg-slate-700/30">
                                  <td className="px-3 py-3 whitespace-nowrap">{movement.timestamp}</td>
                                  <td className="px-3 py-3 font-semibold text-slate-100">{movementLabel}</td>
                                  <td className="px-3 py-3">{movement.productName || 'Producto'}</td>
                                  <td className="px-3 py-3 font-mono">
                                    {movement.type === 'sale' ? '-' : '+'}{quantity} {movement.unit || ''}
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

            {/* Modal for Restock Input */}
            {isRestockOpen && restockProduct && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-cyan-400" />
                      Entrada de Producto (Resurtir)
                    </h3>
                    <button onClick={() => setIsRestockOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 space-y-1">
                    <p className="text-xs text-slate-400">Producto seleccionado:</p>
                    <p className="font-bold text-sm text-white">{restockProduct.name}</p>
                    <p className="text-xs text-cyan-400">Stock Actual: {restockProduct.currentStock} {restockProduct.unit}</p>
                  </div>

                  <form onSubmit={handleApplyRestock} className="space-y-4">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Cantidad a agregar ({restockProduct.unit}):</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ej. 50, 100, 200"
                        required
                        value={restockAmount}
                        onChange={(e) => setRestockAmount(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-lg font-bold text-cyan-400 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsRestockOpen(false)}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isRestocking}
                        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {isRestocking ? 'Guardando...' : 'Confirmar Entrada'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal for Add New Product */}
            {isAddProductOpen && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <PlusCircle className="w-5 h-5 text-cyan-400" />
                      Agregar Nuevo Producto
                    </h3>
                    <button
                      type="button"
                      onClick={handleCloseAddProduct}
                      className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {productFormError && (
                    <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-3 rounded-xl text-xs">
                      {productFormError}
                    </div>
                  )}

                  <form onSubmit={handleCreateProduct} className="space-y-4">
                    {/* Nombre */}
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-medium">
                        Nombre del Producto: <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Cloro Concentrado al 6%"
                        required
                        value={newProductForm.name}
                        onChange={(e) => setNewProductForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    {/* Categoría y Unidad */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-300 block mb-1 font-medium">
                          Categoría: <span className="text-cyan-400">*</span>
                        </label>
                        <select
                          value={newProductForm.category}
                          onChange={(e) => setNewProductForm(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                        >
                          {availableCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__custom__">+ Otra categoría...</option>
                        </select>
                        {newProductForm.category === '__custom__' && (
                          <input
                            type="text"
                            placeholder="Nombre de la nueva categoría"
                            required
                            value={newProductForm.customCategory}
                            onChange={(e) => setNewProductForm(prev => ({ ...prev, customCategory: e.target.value }))}
                            className="mt-2 w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                          />
                        )}
                      </div>

                      <div>
                        <label className="text-xs text-slate-300 block mb-1 font-medium">
                          Unidad de Medida:
                        </label>
                        <select
                          value={newProductForm.unit}
                          onChange={(e) => setNewProductForm(prev => ({ ...prev, unit: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                        >
                          <option value="L">L (Litro)</option>
                          <option value="Pza">Pza (Pieza)</option>
                          <option value="Kg">Kg (Kilogramo)</option>
                          <option value="Galón">Galón (3.785 L)</option>
                          <option value="Porrón">Porrón (20 L)</option>
                          <option value="Cubeta">Cubeta (19 L)</option>
                        </select>
                      </div>
                    </div>

                    {/* Stock Inicial y Stock Mínimo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-300 block mb-1 font-medium">
                          Stock Inicial ({newProductForm.unit}): <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          required
                          value={newProductForm.currentStock}
                          onChange={(e) => setNewProductForm(prev => ({ ...prev, currentStock: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm font-mono font-bold text-cyan-400 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-300 block mb-1 font-medium">
                          Stock Mínimo / Alerta ({newProductForm.unit}): <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="10.00"
                          required
                          value={newProductForm.minStock}
                          onChange={(e) => setNewProductForm(prev => ({ ...prev, minStock: e.target.value }))}
                          readOnly={!isAdmin}
                          className={`w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm font-mono text-amber-300 focus:outline-none focus:border-cyan-400 ${!isAdmin ? 'opacity-60' : ''}`}
                        />
                        {!isAdmin && (
                          <p className="text-[10px] text-slate-500 mt-1">Solo un administrador puede cambiar este valor.</p>
                        )}
                      </div>
                    </div>

                    {/* Costo y Precio de Venta */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-300 block mb-1 font-medium">
                          Costo por {newProductForm.unit} ($ MXN): <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          required
                          value={newProductForm.cost}
                          onChange={(e) => handleCostChange(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-300 font-medium block mb-1">
                          Precio de Venta ($ MXN): <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          required
                          value={newProductForm.price}
                          onChange={(e) => handlePriceChange(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-cyan-400"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Calculado automáticamente para un margen de venta del 50% o editable manualmente.
                        </p>
                      </div>
                    </div>

                    {/* Profit margin live preview */}
                    {parseFloat(newProductForm.price) > 0 && parseFloat(newProductForm.cost) >= 0 && (() => {
                      const costNum = parseFloat(newProductForm.cost) || 0;
                      const priceNum = parseFloat(newProductForm.price);
                      const profit = priceNum - costNum;
                      const profitPercentOnCost = costNum > 0 ? (profit / costNum) * 100 : 0;
                      const marginPercentOnSale = priceNum > 0 ? (profit / priceNum) * 100 : 0;

                      return (
                        <div className="bg-slate-900/80 border border-slate-700/80 p-3 rounded-xl text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Ganancia neta por {newProductForm.unit}:</span>
                            <span className="font-mono font-bold text-emerald-400">
                              +${profit.toFixed(2)} MXN
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800 pt-1.5">
                            <span>Rendimiento de ganancia:</span>
                            <span className={`font-mono font-semibold ${profitPercentOnCost >= 50 ? 'text-cyan-400' : 'text-slate-300'}`}>
                              {profitPercentOnCost.toFixed(1)}% sobre costo ({marginPercentOnSale.toFixed(1)}% margen sobre venta)
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Color Identificador */}
                    <div>
                      <label className="text-xs text-slate-300 block mb-1.5 font-medium">
                        Color Identificador en Catálogo:
                      </label>
                      <div className="flex flex-wrap gap-2 items-center">
                        {PRODUCT_COLORS.map(col => (
                          <button
                            type="button"
                            key={col.class}
                            title={col.name}
                            onClick={() => setNewProductForm(prev => ({ ...prev, color: col.class }))}
                            className={`w-7 h-7 rounded-full ${col.class} transition-all cursor-pointer ${
                              newProductForm.color === col.class
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110 shadow-lg'
                                : 'opacity-70 hover:opacity-100 hover:scale-105'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Modal Buttons */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                      <button
                        type="button"
                        onClick={handleCloseAddProduct}
                        disabled={isAddingProduct}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isAddingProduct}
                        className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4" />
                        {isAddingProduct ? 'Guardando...' : 'Guardar Producto'}
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

            {/* Sales Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">{isCajero ? 'Mi Venta del Día' : 'Venta Total del Día'}</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    ${visibleSalesToday.reduce((acc, s) => acc + s.total, 0).toFixed(2)} MXN
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
                    {visibleSalesToday.reduce((acc, s) => acc + s.liters, 0).toFixed(1)} L
                  </p>
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

            {/* Sales Log Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md">
              <div className="p-4 border-b border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-cyan-400" />
                    Historial de Transacciones Recientes
                  </h2>
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    Ancho del ticket
                    <select
                      value={receiptWidth}
                      onChange={(event) => setReceiptWidth(event.target.value)}
                      className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-slate-200"
                    >
                      <option value="58">58 mm</option>
                      <option value="80">80 mm</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Hora / Fecha</th>
                      <th className="px-4 py-3">Canal</th>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3">Detalle Productos</th>
                      <th className="px-4 py-3">Litros</th>
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
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="text-slate-200 font-medium truncate max-w-[120px]">
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
                              • {it.name} ({it.qty}L)
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">{sale.liters} L</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 text-sm">
                          <span>${sale.total.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => setSaleToPrint(sale)}
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
          <div className="space-y-5">
            {userSuccessMessage && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>{userSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUserSuccessMessage('')}
                  className="text-emerald-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Total de Usuarios</p>
                  <p className="text-2xl font-bold text-white font-mono">{usersList.length}</p>
                </div>
              </div>

              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Administradores</p>
                  <p className="text-2xl font-bold text-white font-mono">
                    {usersList.filter(u => u.role === 'admin' || u.email === SUPER_ADMIN_EMAIL).length}
                  </p>
                </div>
              </div>

              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                <div className={`p-3 rounded-xl border ${
                  pendingUsersCount > 0 
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' 
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Pendientes de Aprobación</p>
                  <p className={`text-2xl font-bold font-mono ${pendingUsersCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {pendingUsersCount}
                  </p>
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-cyan-400" />
                    Directorio de Usuarios y Permisos
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Permite a los administradores conceder o revocar accesos en tiempo real
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddUser}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Nuevo Usuario</span>
                </button>
              </div>

              {usersLoading && (
                <div className="p-4 text-center text-xs text-slate-400">
                  Cargando directorio de usuarios...
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Permisos Activos</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Último Acceso</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {usersList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                          <p className="font-semibold text-slate-200 text-sm">No hay usuarios registrados</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Agrega colaboradores para asignarles acceso al Punto de Venta o Inventario.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      usersList.map(u => {
                        const isMainAdmin = u.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
                        const perms = u.permissions || {};
                        const displayTitle = u.displayName || u.username || u.email || 'Sin nombre';
                        const subtitle = u.username ? `@${u.username}` : u.email;
                        return (
                          <tr key={u.id || u.username || u.email} className="hover:bg-slate-700/30 transition">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {u.photoURL ? (
                                  <img src={u.photoURL} alt={displayTitle} className="w-8 h-8 rounded-full border border-slate-600 object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-slate-700 text-cyan-300 flex items-center justify-center font-bold text-xs border border-slate-600">
                                    {(displayTitle || 'U')[0].toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold text-slate-100 flex items-center gap-1.5">
                                    <span>{displayTitle}</span>
                                    {isMainAdmin && (
                                      <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded-md font-bold">
                                        Super Admin
                                      </span>
                                    )}
                                    {u.authType === 'credentials' && (
                                      <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded-md font-medium">
                                        Usuario / Clave
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-slate-400 text-[11px] font-mono">{subtitle}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                u.role === 'admin' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' :
                                u.role === 'supervisor' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                                u.role === 'cajero' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                                'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              }`}>
                                {u.role === 'admin' ? 'Administrador' :
                                 u.role === 'supervisor' ? 'Supervisor' :
                                 u.role === 'cajero' ? 'Cajero' : 'Personalizado'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {perms.pos && (
                                  <span className="bg-slate-900 border border-slate-700 text-cyan-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    POS
                                  </span>
                                )}
                                {perms.inventory && (
                                  <span className="bg-slate-900 border border-slate-700 text-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    Inventario
                                  </span>
                                )}
                                {perms.sales && (
                                  <span className="bg-slate-900 border border-slate-700 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    Ventas
                                  </span>
                                )}
                                {perms.users && (
                                  <span className="bg-slate-900 border border-slate-700 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    Usuarios
                                  </span>
                                )}
                                {!perms.pos && !perms.inventory && !perms.sales && !perms.users && (
                                  <span className="text-slate-500 text-[11px] italic">Sin permisos</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                u.status === 'active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                                u.status === 'pending' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse' :
                                'bg-red-500/15 text-red-300 border-red-500/30'
                              }`}>
                                {u.status === 'active' ? '● Activo' :
                                 u.status === 'pending' ? '▲ Pendiente' : '✕ Inactivo'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                              {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('es-MX', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                              }) : 'Nunca'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUser(u)}
                                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1 border border-slate-600 cursor-pointer"
                                  title="Editar usuario y permisos"
                                >
                                  <Edit className="w-3 h-3" />
                                  <span>Editar</span>
                                </button>
                                {!isMainAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u)}
                                    className="bg-slate-700/60 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 text-slate-400 p-1.5 rounded-lg transition border border-slate-700 cursor-pointer"
                                    title="Eliminar usuario"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-3 px-4 text-center text-xs text-slate-500">
        POSKlean • Gestión de inventarios y punto de venta integral. • 
      </footer>

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
              {/* Selector de Tipo de Cuenta */}
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Tipo de Acceso / Autenticación:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                    onClick={() => setUserForm(prev => ({ ...prev, authType: 'credentials' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      userForm.authType === 'credentials'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Usuario / Clave</span>
                  </button>
                  <button
                    type="button"
                    disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                    onClick={() => setUserForm(prev => ({ ...prev, authType: 'google' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      userForm.authType === 'google'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Google</span>
                  </button>
                </div>
              </div>

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
                      value={userForm.username}
                      onChange={(e) => setUserForm(prev => ({ ...prev, username: e.target.value.toLowerCase() }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
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
                    disabled={editingUser && editingUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL}
                    value={userForm.email}
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
                      placeholder="Mínimo 4 caracteres"
                      required
                      value={userForm.password}
                      onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">
                    Nueva Contraseña (Opcional):
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      placeholder="Dejar en blanco para mantener la actual"
                      value={userForm.newPassword}
                      onChange={(e) => setUserForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
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

      {saleToPrint && (
        <section className={`print-ticket receipt-${receiptWidth}`} aria-label="Ticket para imprimir">
          <h1>POSKlean</h1>
          <p>Ticket: {saleToPrint.ticketId}</p>
          <p>Fecha: {saleToPrint.timestamp}</p>
          <p>Canal: {saleToPrint.channel}</p>
          <hr />
          {saleToPrint.items.map((item) => (
            <div className="receipt-item" key={item.productId || item.name}>
              <span>{item.name}</span>
              <span>{item.qty} {item.unit || 'L'} × ${item.price.toFixed(2)}</span>
              <strong>${item.total.toFixed(2)}</strong>
            </div>
          ))}
          <hr />
          <p>Litros: {saleToPrint.liters.toFixed(2)} L</p>
          <p className="receipt-total">TOTAL: ${saleToPrint.total.toFixed(2)} MXN</p>
          <p className="receipt-thanks">¡Gracias por su compra!</p>
        </section>
      )}

    </div>
  );
}