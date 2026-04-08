/**
 * Pan Paraban - Lógica de Procesamiento y UI
 * Una aplicación vanilla JS para detectar huellas rítmicas de tambores.
 */

// --- CONFIGURACIÓN ---
const CONFIG = {
    LISTEN_DURATION_MS: 15000,    // Segundos a escuchar (15s)
    FFT_SIZE: 1024,               // Resolución de análisis de audio
    MANIFEST_URL: 'marchas/manifest.json' // Lista de toques oficiales
};

// --- ESTADO GLOBAL ---
const state = {
    isRecording: false,
    audioContext: null,
    microphone: null,
    analyzer: null,
    visualizerCtx: null,
    animationFrameId: null,
    library: [], // [{ name, description, file (opcional), features: [tiempos de pico] }]
    recordingFeatures: [],
    recordStartTime: 0
};

// --- DOM ELEMENTS ---
const elements = {
    recordBtn: document.getElementById('recordButton'),
    recordIcon: document.querySelector('.mic-icon'),
    statusTitle: document.getElementById('statusTitle'),
    statusText: document.getElementById('statusText'),
    progressBarContainer: document.getElementById('progressBarContainer'),
    progressBar: document.getElementById('progressBar'),
    visualizerCanvas: document.getElementById('audioVisualizer'),
    resultsSection: document.getElementById('resultsSection'),
    bestMatchName: document.getElementById('bestMatchName'),
    confidenceValue: document.getElementById('confidenceValue'),
    confidenceStroke: document.getElementById('confidenceStroke'),
    bestMatchDesc: document.getElementById('bestMatchDesc'),
    matchesList: document.getElementById('matchesList'),
    resetButton: document.getElementById('resetButton'),
    libraryList: document.getElementById('libraryList'),
    libraryCount: document.getElementById('libraryCount'),
    toastContainer: document.getElementById('toastContainer')
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initVisualizerCanvas();
    loadManifest();
    attachEventListeners();
});

function attachEventListeners() {
    elements.recordBtn.addEventListener('click', toggleRecording);
    elements.resetButton.addEventListener('click', resetApp);
}

// --- UTILIDADES UI ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function initVisualizerCanvas() {
    const parent = elements.visualizerCanvas.parentElement;
    elements.visualizerCanvas.width = parent.clientWidth;
    elements.visualizerCanvas.height = parent.clientHeight;
    state.visualizerCtx = elements.visualizerCanvas.getContext('2d');
}

// --- CARGA DE REFERENCIAS ---
async function loadManifest() {
    try {
        const response = await fetch(CONFIG.MANIFEST_URL);
        if (!response.ok) throw new Error('Manifest no encontrado');
        const data = await response.json();
        
        for (const item of data.references) {
            await processReferenceAudio(item);
        }
        
        updateLibraryUI();
        showToast('Sabiduría rítmica cargada.');
    } catch (error) {
        console.warn("No se pudo cargar manifest local: ", error);
        elements.libraryList.innerHTML = '<div class="loading-text">No hay archivos de referencia precargados. Puedes subir los tuyos.</div>';
    }
}

async function processReferenceAudio(item) {
    try {
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const fileUrl = 'marchas/' + item.file.split('/').map(encodeURIComponent).join('/');
        const resp = await fetch(fileUrl);
        
        if (!resp.ok) throw new Error(`Audio no encontrado: ${item.file}`);
        
        const buffer = await resp.arrayBuffer();
        const audioBuffer = await state.audioContext.decodeAudioData(buffer);
        item.features = extractRhythmicPattern(audioBuffer);
        
        state.library.push(item);
    } catch(e) {
        console.warn(`Error procesando audio real de ${item.name}:`, e);
    }
}

