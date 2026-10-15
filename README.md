# LimpiezaPOS

Aplicación de punto de venta e inventario con React, Vite y Firebase Firestore.

## Configurar Firebase

1. En Firebase Console, registra una aplicación web para el proyecto `posklean` (o el proyecto que vayas a usar) y copia su configuración del SDK web.
2. Copia `.env.example` a `.env.local` y completa las variables `VITE_FIREBASE_*` con esos valores. La configuración web identifica el proyecto, pero no sustituye las reglas de seguridad de Firestore.
3. Los productos se gestionan desde la pestaña **Catálogo** (administradores y supervisores): no hace falta crear documentos a mano. El catálogo central vive en `catalogProducts` (nombre, categoría, unidad, precio global, estado) y las existencias por sucursal en `stockItems` (ID `<storeId>_<catalogId>`: stock, mínimo, costo y `priceOverride` opcional). Los datos de la antigua colección `products` no se migran.
4. Habilita **Authentication → Email/Password** y **Google** en la consola de Firebase y publica las reglas con `npx firebase-tools deploy --only firestore:rules` (archivo `firestore.rules`). Las reglas exigen sesión de Firebase y autorizan según el perfil `users/{uid}` (rol, estado y tienda).
5. Ejecuta `npm install` y luego `npm run dev`.

### Autenticación

- Los usuarios con usuario/contraseña se autentican en Firebase Auth con un correo ficticio `<usuario>@posklean.invalid`; la contraseña nunca se guarda en Firestore. Mínimo 6 caracteres.
- El perfil de cada cuenta vive en `users/{uid}`. El administrador crea cuentas desde el panel (se usa una instancia secundaria de Firebase para no cerrar su sesión).
- No es posible cambiar la contraseña de otro usuario desde el cliente. Si se olvida, elimina el perfil y crea un usuario nuevo (el mismo nombre solo se puede reutilizar con la contraseña anterior).
- Las cuentas de Google no se pre-registran: inician sesión, quedan **Pendientes** y un administrador las aprueba. El administrador principal se identifica por su cuenta de Google verificada.
- Usuarios creados antes de esta migración (con hash local) no pueden iniciar sesión; vuelve a crearlos con el mismo nombre de usuario para reemplazarlos.

La pantalla escucha `catalogProducts`, `stockItems` y `sales` en tiempo real y fusiona catálogo y existencias en cada producto visible (precio = precio propio de la tienda o, si no tiene, el global). No crea inventario ni tickets de ejemplo.

### Catálogo central y existencias por sucursal

Un producto se define una sola vez en el catálogo y se "habilita" en cada tienda con su stock inicial, mínimo y costo. Administradores y supervisores crean y editan el catálogo y fijan un precio propio por tienda (vacío = precio global); los productos se archivan (solo sin existencias) en lugar de borrarse. Al recibir una compra, el precio aceptado se guarda como precio propio de esa tienda. Quitar un producto de una tienda (stock 0) borra solo sus existencias en esa tienda. Crear un producto desde Inventario o desde una orden de compra reutiliza el del catálogo si el nombre ya existe.

## Operaciones de venta e inventario

`src/services/inventoryService.js` gestiona tanto el alta de nuevos productos (`addProduct`) como el resurtido de existencias (`restockProduct`). Los productos nuevos se crean desde la pestaña **Catálogo** (administradores y supervisores) con el botón de nuevo producto: nombre, categoría, unidad, color y precio de venta, y opcionalmente se habilitan en una tienda con stock inicial, mínimo y costo (precio sugerido con 50% de margen). Inventario ya no crea productos; muestra y resurte las existencias de la tienda. Administradores y supervisores pueden **transferir** existencias a otra tienda (`src/services/transferService.js`): una transacción descuenta el origen, suma al destino (lo habilita con el costo del origen o promedia el costo si ya existe) y registra movimientos `transfer_out` y `transfer_in`. El stock se actualiza mediante transacciones de Firestore para prevenir sobreescrituras concurrentes y los cambios se reflejan en tiempo real con `onSnapshot()`.

`src/services/salesService.js` procesa cada cobro en una transacción: lee los productos, verifica que existan y que tengan stock suficiente, calcula el precio desde Firestore, descuenta `currentStock` y crea un ticket en `sales` como una sola operación atómica. Las ventas guardan cantidades y precios de cada artículo junto con el canal, el total y una marca de tiempo del servidor.

### Turnos y cierres de caja

Cada usuario puede mantener un solo turno abierto a la vez. Antes de vender debe abrir un turno en una tienda activa e indicar el fondo inicial. Cada venta registra por separado el canal comercial y un único método de pago: efectivo, tarjeta o transferencia. El cierre suma las ventas de ese turno, calcula el efectivo esperado como fondo inicial más ventas en efectivo, guarda el efectivo contado y la diferencia, y permite imprimir el cierre. Las reglas exigen que la venta apunte al turno abierto de su cajero y que la caja y el turno cambien de estado juntos.

El cálculo actual no contempla retiros, entradas adicionales de efectivo, devoluciones ni pagos divididos; cualquier diferencia debe registrarse como diferencia de cierre. Las cifras se calculan en el cliente y las reglas validan el flujo y los tipos, pero no reemplazan un backend confiable para auditar importes frente a clientes manipulados.

Las transacciones del SDK web evitan inconsistencias por ventas concurrentes, pero el código cliente no es una frontera de seguridad contra clientes manipulados. Las reglas de Firestore limitan cada cajero a su tienda e impiden modificar o borrar ventas y movimientos, pero no pueden verificar por completo cifras como stock o totales enviadas por un cliente alterado; para eso se requiere un backend autenticado.

### Archivado de tiendas

Al archivar una tienda, la operación elimina en una transacción las asignaciones de sus cajeros tanto en los perfiles como en la tienda. Esos usuarios quedan sin tienda y no pueden operar en el POS hasta que se les asigne una tienda activa. Reactivar una tienda no restaura asignaciones anteriores; deben hacerse explícitamente desde la administración. Las reglas permiten consultar información histórica de tiendas archivadas a administradores, pero bloquean nuevas ventas y modificaciones de inventario en ellas.

### Compras y proveedores

La pestaña Compras (administradores y supervisores) mantiene un catálogo global de proveedores, que se archivan en lugar de borrarse, y órdenes de compra por tienda. Una orden nace `pending`, pasa a `partial` o `received` con cada recepción (admite recepciones parciales) y solo puede cancelarse mientras no tenga recepciones. Al recibir, una transacción suma el stock, recalcula el costo del producto como promedio ponderado entre el stock actual y lo recibido, y registra un movimiento de inventario tipo `purchase`. Si quien recibe es administrador o supervisor, se le sugiere un nuevo precio de venta (costo promedio ÷ 0.5, es decir 50% de margen sobre la venta) y decide si aplicarlo. Los productos nuevos creados desde una orden sugieren su precio con el mismo criterio. No incluye cuentas por pagar.

Limitaciones: las reglas no iteran las líneas de la orden (solo validan que sea una lista de 1 a 50 elementos; el detalle se valida en el cliente), no enlazan la recepción con el producto ni el movimiento correspondientes, y un supervisor puede modificar el costo y el precio de venta de productos de sus tiendas. Cualquier regla nueva debe publicarse con `firebase deploy --only firestore:rules`.

## Impresión de tickets

Desde el POS se puede imprimir el ticket después del cobro, o reimprimir cualquier ticket desde el historial. El selector permite ajustar el ancho a impresoras de 58 mm u 80 mm.
