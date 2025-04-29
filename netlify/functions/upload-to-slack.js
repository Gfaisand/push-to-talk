const { WebClient } = require('@slack/web-api');

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;

exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Parse the incoming request body
        const body = JSON.parse(event.body);
        const { audio, filename } = body;

        // Upload to Slack
        const result = await slack.files.upload({
            channels: SLACK_CHANNEL,
            filename: filename,
            filetype: 'webm',
            title: `Voice Recording ${new Date().toLocaleString()}`,
            content: audio.split('base64,')[1] // Remove data URL prefix if present
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