# POSKlean 🛒🧪

**POSKlean** es un sistema de Punto de Venta (POS) y gestión de inventario ligero, moderno y eficiente, diseñado para negocios de comercialización de productos e insumos de limpieza y venta al detalle.

La plataforma es **multiplataforma**: funciona como aplicación **Web / PWA**, aplicación de escritorio nativa mediante **Electron** (optimizada para cajas con impresión silenciosa de tickets) y aplicación móvil a través de **Capacitor** (Android / iOS) con autenticación e impresión nativas.

---

## 🚀 Características Principales

* **🛒 Punto de Venta (POS):**
  * Procesamiento de ventas ágil y fluido.
  * Cálculo automático de totales, impuestos y cambio.
  * Soporte para venta por piezas y volumen/granel (Lts, Mililitros).
  * Formateo de moneda y conversiones automáticas.

* **🖨️ Impresión de Tickets Térmicos:**
  * **Modo Web / PWA:** Diálogo de impresión estándar del navegador (`window.print()`).
  * **Modo Escritorio (Electron):** Impresión silenciosa directa a impresoras térmicas sin diálogos emergentes (`print-silent`).
  * **Modo Móvil (Android/Capacitor):** Impresión nativa de recibos térmicos mediante el servicio de impresión de Android (`@capgo/capacitor-printer`).

* **💰 Control de Caja y Turnos (`useCashShift`):**
  * Apertura, arqueo y corte de turnos de caja.
  * Registro clasificado de entradas y salidas de efectivo.
  * Historial auditable de cortes de turno y saldo en caja.

* **📦 Control de Inventario y Multialmacén:**
  * Seguimiento de stock en tiempo real por sucursal / canal.
  * Transferencias entre tiendas/almacenes y módulo de auditorías.
  * Semáforo de stock (saludable, mínimo, crítico) y cálculo de valor de compra/venta.

* **👥 Gestión de Usuarios y Permisos:**
  * Autenticación con Firebase Auth (Usuario/Contraseña y Google Sign-In nativo en Android).
  * Control granular de roles (Administrador, Encargado, Cajero).
  * Sincronización optimizada y no bloqueante de perfiles en Firestore.

* **☁️ Sincronización en la Nube y CI/CD Unificado:**
  * Base de datos en tiempo real con **Firebase Firestore**.
  * Reglas de seguridad declarativas en [firestore.rules](firestore.rules).
  * **Versionado dinámico sincronizado:** Todas las variantes (Web, Windows y Android) comparten exactamente la misma versión del Git Tag.
  * Compilación y publicación automatizada de instaladores `.exe`, `.apk` y despliegue a **Firebase Hosting** mediante **GitHub Actions**.

---

## 🛠️ Tecnologías Utilizadas

