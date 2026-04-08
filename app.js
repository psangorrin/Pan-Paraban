/**
 * TamborID - Lógica Principal
 * Maneja la interfaz de usuario, captura de audio (Web Audio API),
 * procesamiento de señales y comparación de patrones rítmicos.
 */

const AppState = {
    IDLE: 'idle',
    LISTENING: 'listening',
    PROCESSING: 'processing',
    RESULT: 'result'
};

let currentState = AppState.IDLE;
let audioContext;
let analyser;
let microphone;
let mediaRecorder;
let audioChunks = [];
let animationId;
let recordingTimeout;
const RECORD_DURATION = 6000; // 6 segundos de escucha

// Base de datos local de huellas acústicas de las marchas
const library = new Map(); 

// Elementos del DOM
const el = {
    card: document.getElementById('main-card'),
    radar: document.getElementById('radar-container'),
    recordBtn: document.getElementById('record-btn'),
    statusText: document.getElementById('status-text'),
    statusSubtext: document.getElementById('status-subtext'),
    visualizer: document.getElementById('audio-visualizer'),
    resultsPanel: document.getElementById('results-panel'),
    matchName: document.getElementById('match-name'),
    matchDesc: document.getElementById('match-desc'),
    confidenceCircle: document.getElementById('confidence-circle'),
    confidenceText: document.getElementById('confidence-text'),
    matchesList: document.getElementById('matches-list'),
    resetBtn: document.getElementById('reset-btn'),
    libIndicator: document.getElementById('lib-indicator'),
    libStatusText: document.getElementById('lib-status-text'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    refList: document.getElementById('reference-list')
};

const canvasCtx = el.visualizer.getContext('2d');

// ====== INICIALIZACIÓN ======

document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadManifest();
});

function initEvents() {
    el.recordBtn.addEventListener('click', toggleListening);
    el.resetBtn.addEventListener('click', resetApp);

    // Drag and Drop para audios locales
    el.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.dropZone.classList.add('dragover');
    });
    el.dropZone.addEventListener('dragleave', () => {
        el.dropZone.classList.remove('dragover');
    });
    el.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    el.fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

// ====== LIBRERÍA DE REFERENCIAS ======

async function loadManifest() {
    try {
        const response = await fetch('assets/pasos/manifest.json');
        if (!response.ok) throw new Error('Manifest no encontrado');
        
        const data = await response.json();
        el.libStatusText.textContent = `Cargando ${data.references.length} referencias...`;
        
        for (const ref of data.references) {
            await loadReferenceAudio(ref.name, `assets/pasos/${ref.file}`);
        }
        updateLibraryUI();
    } catch (e) {
        console.warn("No se pudo cargar el manifest.json autómaticamente.", e);
        el.libStatusText.textContent = "Biblioteca vacía. Añade MP3 manualmente.";
    }
}

async function loadReferenceAudio(name, urlOrFile) {
    initAudioContext();
    try {
        let arrayBuffer;
        if (typeof urlOrFile === 'string') {
            const resp = await fetch(urlOrFile);
            arrayBuffer = await resp.arrayBuffer();
        } else {
            arrayBuffer = await urlOrFile.arrayBuffer();
        }
        
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const features = extractAudioFeatures(audioBuffer);
        
        library.set(name, features);
        console.log(`Cargado: ${name}`, features);
    } catch (err) {
        console.error(`Error procesando ${name}:`, err);
    }
}

function handleFiles(files) {
    el.libStatusText.textContent = "Procesando archivos locales...";
    Array.from(files).forEach(async (file) => {
        const name = file.name.replace(/\.[^/.]+$/, ""); // Quitar extension
        await loadReferenceAudio(name, file);
        updateLibraryUI();
    });
}

