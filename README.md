# TamborID

TamborID es una aplicación web especializada en la detección y reconocimiento acústico de marchas y toques de tambor típicos de la Semana Santa. Su filosofía toma inspiración en sistemas como "Shazam", ofreciendo una experiencia inmersiva, de estética oscura y solemne (Glassmorphism, colores litúrgicos) para identificar patrones percusivos al vuelo usando tu micrófono.

## Características

- 🎙️ **Captura Web Audio API**: Captura audio directamente desde el micrófono del navegador sin requerir descargas adicionales.
- 🥁 **Análisis y Detección Local**: Analiza energía RMS, detecta *onsets* y extrae histogramas rítmicos puramente con JavaScript en el frontend. Toda la privacidad se mantiene (el audio no viaja a ningún servidor externo).
- ✨ **Diseño Premium**: Interfaz fluida, animaciones inmersivas y *Glassmorphism* que le da un toque institucional e impactante.
- 📂 **Biblioteca Dinámica**: Carga referencias de audio Mp3 ya sea de forma automática por `manifest.json` o manualmente arrastrando archivos.

## Estructura del Proyecto

El proyecto está diseñado exclusivamente en Frontend (HTML, CSS, JS puro):

```text
TamborID/
│
├── index.html                   # Interfaz de usuario y layout
├── styles.css                   # Diseño visual (Dark theme ceremonial)
├── app.js                       # Lógica principal, estados y algoritmia de audio
│
├── assets/
│   └── pasos/
│       ├── manifest.json        # Archivo que indexa las marchas a cargar inicialmente
│       ├── (tus_audios_aqui.mp3)# Deja aquí tus audios de referencia
│       └── ...
│
└── README.md                    # Esta documentación
```

## Instrucciones de Instalación y Uso

Dado que el navegador impide la lectura de archivos locales y el acceso al micrófono directamente abriendo el archivo `file:///index.html` por motivos de seguridad CORS y políticas de permisos, **es obligatorio servir este directorio a través de un servidor web local**.

### 1. Levantar servidor local

Si tienes Python instalado, es la manera más rápida. Abre una terminal en la carpeta principal `TamborID/` y ejecuta:

**Python 3:**
```bash
python -m http.server 8000
```
*(Si usas Node.js, puedes usar `npx serve` ó `npx http-server`)*

### 2. Abrir en el navegador

Ve a tu navegador y abre `http://localhost:8000`

### 3. Cargar Base de Datos (Audios Mp3)

**Forma A (Automática):**
Abre el archivo `assets/pasos/manifest.json`. Añade ahí el nombre y la ruta del archivo para las marchas de referencia. Coloca luego los archivos `.mp3` correspondientes en esa misma carpeta. El sistema se encargará de parsearlos al cargar la web.

**Forma B (Manual / Drag&Drop):**
Arrastra tus archivos de tambor `.mp3` desde tu PC hasta el recuadro inferior "Biblioteca de Referencias" directamente en la web. El sistema extraerá al instante sus características rítmicas guardándolos en la memoria de la sesión actual.

### 4. Detectar toques

Una vez que el recuadro inferior muestre que hay "X toques en memoria", pulsa el botón central (Micrófono).
La app escuchará por ~6 segundos. Haz sonar un audio fuerte o toca el tambor. El algoritmo comparará la entrada con tu catálogo de referencia y devolverá las mejores coincidencias con un grado de certeza.

## Recomendaciones para una alta precisión

- **Caliad de la librería:** Los `.mp3` de referencia deben estar recortados a la parte principal y cíclica del toque (evitar introducciones largas).
- **Ruido:** Aunque el algoritmo emplea filtrado dinámico en base al volumen global (RMS) de la captura en vivo, evita ruido blanco constante o golpes erráticos que desdibujen el espacio rítmico.
- **Limitaciones de JS puro:** Este es un modelo conceptual y determinista que compara densidades e hitos de tiempo (histogramas de frecuencia percusiva). Para escenarios hiper-ruidosos requeriría implementar Transformadas de Fourier rápidas o IA embebida (p. ej. `TensorFlow.js`), pero el algoritmo actual responde eficazmente en comparaciones estructuradas localmente.
