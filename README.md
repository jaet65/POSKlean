# POSKlean 🛒🧪

**POSKlean** es un sistema de Punto de Venta (POS) y gestión de inventario ligero, moderno y eficiente, diseñado para negocios de comercialización de productos e insumos de limpieza y venta al detalle.

La plataforma es **multiplataforma**: funciona como aplicación **Web / PWA**, aplicación de escritorio nativa mediante **Electron** (optimizada para cajas con impresión silenciosa de tickets) y aplicación móvil a través de **Capacitor** (Android / iOS).

---

## 🚀 Características Principales

* **🛒 Punto de Venta (POS):**
  * Procesamiento de ventas ágil y fluido.
  * Cálculo automático de totales, impuestos y cambio.
  * Soporte para venta por piezas y volumen/granel (Lts, Mililitros).
  * Formateo de moneda y conversiones automáticas.

* **🖨️ Impresión de Tickets Térmicos:**
  * **Modo Web / PWA:** Diálogo de impresión estándar del navegador (`window.print()`).
  * **Modo Escritorio (Electron):** Soporte para **impresión silenciosa directa** a impresoras térmicas de tickets sin abrir ventanas de confirmación, agilizando la operación de caja.

* **💰 Control de Caja y Turnos (`useCashShift`):**
  * Apertura, arqueo y corte de turnos de caja.
  * Registro clasificado de entradas y salidas de efectivo.
  * Historial auditable de cortes de turno y saldo en caja.

* **📦 Control de Inventario y Multialmacén:**
  * Seguimiento de stock en tiempo real por sucursal / canal.
  * Transferencias entre tiendas/almacenes y módulo de auditorías.
  * Semáforo de stock (saludable, mínimo, crítico) y cálculo de valor de compra/venta.

* **👥 Gestión de Usuarios y Permisos:**
  * Autenticación con Firebase Auth (Correo/Contraseña y Google Sign-In).
  * Control granular de roles (Administrador, Encargado, Cajero).

