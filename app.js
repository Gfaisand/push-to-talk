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

        // Set up media recorder with MP3 format
        const options = { mimeType: 'audio/mpeg' };
        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            console.log('Recording stopped');
            const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
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
        if (error.name === 'NotSupportedError') {
            // Fallback to default format if MP3 is not supported
            try {
                mediaRecorder = new MediaRecorder(stream);
                statusText.textContent = 'Ready to record (using default format)';
                pushToTalkButton.disabled = false;
            } catch (fallbackError) {
                console.error('Fallback initialization failed:', fallbackError);
                statusText.textContent = `Error: ${fallbackError.message}`;
            }
        } else {
            console.error('Error during initialization:', error);
            statusText.textContent = `Error: ${error.message}`;
        }
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