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

4. Configura reglas de Firestore acordes a la autenticación y los permisos que requiera tu negocio antes de publicar la app. Las cuentas locales de usuario y contraseña mantienen su perfil de sesión solo en memoria del navegador, por lo que será necesario volver a iniciar sesión después de recargar la página.
5. Ejecuta `npm install` y luego `npm run dev`.

La pantalla escucha `products` y `sales` en tiempo real. No crea inventario ni tickets de ejemplo; al comienzo, las colecciones deben estar cargadas con los datos reales del local.

## Operaciones de venta e inventario

`src/services/inventoryService.js` gestiona tanto el alta de nuevos productos (`addProduct`) como el resurtido de existencias (`restockProduct`). Desde la pestaña de **Inventario** se pueden registrar nuevos productos directamente a través del botón **"Nuevo Producto"**, especificando nombre, categoría, unidad, stock inicial, stock de alerta mínima, costo, precio de venta y color identificador. El stock se actualiza mediante transacciones de Firestore para prevenir sobreescrituras concurrentes y los cambios se reflejan en tiempo real con `onSnapshot()`.

`src/services/salesService.js` procesa cada cobro en una transacción: lee los productos, verifica que existan y que tengan stock suficiente, calcula el precio desde Firestore, descuenta `currentStock` y crea un ticket en `sales` como una sola operación atómica. Las ventas guardan cantidades y precios de cada artículo junto con el canal, el total y una marca de tiempo del servidor.

Las transacciones del SDK web evitan inconsistencias por ventas concurrentes, pero el código cliente no es una frontera de seguridad contra clientes manipulados. El inicio de sesión local todavía verifica credenciales en el cliente y no constituye autenticación segura para proteger operaciones en Firestore. Las reglas de Firestore deben controlar quién puede leer y escribir; para cobros privilegiados o permisos finos, mueve la operación a un backend autenticado.

## Impresión de tickets

Desde el POS se puede imprimir el ticket después del cobro, o reimprimir cualquier ticket desde el historial. El selector permite ajustar el ancho a impresoras de 58 mm u 80 mm.
