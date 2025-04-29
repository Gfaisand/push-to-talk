import { WebClient } from '@slack/web-api';

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;

export const handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Parse the incoming request body
        const body = JSON.parse(event.body);
        const { audio, filename } = body;

        // Convert base64 to buffer
        const base64Data = audio.split('base64,')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        // Ensure filename has proper audio extension
        const audioFilename = filename.endsWith('.webm') ? filename : `${filename}.webm`;

        // Upload to Slack using the new V2 method
        const result = await slack.files.uploadV2({
            channel_id: SLACK_CHANNEL,
            filename: audioFilename,
            file: buffer,
            title: `Voice Recording ${new Date().toLocaleString()}`,
            initial_comment: "🎤 New voice message",
            filetype: "webm",  // Explicitly set file type as WebM
            request: {
                headers: {
                    'Content-Type': 'audio/webm'  // Set proper MIME type
                }
            }
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({ success: true, result })
        };
    } catch (error) {
        console.error('Upload failed:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
}; 