* **Núcleo Frontend:** [React 19](https://react.dev/), [Vite](https://vitejs.dev/)
* **Estilos e Iconografía:** [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
* **Backend, Base de Datos y Auth:** [Firebase Firestore](https://firebase.google.com/docs/firestore), [Firebase Auth](https://firebase.google.com/docs/auth)
* **Escritorio:** [Electron](https://www.electronjs.org/) y [electron-builder](https://www.electron.build/) (NSIS para Windows)
* **Móvil:** [Capacitor 8](https://capacitorjs.com/) (Android / iOS), [@capacitor-firebase/authentication](https://github.com/capawesome-team/capacitor-firebase), [@capgo/capacitor-printer](https://github.com/Cap-go/capacitor-printer)
* **CI/CD & Hosting:** GitHub Actions, Firebase Hosting
* **Calidad de Código:** [Oxlint](https://oxc.rs/)

---

## 📁 Estructura del Proyecto

```text
POSKlean/
├── .github/workflows/          # Flujos de CI/CD automatizados
│   ├── firebase-hosting-pruebas.yml  # Despliegue automático a entorno de pruebas (rama pruebas)
│   └── release.yml             # Release unificado: resuelve versión y compila Web, .exe y .apk en paralelo
├── android/                    # Proyecto nativo de Android (Capacitor)
│   ├── debug.keystore          # Almacén de firmas debug unificado (SHA-1 registrado en Firebase)
│   └── app/src/main/res/       # Iconos oficiales POSKlean en todas las densidades (mdpi a xxxhdpi)
├── build/                      # Recursos de compilación para Windows (icon.ico, icon.png)
├── electron/                   # Código de Electron y generadores de assets
│   ├── main.cjs                # Servidor local de producción e IPCs (impresión silenciosa)
│   ├── preload.cjs             # Bridge seguro hacia el frontend (contextBridge)
│   ├── render-icon.cjs         # Renderizador de iconos para Windows (.ico / .png)
│   ├── generate-android-icons.cjs # Generador de iconos Android adaptativos y redondos
│   └── generate-ico.ps1        # Generador de .ico multirresolución para Windows
├── public/                     # Archivos estáticos, manifest PWA y favicon.svg (logo vector oficial)
├── src/
│   ├── assets/                 # Recursos gráficos y multimedia
│   ├── components/             # Componentes modulares (POSCartPanel, PrintTicket, etc.)
│   ├── hooks/                  # Custom Hooks (usePOSData, useCashShift)
│   ├── services/               # Servicios de Firestore (sales, inventory, userService, etc.)
│   ├── utils/                  # Formateadores de moneda, fechas y volúmenes
│   ├── App.jsx                 # Controlador principal de vistas, estado global y barra superior
│   ├── firebase.js             # Inicialización y configuración de Firebase SDK
│   └── main.jsx                # Punto de entrada de React
├── capacitor.config.json       # Configuración global de Capacitor
├── firestore.rules             # Reglas de seguridad de Firestore
├── firebase.json               # Configuración de Firebase Hosting
└── vite.config.js              # Configuración de Vite con inyección de __APP_VERSION__
```

---

## ⚙️ Requisitos Previos

* [Node.js](https://nodejs.org/) (versión 22 LTS recomendada).
* `npm` (incluido con Node.js).
* Para compilar Android localmente: [Android Studio](https://developer.android.com/studio) y **JDK 21** (requerido por Capacitor Android 8).
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

### 2. Aplicación Móvil (Capacitor / Android)
* **Sincronizar cambios web con las plataformas nativas:**
  ```bash
  npm run cap:sync
  ```
* **Abrir en Android Studio:**
  ```bash
  npm run cap:android
  ```
* **Emulación / Depuración en vivo en dispositivo físico:**
  ```bash
  npm run cap:live
  ```
* **Abrir en Xcode (macOS):**
  ```bash
  npm run cap:ios
  ```

### 3. Generación de Iconos Oficiales
* **Windows (Electron):**
  ```bash
  npm run electron:icons
  ```
* **Android (Todas las densidades mdpi a xxxhdpi y adaptativo):**
  ```bash
  npm run android:icons
  ```
* **Ambas plataformas simultáneamente:**
  ```bash
  npm run icons
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
| `npm run electron:icons` | Reconstruye `icon.png` e `icon.ico` vectoriales para Windows. |
| `npm run android:icons` | Genera iconos adaptativos y legacy para Android desde `favicon.svg`. |
| `npm run icons` | Genera los iconos de escritorio y móviles en un solo paso. |
| `npm run cap:sync` | Compila la web y sincroniza con los proyectos Android e iOS. |
| `npm run cap:android` | Sincroniza y abre el proyecto en Android Studio. |
| `npm run cap:live` | Inicia el servidor para depuración en vivo en dispositivos móviles. |
| `npm run cap:ios` | Sincroniza y abre el proyecto en Xcode. |

---

## 🤖 CI/CD y Publicación Automática (GitHub Actions)

El ciclo de publicación se gestiona mediante dos flujos de trabajo automatizados:

### 1. Release Unificado ([release.yml](.github/workflows/release.yml))
Se activa automáticamente al crear un Git Tag con el prefijo `v` (ejemplo: `v0.0.3`) o de forma manual con `workflow_dispatch`:

1. **`get-version`**: Resuelve la versión dinámica a partir del Git Tag (removiendo el prefijo `v`).
2. **Tareas en paralelo**:
   * **`build-electron`**: Sincroniza la versión y genera `POSKlean Setup <version>.exe`.
   * **`build-android`**: Sincroniza `package.json` y `versionName`, firma con `debug.keystore` unificado y genera `POSKlean-Android-v<version>.apk`.
   * **`deploy-hosting`**: Compila la PWA inyectando la versión en el encabezado de la app y publica en Firebase Hosting (`channel: live`).
3. **`publish-release`**: Publica el **GitHub Release** con los instaladores `.exe` y `.apk` adjuntos.

#### ¿Cómo publicar una nueva versión?
```bash
git add .
git commit -m "chore: release v0.0.4"
git tag v0.0.4
git push origin main --tags
```

### 2. Entorno de Pruebas ([firebase-hosting-pruebas.yml](.github/workflows/firebase-hosting-pruebas.yml))
Cada push a la rama `pruebas` compila y despliega automáticamente al canal de pruebas de Firebase Hosting para validaciones previas antes de lanzar un release.

---

## 🌐 Enlaces del Proyecto

* **Producción Web (PWA):** [https://posklean.web.app/](https://posklean.web.app/)
* **Entorno de Pruebas:** [https://posklean--pruebas-p66zbkr1.web.app](https://posklean--pruebas-p66zbkr1.web.app)

---

## 📄 Licencia

Este proyecto es de uso privado y comercial para la operación de puntos de venta y control de inventarios. Todos los derechos reservados.