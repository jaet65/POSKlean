# LimpiezaPOS

Aplicación de punto de venta e inventario con React, Vite y Firebase Firestore.

## Configurar Firebase

1. En Firebase Console, registra una aplicación web para el proyecto `posklean` (o el proyecto que vayas a usar) y copia su configuración del SDK web.
2. Copia `.env.example` a `.env.local` y completa las variables `VITE_FIREBASE_*` con esos valores. La configuración web identifica el proyecto, pero no sustituye las reglas de seguridad de Firestore.
3. En Firestore crea documentos en la colección `products`. El ID de cada documento se usa como ID del producto. Cada producto necesita estos campos:

   ```text
   name: string
   category: string
   currentStock: number
   minStock: number
   unit: string (por ejemplo, "L")
   price: number
   cost: number
   color: string (clase de color de Tailwind usada por la tarjeta)
   ```

4. Habilita **Authentication → Email/Password** y **Google** en la consola de Firebase y publica las reglas con `npx firebase-tools deploy --only firestore:rules` (archivo `firestore.rules`). Las reglas exigen sesión de Firebase y autorizan según el perfil `users/{uid}` (rol, estado y tienda).
5. Ejecuta `npm install` y luego `npm run dev`.

### Autenticación

- Los usuarios con usuario/contraseña se autentican en Firebase Auth con un correo ficticio `<usuario>@posklean.invalid`; la contraseña nunca se guarda en Firestore. Mínimo 6 caracteres.
- El perfil de cada cuenta vive en `users/{uid}`. El administrador crea cuentas desde el panel (se usa una instancia secundaria de Firebase para no cerrar su sesión).
- No es posible cambiar la contraseña de otro usuario desde el cliente. Si se olvida, elimina el perfil y crea un usuario nuevo (el mismo nombre solo se puede reutilizar con la contraseña anterior).
- Las cuentas de Google no se pre-registran: inician sesión, quedan **Pendientes** y un administrador las aprueba. El administrador principal se identifica por su cuenta de Google verificada.
- Usuarios creados antes de esta migración (con hash local) no pueden iniciar sesión; vuelve a crearlos con el mismo nombre de usuario para reemplazarlos.

La pantalla escucha `products` y `sales` en tiempo real. No crea inventario ni tickets de ejemplo; al comienzo, las colecciones deben estar cargadas con los datos reales del local.

## Operaciones de venta e inventario

`src/services/inventoryService.js` gestiona tanto el alta de nuevos productos (`addProduct`) como el resurtido de existencias (`restockProduct`). Desde la pestaña de **Inventario** se pueden registrar nuevos productos directamente a través del botón **"Nuevo Producto"**, especificando nombre, categoría, unidad, stock inicial, stock de alerta mínima, costo, precio de venta y color identificador. El stock se actualiza mediante transacciones de Firestore para prevenir sobreescrituras concurrentes y los cambios se reflejan en tiempo real con `onSnapshot()`.

`src/services/salesService.js` procesa cada cobro en una transacción: lee los productos, verifica que existan y que tengan stock suficiente, calcula el precio desde Firestore, descuenta `currentStock` y crea un ticket en `sales` como una sola operación atómica. Las ventas guardan cantidades y precios de cada artículo junto con el canal, el total y una marca de tiempo del servidor.

Las transacciones del SDK web evitan inconsistencias por ventas concurrentes, pero el código cliente no es una frontera de seguridad contra clientes manipulados. Las reglas de Firestore limitan cada cajero a su tienda e impiden modificar o borrar ventas y movimientos, pero no pueden verificar por completo cifras como stock o totales enviadas por un cliente alterado; para eso se requiere un backend autenticado.

## Impresión de tickets

Desde el POS se puede imprimir el ticket después del cobro, o reimprimir cualquier ticket desde el historial. El selector permite ajustar el ancho a impresoras de 58 mm u 80 mm.