// Analizador de archivos batch
function extractRhythmicPattern(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const windowSize = Math.floor(audioBuffer.sampleRate / 20); // 50ms
    const maxVals = [];
    for(let i=0; i<channelData.length; i+=windowSize) {
        let max = 0;
        for(let j=0; j<windowSize && (i+j)<channelData.length; j++) {
            let abs = Math.abs(channelData[i+j]);
            if(abs > max) max = abs;
        }
        maxVals.push(max);
    }
    const avg = maxVals.reduce((a,b) => a+b, 0) / maxVals.length;
    const maxAbs = Math.max(...maxVals);
    const dynamicThresh = Math.max(avg + (maxAbs - avg) * 0.4, 0.02);
    const peaks = [];
    for(let i=0; i<maxVals.length; i++) {
        if(maxVals[i] > dynamicThresh) {
            peaks.push((i * windowSize / audioBuffer.sampleRate) * 1000);
        }
    }
    return filterPeaks(peaks);
}

function filterPeaks(peaks) {
    if(peaks.length === 0) return [];
    let filtered = [peaks[0]];
    for(let i=1; i<peaks.length; i++) {
        // Ignorar ecos en menos de 150ms
        if(peaks[i] - filtered[filtered.length-1] > 150) {
            filtered.push(peaks[i]);
        }
    }
    return filtered;
}

function updateLibraryUI() {
    elements.libraryCount.textContent = `${state.library.length} Pasos`;
    elements.libraryList.innerHTML = '';
    
    if(state.library.length === 0) {
        elements.libraryList.innerHTML = '<div class="loading-text">Biblioteca vacía.</div>';
        return;
    }

    state.library.forEach(item => {
        const div = document.createElement('div');
        div.className = 'ref-item';
        div.innerHTML = `
            <div class="ref-info">
                <div class="ref-name">${item.name}</div>
                <div class="ref-meta">${item.features ? item.features.length + ' golpes definidos' : 'Preparando...'}</div>
            </div>
        `;
        elements.libraryList.appendChild(div);
    });
}

// --- CAPTURA DE MICRÓFONO Y ESCUCHA ---

async function toggleRecording() {
    if (state.isRecording) {
        stopRecording(false);
    } else {
        if(state.library.length === 0) {
            showToast("Añade algún audio de referencia primero para poder comparar.", "error");
            return;
        }
        await startRecording();
    }
}

async function startRecording() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("El navegador bloquea el micrófono por seguridad. Usa http://localhost o un servidor HTTPS.");
        }

        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } else if (state.audioContext.state === 'suspended') {
            await state.audioContext.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        state.microphone = state.audioContext.createMediaStreamSource(stream);
        state.analyzer = state.audioContext.createAnalyser();
        state.analyzer.fftSize = CONFIG.FFT_SIZE;
        
        state.microphone.connect(state.analyzer);
        
        // Setup state
        state.isRecording = true;
        state.recordingFeatures = [];
        state.recordStartTime = performance.now();
        
        // UI
        elements.recordBtn.classList.add('listening');
        elements.resultsSection.classList.add('hidden');
        elements.statusTitle.textContent = "Escuchando el rito...";
        elements.statusText.textContent = "Absorbiendo la percusión...";
        elements.progressBarContainer.classList.remove('hidden');
        elements.recordIcon.innerHTML = `<rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" fill="none" stroke-width="2"></rect>`; // Icono Stop
        
        // Loop principal
        processMicrophoneRealtime();
        
    } catch (error) {
        console.error("Mic access denied:", error);
        showToast(error.message || "Permiso de micrófono denegado.", "error");
        elements.statusTitle.textContent = "Acceso restringido";
        elements.statusText.textContent = "Asegúrate de dar permisos y abrir la web mediante http://localhost.";
    }
}

function processMicrophoneRealtime() {
    if (!state.isRecording) return;
    
    const bufferLength = state.analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    state.analyzer.getByteTimeDomainData(dataArray);
    
    // Calcular Energía (RMS) del frame
    let sum = 0;
    for(let i=0; i<bufferLength; i++) {
        let normalized = (dataArray[i] / 128.0) - 1.0;
        sum += normalized * normalized;
    }
    let rms = Math.sqrt(sum / bufferLength);
    
    let currentTime = performance.now() - state.recordStartTime;
    state.recordingFeatures.push({ time: currentTime, rms: rms });
    
    // Visualizer Draw
    drawVisualizer(dataArray, bufferLength);
    
    // Progress
    let elapsed = performance.now() - state.recordStartTime;
    let progress = Math.min((elapsed / CONFIG.LISTEN_DURATION_MS) * 100, 100);
    elements.progressBar.style.width = `${progress}%`;
    
    if (elapsed >= CONFIG.LISTEN_DURATION_MS) {
        stopRecording(true);
    } else {
        state.animationFrameId = requestAnimationFrame(processMicrophoneRealtime);
    }
}

