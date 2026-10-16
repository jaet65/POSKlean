# POSKlean 🛒🧪

**POSKlean** es un sistema de Punto de Venta (POS) y gestión de inventario ligero, moderno y eficiente, diseñado para negocios de comercialización de productos (como productos de limpieza, insumos o venta al detalle).

El sistema está desarrollado con **React**, **Vite** y **Firebase** (Firestore, Authentication y Hosting), ofreciendo sincronización en tiempo real, control de caja/turnos, gestión de inventario por volúmenes/unidades e impresión de tickets.

---

## 🚀 Características Principales

* **🛒 Punto de Venta (POS):**
  * Procesamiento de ventas rápidas.
  * Cálculo automático de totales, impuestos y cambio.
  * Formateo de moneda y conversiones de volumen/unidades.
  * Generación e impresión de tickets de compra.

* **💰 Control de Caja y Turnos (`useCashShift`):**
  * Apertura, arqueo y cierre de turnos de caja.
  * Registro de entradas y salidas de dinero.
  * Historial de cortes de caja.

* **📦 Gestión de Inventario:**
  * Control de stock e insumos en tiempo real.
  * Alertas de stock bajo y actualización de precios.

* **👥 Usuarios y Permisos:**
  * Autenticación segura mediante Firebase Auth.
  * Roles de cajeros y administradores.

* **☁️ Integración e Infraestructura:**
  * Sincronización continua con **Firebase Firestore**.
  * Reglas de seguridad avanzadas en Firestore (`firestore.rules`).
  * Despliegue continuo con **GitHub Actions** y **Firebase Hosting**.

---

## 🛠️ Tecnologías Utilizadas

* **Frontend:** [React](https://reactjs.org/), [Vite](https://vitejs.dev/)
* **Backend & BD:** [Firebase Firestore](https://firebase.google.com/docs/firestore)
* **Autenticación:** [Firebase Auth](https://firebase.google.com/docs/auth)
* **Hosting & CI/CD:** Firebase Hosting, GitHub Actions
* **Linter & Code Quality:** Oxlint

---

## 📁 Estructura del Proyecto

```text
POSKlean/
├── .github/workflows/     # Workflows para integración y despliegue continuo (CI/CD)
├── public/                # Archivos estáticos e íconos (favicon, SVG)
├── src/
│   ├── assets/            # Recursos gráficos (imágenes, logos)
│   ├── components/        # Componentes UI reutilizables (PrintTicket, etc.)
│   ├── hooks/             # Custom Hooks (usePOSData, useCashShift)
│   ├── services/          # Servicios para Firestore (sales, inventory, cashShift, etc.)
│   ├── utils/             # Funciones utilitarias (currency, volume)
│   ├── App.jsx            # Componente principal de la aplicación
│   ├── firebase.js        # Configuración e inicialización de SDK Firebase
│   └── main.jsx           # Punto de entrada de React
├── firestore.rules        # Reglas de seguridad para Firestore
├── firebase.json          # Configuración de servicios de Firebase
└── vite.config.js         # Configuración del bundler Vite
```

---

## ⚙️ Requisitos Previos

Asegúrate de contar con lo siguiente instalado en tu entorno local:

* [Node.js](https://nodejs.org/) (versión 18 o superior recomendada)
* `npm` o `yarn`
* Una cuenta en [Firebase Console](https://console.firebase.google.com/) con un proyecto creado.

---

## 💻 Instalación y Configuración Local

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DEL_REPOSOTORIO>
   cd POSKlean
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno / Firebase:**
   Asegúrate de configurar tus credenciales de Firebase en `src/firebase.js` o mediante un archivo `.env.local` según el flujo de trabajo de tu equipo:

   ```javascript
   // src/firebase.js
   const firebaseConfig = {
     apiKey: "TU_API_KEY",
     authDomain: "TU_PROJECT_ID.firebaseapp.com",
     projectId: "TU_PROJECT_ID",
     storageBucket: "TU_PROJECT_ID.appspot.com",
     messagingSenderId: "TU_SENDER_ID",
     appId: "TU_APP_ID"
   };
   ```

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre tu navegador en `http://localhost:5173`.

---

## 🚀 Comandos Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo con Hot Reloading (Vite). |
| `npm run build` | Compila la aplicación para producción en la carpeta `dist`. |
| `npm run preview` | Previsualiza la build de producción localmente. |
| `npm run lint` | Ejecuta el linter (Oxlint) para verificar la calidad del código. |

---

## ☁️ Despliegue

El proyecto cuenta con integración continua mediante **GitHub Actions** en `.github/workflows/`. Cada actualización o Merge a la rama principal desplegará automáticamente los cambios a **Firebase Hosting**.

Para hacer un despliegue manual desde la terminal:

```bash
npm run build
firebase deploy --only hosting
```

---

## 📄 Licencia

Este proyecto es de uso privado / comercial para la gestión de POS. Todos los derechos reservados.

## ☁️ Urls

Produccion
https://posklean.web.app/
Pruebas
https://posklean--pruebas-p66zbkr1.web.app

---