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
                filename: `recording_${Date.now()}.webm`
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

        // Set up media recorder
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            console.log('Recording stopped');
            const audioBlob = new Blob(audioChunks, { 
                type: 'audio/webm;codecs=opus' 
            });
            console.log('Blob created:', audioBlob.size, 'bytes');
            
            if (audioBlob.size > 0) {
                await uploadToSlack(audioBlob);
            } else {
                console.error('Recording is empty');
                statusText.textContent = 'Error: Recording is empty';
            }
            
            audioChunks = [];
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
        // Reset visualization
        canvas.clearRect(0, 0, visualizer.width, visualizer.height);
        const centerY = visualizer.height / 2;
        canvas.beginPath();
        canvas.moveTo(0, centerY);
        canvas.lineTo(visualizer.width, centerY);
        canvas.strokeStyle = '#b3ff00';
        canvas.lineWidth = 2;
        canvas.stroke();
        return;
    }

    animationId = requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);

    canvas.clearRect(0, 0, visualizer.width, visualizer.height);
    
    const centerY = visualizer.height / 2;
    const points = [];
    
    // Calculate points for the waveform
    for (let i = 0; i < dataArray.length; i++) {
        const x = (i / dataArray.length) * visualizer.width;
        const amplitude = (dataArray[i] / 255) * (visualizer.height / 2);
        points.push({
            x: x,
            y: centerY + amplitude * Math.sin(i * 0.2 + Date.now() * 0.005)
        });
    }

    // Draw the waveform
    canvas.beginPath();
    canvas.moveTo(0, centerY);
    
    // Draw the line through all points
    for (let i = 0; i < points.length; i++) {
        if (i === 0) {
            canvas.moveTo(points[i].x, points[i].y);
        } else {
            const xc = (points[i].x + points[i - 1].x) / 2;
            const yc = (points[i].y + points[i - 1].y) / 2;
            canvas.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
        }
    }

    // Style the line
    canvas.strokeStyle = '#b3ff00';
    canvas.lineWidth = 2;
    canvas.stroke();
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
    
    // Draw initial state
    canvas.clearRect(0, 0, visualizer.width, visualizer.height);
    const centerY = visualizer.height / 2;
    canvas.beginPath();
    canvas.moveTo(0, centerY);
    canvas.lineTo(visualizer.width, centerY);
    canvas.strokeStyle = '#b3ff00';
    canvas.lineWidth = 2;
    canvas.stroke();
    
    initializeAudio();
});

// Handle window resize
window.addEventListener('resize', () => {
    visualizer.width = visualizer.offsetWidth;
    visualizer.height = visualizer.offsetHeight;
}); 