* **☁️ Sincronización en la Nube y CI/CD:**
  * Base de datos en tiempo real con **Firebase Firestore**.
  * Reglas de seguridad declarativas en [firestore.rules](file:///d:/Proyectos/POSKlean/firestore.rules).
  * Despliegue web automatizado a **Firebase Hosting**.
  * Compilación y publicación automatizada de instaladores `.exe` y `.apk` mediante **GitHub Actions**.

---

## 🛠️ Tecnologías Utilizadas

* **Núcleo Frontend:** [React 19](https://react.dev/), [Vite](https://vitejs.dev/)
* **Estilos e Iconografía:** [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
* **Backend, Base de Datos y Auth:** [Firebase Firestore](https://firebase.google.com/docs/firestore), [Firebase Auth](https://firebase.google.com/docs/auth)
* **Escritorio:** [Electron](https://www.electronjs.org/) y [electron-builder](https://www.electron.build/) (NSIS para Windows)
* **Móvil:** [Capacitor](https://capacitorjs.com/) (Android / iOS)
* **CI/CD & Hosting:** GitHub Actions, Firebase Hosting
* **Calidad de Código:** [Oxlint](https://oxc.rs/)

---

## 📁 Estructura del Proyecto

```text
POSKlean/
├── .github/workflows/          # Flujos de CI/CD (Hosting y compilación de Releases)
│   ├── firebase-hosting-merge.yml
│   └── release.yml             # Compilación automática de .exe y .apk
├── android/                    # Proyecto nativo de Android (Capacitor)
├── build/                      # Recursos de compilación nativos (icon.ico, icon.png)
├── electron/                   # Código del proceso principal de Electron
│   ├── main.cjs                # Servidor local de producción e IPCs (print-silent)
│   ├── preload.cjs             # Bridge seguro hacia el frontend (contextBridge)
│   ├── render-icon.cjs         # Renderizador vectorial de iconos con Chromium
│   └── generate-ico.ps1        # Generador de .ico multirresolución para Windows
├── public/                     # Archivos estáticos, manifest PWA y favicon.svg
├── src/
│   ├── assets/                 # Recursos gráficos y multimedia
│   ├── components/             # Componentes modulares (POSCartPanel, PrintTicket, etc.)
│   ├── hooks/                  # Custom Hooks (usePOSData, useCashShift)
│   ├── services/               # Servicios de Firestore (sales, inventory, transfer, etc.)
│   ├── utils/                  # Formateadores de moneda, fechas y volúmenes
│   ├── App.jsx                 # Controlador principal de vistas y estado global
│   ├── firebase.js             # Configuración e inicialización del SDK de Firebase
│   └── main.jsx                # Punto de entrada de React
├── capacitor.config.json       # Configuración global de Capacitor
├── firestore.rules             # Reglas de seguridad de Firestore
├── firebase.json               # Configuración de Firebase Hosting
└── vite.config.js              # Configuración del empaquetador Vite
```

---

## ⚙️ Requisitos Previos

* [Node.js](https://nodejs.org/) (versión 20 LTS recomendada).
* `npm` (incluido con Node.js).
* Para compilar Android localmente: [Android Studio](https://developer.android.com/studio) y JDK 17 o superior.
* Proyecto activo en [Firebase Console](https://console.firebase.google.com/).

---

## 💻 Instalación y Configuración Local

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd POSKlean
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   Crea un archivo `.env.local` en la raíz con tus credenciales de Firebase:
   ```env
   VITE_FIREBASE_API_KEY=tu_api_key
   VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.web.app
   VITE_FIREBASE_PROJECT_ID=tu_proyecto
   VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
   VITE_FIREBASE_APP_ID=tu_app_id
   ```

4. **Iniciar en modo desarrollo Web:**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:5173](http://localhost:5173).

---

## 🖥️ Ejecución y Compilación Multiplataforma

### 1. Aplicación de Escritorio (Electron)
* **Desarrollo:** Inicia Electron conectado al servidor de desarrollo de Vite:
  ```bash
  npm run electron:dev
  ```
* **Prueba de Producción:** Compila la app y la corre en Electron sirviéndola desde un servidor local seguro:
  ```bash
  npm run electron:start
  ```
* **Generar Instalador de Windows (`.exe`):**
  ```bash
  npm run electron:build
  ```
  El instalador NSIS se generará en la carpeta `dist/`.

* **Regenerar Iconos:**
  ```bash
  npm run electron:icons
  ```
  Renderiza automáticamente `build/icon.png` y `build/icon.ico` a partir de `public/favicon.svg`.

### 2. Aplicación Móvil (Capacitor)
* **Sincronizar cambios web con las plataformas nativas:**
  ```bash
  npm run cap:sync
  ```
* **Abrir en Android Studio:**
  ```bash
  npm run cap:android
  ```
* **Abrir en Xcode (macOS):**
  ```bash
  npm run cap:ios
  ```

---

## 📜 Comandos Disponibles en `package.json`

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo web con Hot Reloading (Vite). |
| `npm run build` | Compila los assets web para producción en `dist/`. |
| `npm run preview` | Previsualiza localmente el paquete web compilado. |
| `npm run lint` | Analiza el código fuente con Oxlint. |
| `npm run electron:dev` | Ejecuta la app en Electron enlazada a `localhost:5173`. |
| `npm run electron:start` | Compila y ejecuta la versión empaquetada de Electron localmente. |
| `npm run electron:build` | Genera el instalador de Windows nativo (`.exe` NSIS). |
| `npm run electron:icons` | Reconstruye `icon.png` e `icon.ico` con proporciones vectoriales cuadradas. |
| `npm run cap:sync` | Compila la web y sincroniza con los proyectos Android e iOS. |
| `npm run cap:android` | Sincroniza y abre el proyecto en Android Studio. |
| `npm run cap:ios` | Sincroniza y abre el proyecto en Xcode. |

---

## 🤖 CI/CD y Publicación Automática (GitHub Actions)

El repositorio incluye dos flujos de trabajo automatizados:

1. **Despliegue Web Continuo ([firebase-hosting-merge.yml](file:///d:/Proyectos/POSKlean/.github/workflows/firebase-hosting-merge.yml)):**
   * Cada push o merge a la rama `main` compila y despliega automáticamente la versión web a Firebase Hosting.

2. **Compilación de Instaladores y Releases ([release.yml](file:///d:/Proyectos/POSKlean/.github/workflows/release.yml)):**
   * Se activa al crear un Tag (ejemplo: `v1.0.0`) o de forma manual desde la pestaña **Actions** en GitHub.
   * Compila el instalador de Windows (`.exe`) en un runner Windows.
   * Compila el APK de Android (`.apk`) en un runner Linux con JDK 17 y Gradle.
   * Publica automáticamente una **GitHub Release** con ambos archivos listos para descarga.

|  `git tag v1.0.1` |
| `git push origin v1.0.1` |



---

## 🌐 Enlaces del Proyecto

* **Producción Web:** [https://posklean.web.app/](https://posklean.web.app/)
* **Entorno de Pruebas:** [https://posklean--pruebas-p66zbkr1.web.app](https://posklean--pruebas-p66zbkr1.web.app)

---

## 📄 Licencia

Este proyecto es de uso privado y comercial para la operación de puntos de venta y control de inventarios. Todos los derechos reservados.