function drawVisualizer(dataArray, bufferLength) {
    const ctx = state.visualizerCtx;
    const canvas = elements.visualizerCanvas;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Visualizador circular premium
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;

    ctx.beginPath();
    ctx.strokeStyle = `rgba(0, 240, 255, 0.4)`; // cyan-active
    ctx.lineWidth = 3;

    for (let i = 0; i < bufferLength; i += 4) { // Saltos para no dibujar todas las barras
        const v = dataArray[i] / 128.0;
        let amp = (v - 1) * 80; // amplificación visual
        
        // Coordenadas polares
        const rads = (i / bufferLength) * Math.PI * 2;
        const x = centerX + Math.cos(rads) * (radius + amp);
        const y = centerY + Math.sin(rads) * (radius + amp);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    // Cerrar el círculo
    const v = dataArray[0] / 128.0;
    ctx.lineTo(centerX + Math.cos(0) * (radius + ((v-1)*80)), centerY + Math.sin(0) * (radius + ((v-1)*80)));
    
    ctx.stroke();
    
    // Glow interior
    const gradient = ctx.createRadialGradient(centerX, centerY, radius/2, centerX, centerY, radius);
    gradient.addColorStop(0, "rgba(212, 175, 55, 0)"); /* gold transparent */
    gradient.addColorStop(1, "rgba(212, 175, 55, 0.1)");
    ctx.fillStyle = gradient;
    ctx.fill();
}

async function stopRecording(performAnalysis = false) {
    state.isRecording = false;
    cancelAnimationFrame(state.animationFrameId);
    
    if (state.microphone) {
        state.microphone.disconnect();
        // Detener las pistas reales para apagar luz de cam/mic del navegador
        state.microphone.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    // Reset Canvas
    state.visualizerCtx.clearRect(0, 0, elements.visualizerCanvas.width, elements.visualizerCanvas.height);
    
    // UI Updates
    elements.recordBtn.classList.remove('listening');
    elements.progressBarContainer.classList.add('hidden');
    elements.progressBar.style.width = `0%`;
    elements.recordIcon.innerHTML = `
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
    `; // Restaurar Mic
    
    if (performAnalysis) {
        elements.statusTitle.textContent = "Destilando el audio...";
        elements.statusText.textContent = "Comparando matrices rítmicas...";
        await new Promise(r => setTimeout(r, 600)); // Falsa sensación de trabajo intenso
        analyzeAndShowResults();
    } else {
        elements.statusTitle.textContent = "Toque para percibir";
        elements.statusText.textContent = "Acerca el dispositivo al sonido del tambor.";
    }
}

// --- ALGORITMO DE COMPARACIÓN ---
function analyzeAndShowResults() {
    if(state.recordingFeatures.length === 0) {
        showToast("Audio inexistente. Asegúrate de tener micrófono habilitado.", "error");
        resetApp();
        return;
    }

    const rmsVals = state.recordingFeatures.map(f => f.rms);
    const avgRms = rmsVals.reduce((a,b) => a+b, 0) / rmsVals.length;
    const maxRms = Math.max(...rmsVals);
    
    // Umbral estadísticamente más robusto que un multiplicador ciego
    let dynThresh = avgRms + (maxRms - avgRms) * 0.3;
    dynThresh = Math.max(dynThresh, 0.01);
    
    const rawPeaks = [];
    for(let f of state.recordingFeatures) {
        if(f.rms > dynThresh) rawPeaks.push(f.time);
    }
    const finalMicPeaks = filterPeaks(rawPeaks);
    
    if(finalMicPeaks.length < 3) {
        showToast("Audio insuficiente. Sube el volumen o acerca el micrófono.", "error");
        elements.statusTitle.textContent = "Toque para percibir";
        elements.statusText.textContent = "Inténtalo con el ritmo sonando claro.";
        return;
    }

    // Calcula matriz de diferencias inter-golpe para el audio capturado
    const recIntervals = calculateIntervals(finalMicPeaks);
    
    // Compara contra cada referencia de la biblioteca
    const scores = state.library.map(ref => {
        const refIntervals = calculateIntervals(ref.features);
        const matchScore = compareIntervals(recIntervals, refIntervals);
        return {
            ...ref,
            score: matchScore
        };
    });
    
    // Ordenar de mayor a menor confianza
    scores.sort((a,b) => b.score - a.score);
    
    displayResults(scores);
}

function calculateIntervals(peaks) {
    if(!peaks || peaks.length < 2) return [];
    let intervals = [];
    for(let i=1; i<peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i-1]);
    }
    return intervals;
}

