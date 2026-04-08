# Pan Paraban - Identificador de Toques de Tambor

Pan Paraban es una aplicación web front-end premium inspirada en "Shazam", diseñada específicamente para el mundo de las Cofradías y la Semana Santa. Su objetivo es escuchar, analizar y detectar toques y ritmos tradicionales de tambor a partir de grabaciones precargadas.

## ✨ Características

- **Diseño Premium**: Interfaz moderna, oscura e inmersiva (Neumorfismo/Glassmorphism). Totalmente responsiva y optimizada para uso en móviles y escritorio.
- **Detección por Micrófono**: Solicita permisos y graba en tiempo real (Web Audio API) durante 15 segundos para calcular la huella rítmica.
- **Análisis Matemático**: Crea "firmas temporales" (distancias y energía de los picos rítmicos) detectando inter-intervalos para estimar con porcentajes de confianza la coincidencia contra los pasos base.
- **Carga de Archivos Centralizada**: Archivos pre-procesados y blindados desde `marchas/manifest.json` y carpetas de la organización.

## 📂 Estructura del Proyecto

```text
Pan Paraban/
├── index.html                  # Plantilla semántica principal HTML5
├── css/
│   └── styles.css              # Toda la estructura visual y variables modernizadas
├── js/
│   └── app.js                  # Lógica encapsulada (Web Audio, detección, UI Events)
├── assets/
│   └── pasos/
│       ├── manifest.json       # Manifiesto donde se registran los toques base
│       ├── oracion.mp3         # (Pon aquí tus archivos MP3)
│       └── procesion.mp3       # (Pon aquí tus archivos MP3)
└── README.md                   # Esta documentación
```

## 🚀 Cómo Ejecutarlo

Al utilizar tecnologías puras web (Web Audio API, fetch de archivos, ES Modules), el navegador bloquea ciertas ejecuciones si se abre directamente el archivo HTML con doble clic (CORS y restricciones de seguridad). 
Por lo tanto, **se necesita levantarlo mediante un pequeño servidor local**.

### Si usas Node.js (Recomendado)
1. Abre esta carpeta en la terminal.
2. Ejecuta: `npx serve -s` o `npx http-server`
3. Visita en tu navegador: `http://localhost:3000`

### Si usas Python o VS Code
- **Python 3**: `python -m http.server 8000`
- **VS Code**: Instala la extensión "Live Server" y haz clic derecho en `index.html` > "Open with Live Server".

## 🥁 Carga y Edición de MP3

### 1. Sistema mediante `manifest.json` (Ideal para producción)
Para que los archivos se carguen por defecto en el sistema, debes:
1. Copiar tus archivos `.mp3` dentro de `marchas/`
2. Abrir `manifest.json` y registrar su metadata:
```json
{
  "name": "Nombre visible",
  "file": "nombre_del_archivo.mp3",
  "description": "Una breve descripción del sentido del toque."
}
```

### 2. Uso Exclusivo de Biblioteca Interna
La subida de MP3 o alteraciones manuales han sido restringidas desde la interfaz web frontal para blindar la autenticidad de los toques base utilizados en el proyecto.

## 🔧 Optimización y Mejora de Exactitud
Para mejorar la exactitud en la lectura del ritmo en la calle (mucho ruido ambiental):
- Asegurar que los ficheros base (mp3) son limpios, sin demasiado ruido de fondo que provoque "falsos golpes de energía".
- En `js/app.js`, variable `CONFIG.REF_THRESHOLD` puedes subirla o bajarla para que el límite requerido de RMS para detectar un "golpe de baqueta/maza" sea más contundente o más ligero.
- La duración de escucha normalizada está en 15000 ms (`LISTEN_DURATION_MS`); para toques de procesión que tardan mucho en cerrar su ciclo de compás, igualar esta cifra a la duración de un compás completo mejorará la heurística de distancia de picos.
