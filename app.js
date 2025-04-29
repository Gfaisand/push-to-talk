// DOM Elements
const pushToTalkButton = document.getElementById('pushToTalk');
const recordingIndicator = document.getElementById('recordingIndicator');
const visualizer = document.getElementById('visualizer');
const statusText = document.getElementById('status');
let canvas;

// Audio Context and Variables
let audioContext;
let mediaRecorder = null;
let audioStream = null;
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
                filename: `recording_${Date.now()}.mp3`
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
        // Request microphone access first
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        // Create audio context after user interaction
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Set up audio analyzer
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(audioStream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Check for MP3 recording support
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/mpeg')) {
            mimeType = 'audio/mpeg';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
        }

        // Set up media recorder
        mediaRecorder = new MediaRecorder(audioStream, { mimeType });
        console.log('Using MIME type:', mimeType);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            console.log('Recording stopped');
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            console.log('Audio Blob created:', audioBlob.size, 'bytes');
            
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
        pushToTalkButton.disabled = true;
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
pushToTalkButton.addEventListener('mousedown', async () => {
    if (!audioContext) {
        await initializeAudio();
        return;
    }

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        isRecording = true;
        audioChunks = [];
        try {
            mediaRecorder.start();
            recordingIndicator.classList.add('recording');
            statusText.textContent = 'Recording...';
            drawVisualizer();
        } catch (error) {
            console.error('Failed to start recording:', error);
            statusText.textContent = 'Failed to start recording';
            isRecording = false;
        }
    }
});

pushToTalkButton.addEventListener('mouseup', () => {
    if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
        isRecording = false;
        mediaRecorder.stop();
        recordingIndicator.classList.remove('recording');
        statusText.textContent = 'Processing...';
    }
});

pushToTalkButton.addEventListener('mouseleave', () => {
    if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
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
    // Don't initialize audio until user interaction
    statusText.textContent = 'Click to start recording';
});

// Handle window resize
window.addEventListener('resize', () => {
    visualizer.width = visualizer.offsetWidth;
    visualizer.height = visualizer.offsetHeight;
}); 