// DOM Elements
const pushToTalkButton = document.getElementById('pushToTalk');
const recordingIndicator = document.getElementById('recordingIndicator');
const visualizer = document.getElementById('visualizer');
const statusText = document.getElementById('status');
let canvas;

// Audio Context and Variables
let audioContext;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let analyser;
let dataArray;
let animationId;

// Convert audio buffer to WAV
function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, 1, true); // num channels (mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample

    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write the PCM samples
    let index = 44;
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(index, samples[i] * 0x7FFF, true);
        index += 2;
    }

    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Convert Blob to Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Upload file to Slack via Netlify function
async function uploadToSlack(audioBlob) {
    try {
        statusText.textContent = 'Uploading to Slack...';
        console.log('Starting upload to Slack');

        // Convert blob to base64
        const base64Audio = await blobToBase64(audioBlob);
        
        const response = await fetch('/.netlify/functions/upload-to-slack', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audio: base64Audio,
                filename: `recording_${Date.now()}.wav`
            })
        });

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Upload failed');
        }

        console.log('Upload successful:', data);
        statusText.textContent = 'Upload successful!';

    } catch (error) {
        console.error('Upload failed:', error);
        statusText.textContent = 'Upload failed: ' + error.message;
    }
}

// Initialize audio context and request microphone permission
async function initializeAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Set up audio analyzer
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Create a processor node for raw audio data
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioContext.destination);

        let audioData = [];
        
        processor.onaudioprocess = (e) => {
            if (isRecording) {
                const inputData = e.inputBuffer.getChannelData(0);
                audioData.push(new Float32Array(inputData));
            }
        };

        // Set up media recorder (as fallback)
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            console.log('Recording stopped');
            
            // Combine all audio data
            let allAudioData = [];
            audioData.forEach(chunk => {
                allAudioData = allAudioData.concat(Array.from(chunk));
            });

            // Create WAV file
            const wavBuffer = encodeWAV(new Float32Array(allAudioData), audioContext.sampleRate);
            const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });
            
            console.log('WAV Blob created:', audioBlob.size, 'bytes');
            
            if (audioBlob.size > 0) {
                await uploadToSlack(audioBlob);
            } else {
                console.error('Recording is empty');
                statusText.textContent = 'Error: Recording is empty';
            }
            
            audioChunks = [];
            audioData = [];
        };

        statusText.textContent = 'Ready to record';
        pushToTalkButton.disabled = false;

    } catch (error) {
        console.error('Error during initialization:', error);
        statusText.textContent = `Error: ${error.message}`;
    }
}

// Visualizer animation
function drawVisualizer() {
    if (!isRecording) {
        cancelAnimationFrame(animationId);
        return;
    }

    animationId = requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);

    canvas.clearRect(0, 0, visualizer.width, visualizer.height);
    const barWidth = (visualizer.width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2;
        canvas.fillStyle = `hsl(${barHeight + 180}, 100%, 50%)`;
        canvas.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

// Event Listeners
pushToTalkButton.addEventListener('mousedown', () => {
    if (!audioContext) {
        initializeAudio();
        return;
    }

    isRecording = true;
    audioChunks = [];
    mediaRecorder.start();
    recordingIndicator.classList.add('recording');
    statusText.textContent = 'Recording...';
    drawVisualizer();
});

pushToTalkButton.addEventListener('mouseup', () => {
    if (isRecording) {
        isRecording = false;
        mediaRecorder.stop();
        recordingIndicator.classList.remove('recording');
        statusText.textContent = 'Processing...';
    }
});

pushToTalkButton.addEventListener('mouseleave', () => {
    if (isRecording) {
        isRecording = false;
        mediaRecorder.stop();
        recordingIndicator.classList.remove('recording');
        statusText.textContent = 'Processing...';
    }
});

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    canvas = visualizer.getContext('2d');
    visualizer.width = visualizer.offsetWidth;
    visualizer.height = visualizer.offsetHeight;
    initializeAudio();
});

// Handle window resize
window.addEventListener('resize', () => {
    visualizer.width = visualizer.offsetWidth;
    visualizer.height = visualizer.offsetHeight;
}); 