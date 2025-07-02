import { WebSocketServer } from 'ws';

// Create WebSocket server
const wss = new WebSocketServer({ port: 3001 });

console.log('🌐 WebSocket server starting on port 3001...');

// Store connected clients
const clients = new Set();

wss.on('connection', (ws) => {
	console.log('🔗 New client connected');
	clients.add(ws);

	// Send welcome message
	ws.send(
		JSON.stringify({
			type: 'connected',
			message: 'Connected to TikTok Chat Bot'
		})
	);

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);
			// No message data logs
			// Broadcast to all other clients
			clients.forEach((client) => {
				if (client !== ws && client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify(data));
				}
			});
		} catch (error) {
			console.error('❌ Error parsing message:', error);
		}
	});

	ws.on('close', () => {
		console.log('🔌 Client disconnected');
		clients.delete(ws);
	});

	ws.on('error', (error) => {
		console.error('❌ WebSocket error:', error);
		clients.delete(ws);
	});
});

console.log('✅ WebSocket server ready!');
console.log('📡 Waiting for connections...');