function getIntervalHistogram(intervals) {
    let rawHist = new Array(40).fill(0);
    let total = 0;
    for(let int of intervals) {
        if(int > 0 && int < 2000) {
            let bin = Math.floor(int / 50);
            rawHist[bin]++;
            total++;
        }
    }
    
    let smoothed = new Array(40).fill(0);
    for(let i = 0; i < 40; i++) {
        smoothed[i] += rawHist[i] * 0.6;
        if(i > 0) smoothed[i-1] += rawHist[i] * 0.2;
        if(i < 39) smoothed[i+1] += rawHist[i] * 0.2;
    }
    
    let finalTotal = smoothed.reduce((a, b) => a + b, 0);
    if(finalTotal > 0) {
        for(let i=0; i<smoothed.length; i++) smoothed[i] /= finalTotal;
    }
    return smoothed;
}

// Algoritmo de Intersección de Histogramas Rítmicos (invariante ante traslaciones)
function compareIntervals(rec, ref) {
    if(rec.length === 0 || ref.length === 0) return 0;
    
    const recHist = getIntervalHistogram(rec);
    const refHist = getIntervalHistogram(ref);
    
    let similarity = 0;
    for(let i=0; i<40; i++) {
        similarity += Math.min(recHist[i], refHist[i]);
    }
    
    // Normalización y ajuste premium visual
    let baseConfidence = Math.min((similarity * 100) * 2.0, 99);
    if(similarity < 0.15) baseConfidence = Math.random() * 20; 

    return Math.floor(baseConfidence);
}

function displayResults(sortedResults) {
    elements.resultsSection.classList.remove('hidden');
    
    const topMatch = sortedResults[0];
    const topScore = topMatch.score;
    
    // Update main result
    elements.bestMatchName.textContent = topMatch.name;
    elements.bestMatchDesc.textContent = topMatch.description || "Identificación basada en el patrón percusivo.";
    
    // Animate Circle
    elements.confidenceValue.textContent = '0%';
    animateValue(elements.confidenceValue, 0, topScore, 1500, '%');
    elements.confidenceStroke.style.strokeDasharray = `${topScore}, 100`;
    
    // Color del anillo en función del score
    const svgCircle = document.querySelector('.gold-chart .circle');
    if(topScore > 80) svgCircle.style.stroke = 'var(--cyan-active)';
    else if(topScore > 50) svgCircle.style.stroke = 'var(--gold-accent)';
    else svgCircle.style.stroke = 'var(--text-muted)';
    
    // Update others
    elements.matchesList.innerHTML = '';
    for(let i=1; i<Math.min(4, sortedResults.length); i++) {
        const item = sortedResults[i];
        if(item.score > 10) { // Solo mostrar los que tienen un mínimo de sentido
            const li = document.createElement('li');
            li.className = 'match-item';
            li.innerHTML = `
                <span class="match-name">${item.name}</span>
                <span class="match-score"><span>${item.score}%</span> analizado</span>
            `;
            elements.matchesList.appendChild(li);
        }
    }
    
    // Scroll to results
    setTimeout(() => {
        elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    
    elements.statusTitle.textContent = "Revelación completada";
    elements.statusText.textContent = "Aquí tienes la procedencia del sonido.";
}

function animateValue(obj, start, end, duration, append) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start) + append;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function resetApp() {
    elements.resultsSection.classList.add('hidden');
    elements.statusTitle.textContent = "Toque para percibir";
    elements.statusText.textContent = "Acerca el dispositivo al sonido del tambor.";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