function updateLibraryUI() {
    el.refList.innerHTML = '';
    if (library.size > 0) {
        el.libIndicator.classList.add('loaded');
        el.libStatusText.textContent = `${library.size} toques en memoria`;
        library.forEach((_, key) => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="ph ph-waveform"></i> ${key}`;
            el.refList.appendChild(li);
        });
    }
}

// ====== FLUJO PRINCIPAL DE ESCUCHA ======

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

async function toggleListening() {
    if (currentState === AppState.IDLE) {
        startListening();
    } else if (currentState === AppState.LISTENING) {
        stopListening();
    }
}

async function startListening() {
    if (library.size === 0) {
        alert("Por favor, carga primero audios de referencia en la biblioteca.");
        return;
    }

    try {
        initAudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        // Cambio de estado UI
        setState(AppState.LISTENING);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        // Visualización
        visualizeAudio();
        
        // Grabación para algoritmo local
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        
        mediaRecorder.onstop = processRecordedAudio;
        mediaRecorder.start();
        
        // Auto-stop después de x segundos
        clearTimeout(recordingTimeout);
        recordingTimeout = setTimeout(() => {
            if (currentState === AppState.LISTENING) stopListening();
        }, RECORD_DURATION);
        
    } catch (err) {
        console.error("Error al acceder al micrófono:", err);
        alert("No se pudo acceder al micrófono. Verifica los permisos del navegador.");
        resetApp();
    }
}

function stopListening() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        if (microphone) microphone.disconnect();
        cancelAnimationFrame(animationId);
        setState(AppState.PROCESSING);
    }
}

async function processRecordedAudio() {
    try {
        // Convertir chunks a Buffer asíncrono
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Extraer características (nuestra magia de análisis)
        const recordedFeatures = extractAudioFeatures(audioBuffer);
        
        // Comparar con la librería
        const results = findMatches(recordedFeatures);
        
        // Mostrar los resultados
        showResults(results);
        
    } catch (err) {
        console.error("Error procesando la grabación:", err);
        el.statusText.textContent = "Error en el análisis";
        el.statusSubtext.textContent = "El audio capturado no pudo ser procesado.";
        setTimeout(resetApp, 3000);
    }
}

// ====== ALGORITMOS DE SEÑAL Y PATRONES ======

/**
 * Analiza un buffer de audio y extrae características rítmicas simplificadas
 * Adecuadas para detectar patrones de percusión de tambor y bombo.
 */
function extractAudioFeatures(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0); // Tomar canal mono
    const sampleRate = audioBuffer.sampleRate;
    
    // 1. Calcular Energía RMS global
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
        sumSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSquares / channelData.length);
    
    // 2. Detección de Onsets (Golpes/Picos)
    // Usamos una ventana de 50ms para suavizar la envolvente
    const windowSize = Math.floor(sampleRate * 0.05); 
    let peaks = [];
    
    // Umbral adaptado empíricamente a tambores de semana santa (ruidosos pero percusivos)
    // Requiere un umbral alto relativo al RMS.
    let threshold = rms * 2.5; 
    if (threshold < 0.05) threshold = 0.05; // Noise floor minimal
    
    for (let i = 0; i < channelData.length; i += windowSize) {
        let maxInWindow = 0;
        for (let j = 0; j < windowSize && (i + j) < channelData.length; j++) {
            let val = Math.abs(channelData[i + j]);
            if (val > maxInWindow) maxInWindow = val;
        }
        
        if (maxInWindow > threshold) {
            // Debounce: evitar multiples picos del mismo golpe (100ms debounce)
            if (peaks.length === 0 || (i - peaks[peaks.length - 1]) > sampleRate * 0.1) {
                peaks.push(i);
            }
        }
    }
    
    // 3. Extraer el perfil de intervalos temporales entre golpes (rítmo)
    let intervals = [];
    for (let i = 1; i < peaks.length; i++) {
        intervals.push((peaks[i] - peaks[i - 1]) / sampleRate); // en segundos
    }
    
    // 4. Crear Histograma Rítmico (Distribución de intervalos)
    // 10 Bins cubriendo intervalos desde 0.1s a 2.0s
    let histogram = new Array(10).fill(0);
    intervals.forEach(inv => {
        // Mapear invervalo a un bin de 0 a 9 (ej: 0.1s - 2.0s)
        let index = Math.floor((inv - 0.1) / ((2.0 - 0.1) / 10));
        index = Math.max(0, Math.min(9, index));
        histogram[index]++;
    });
    
    // Normalizar histograma
    const totalIntervals = intervals.length || 1;
    const normalizedHist = histogram.map(count => count / totalIntervals);
    
    return {
        duration: audioBuffer.duration,
        rms: rms,
        peakDensity: peaks.length / audioBuffer.duration,
        rhythmProfile: normalizedHist
    };
}

/**
 * Compara las características grabadas con todos los audios de la biblioteca
 * Retorna array ordenado de coincidencias.
 */
function findMatches(targetFeatures) {
    let scores = [];
    
    library.forEach((refFeatures, name) => {
        // 1. Comparación de perfiles rítmicos (Distancia Euclidiana)
        let histDist = 0;
        for (let i = 0; i < 10; i++) {
            histDist += Math.pow(targetFeatures.rhythmProfile[i] - refFeatures.rhythmProfile[i], 2);
        }
        histDist = Math.sqrt(histDist);
        
        // 2. Comparación de densidad de golpes (tempo relativo)
        let densRatio = Math.min(targetFeatures.peakDensity, refFeatures.peakDensity) / 
                        Math.max(targetFeatures.peakDensity, refFeatures.peakDensity, 0.001);
        let densDist = 1 - densRatio; // 0 significa igual densidad
        
        // Combinación ponderada (70% ritmo, 30% tempo/densidad)
        let totalError = (histDist * 0.7) + (densDist * 0.3);
        
        // Convertir error a porcentaje de confianza (100% es idéntico)
        // Escalado empírico para que errores típicos den porcentajes realistas
        let confidence = Math.max(0, 100 - (totalError * 150)); 
        
        scores.push({
            name: name,
            confidence: confidence
        });
    });
    
    // Ordenar de mayor a menor confianza
    return scores.sort((a, b) => b.confidence - a.confidence);
}


// ====== INTERFAZ Y VISUALES ======

function visualizeAudio() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = el.visualizer;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 80;

    function draw() {
        if (currentState !== AppState.LISTENING) return;
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.clearRect(0, 0, width, height);
        
        // Dibujar barras radiales alrededor del botón
        const bars = 64;
        const step = Math.PI * 2 / bars;
        
        for (let i = 0; i < bars; i++) {
            // Suavizado del valor
            const value = dataArray[i * 2] / 255;
            const barHeight = value * 60; // Max altura de ola
            
            const angle = i * step;
            const x1 = centerX + Math.cos(angle) * (radius);
            const y1 = centerY + Math.sin(angle) * (radius);
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);

            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.lineWidth = 3;
            canvasCtx.strokeStyle = `rgba(203, 161, 53, ${0.3 + value})`; // Dorados
            canvasCtx.stroke();
        }
    }
    draw();
}

function setState(state) {
    currentState = state;
    el.card.className = `glass-card ${state}`;
    
    switch (state) {
        case AppState.IDLE:
            el.statusText.textContent = "Listo para escuchar";
            el.statusSubtext.textContent = "Pulsa el botón cuando empiece a sonar el tambor";
            el.recordBtn.innerHTML = '<i class="ph-fill ph-microphone"></i>';
            el.radar.classList.remove('hidden');
            el.resultsPanel.classList.add('hidden');
            canvasCtx.clearRect(0, 0, el.visualizer.width, el.visualizer.height);
            break;
            
        case AppState.LISTENING:
            el.statusText.textContent = "Escuchando toque...";
            el.statusSubtext.textContent = "Analizando ecos y silencios (quedan pocos segundos)";
            el.recordBtn.innerHTML = '<i class="ph-fill ph-stop"></i>';
            break;
            
        case AppState.PROCESSING:
            el.statusText.textContent = "Desentrañando patrón...";
            el.statusSubtext.textContent = "Comparando intervalos con la biblioteca local";
            el.recordBtn.innerHTML = '<i class="ph ph-spinner-gap"></i>';
            break;
            
        case AppState.RESULT:
            el.radar.classList.add('hidden');
            el.resultsPanel.classList.remove('hidden');
            el.statusText.textContent = "Análisis completado";
            el.statusSubtext.textContent = "Estos son los resultados más probables";
            break;
    }
}

function showResults(results) {
    setState(AppState.RESULT);
    
    if (results.length === 0 || results[0].confidence < 15) {
        // Fallo o demasiado ruido
        el.matchName.textContent = "Falta de Claridad";
        el.matchDesc.textContent = "Mucho ruido o ritmo no reconocido en el catálogo.";
        animateCircle(0, false);
        el.matchesList.innerHTML = '<li>Ruido de fondo <span class="match-val">--</span></li>';
        return;
    }
    
    const best = results[0];
    el.matchName.textContent = best.name;
    
    // Subtextos contextuales
    const conf = best.confidence;
    if (conf > 80) el.matchDesc.textContent = "Coincidencia casi exacta. Toque inconfundible.";
    else if (conf > 50) el.matchDesc.textContent = "Patrón rítmico altamente similar.";
    else el.matchDesc.textContent = "Existen dudas razonables debido a variaciones rítmicas.";

    // Animar porcentaje central
    animateCircle(conf, conf > 60);

    // Listar top 3 adicionales
    el.matchesList.innerHTML = '';
    const others = results.slice(1, 4);
    others.forEach(res => {
        const li = document.createElement('li');
        li.innerHTML = `${res.name} <span class="match-val">${res.confidence.toFixed(1)}%</span>`;
        el.matchesList.appendChild(li);
    });
}

function animateCircle(percentage, isHighConfidence) {
    // Configurar color de Stroke vía clase CSS
    const svgChart = document.querySelector('.circular-chart');
    svgChart.className = `circular-chart ${isHighConfidence ? 'gold' : 'cyan'}`;
    
    setTimeout(() => {
        el.confidenceCircle.setAttribute('stroke-dasharray', `${percentage}, 100`);
    }, 100); // Pequeño retardo para forzar repintado y transición css

    // Animar texto Numérico
    let current = 0;
    const end = Math.floor(percentage);
    const interval = setInterval(() => {
        if (current >= end) {
            clearInterval(interval);
            el.confidenceText.textContent = end + "%";
            return;
        }
        current += 2;
        el.confidenceText.textContent = Math.min(current, end) + "%";
    }, 30);
}

function resetApp() {
    setState(AppState.IDLE);
    el.confidenceCircle.setAttribute('stroke-dasharray', '0, 100');
    el.confidenceText.textContent = "0%";
}
