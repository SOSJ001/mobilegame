import { WebSocketServer } from 'ws';

// Create WebSocket server
const wss = new WebSocketServer({ port: 3001 });

console.log('🌐 WebSocket server starting on port 3001...');

// Store connected clients
const clients = new Set();

// Supported game modes
const GAME_MODES = [
	'STREAMER_PLAY',
	'AUDIENCE_VS_COMPUTER',
	'STREAMER_VS_AUDIENCE',
	'AUDIENCE_VS_AUDIENCE'
];

// Central game state
let gameState = {
	gameMode: 'STREAMER_PLAY' // default mode
};

// Team play state for Audience vs Audience mode
let teams = {
	A: { members: new Set(), score: 0, emojiGuesses: [] },
	B: { members: new Set(), score: 0, emojiGuesses: [] }
};

// Aggregation window (ms)
const AGGREGATION_WINDOW = 3000;
let aggregationTimeout = null;

// Helper to aggregate emoji guesses for both teams
function aggregateTeamGuesses() {
	['A', 'B'].forEach((teamKey) => {
		const guesses = teams[teamKey].emojiGuesses;
		if (guesses.length > 0) {
			// Count most common emoji
			const counts = {};
			guesses.forEach((g) => {
				counts[g.emoji] = (counts[g.emoji] || 0) + 1;
			});
			let max = 0;
			let mostCommon = null;
			for (const emoji in counts) {
				if (counts[emoji] > max) {
					max = counts[emoji];
					mostCommon = emoji;
				}
			}
			// Broadcast the team's chosen emoji
			broadcast({
				type: 'TEAM_EMOJI_RESULT',
				team: teamKey,
				emoji: mostCommon,
				count: max
			});
			// Clear guesses for next round
			teams[teamKey].emojiGuesses = [];
		}
	});
	aggregationTimeout = null;
}

// Call this to start the aggregation window
function startAggregationWindow() {
	if (!aggregationTimeout) {
		aggregationTimeout = setTimeout(aggregateTeamGuesses, AGGREGATION_WINDOW);
	}
}

// Helper to broadcast full team state
function broadcastTeams() {
	const teamState = {
		type: 'TEAM_STATE',
		teams: {
			A: { members: Array.from(teams.A.members), score: teams.A.score },
			B: { members: Array.from(teams.B.members), score: teams.B.score }
		}
	};
	console.log('Broadcasting teams:', {
		A: Array.from(teams.A.members),
		B: Array.from(teams.B.members)
	});
	broadcast(teamState);
}

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

	// Send current game mode to new client
	ws.send(
		JSON.stringify({
			type: 'MODE_CHANGED',
			mode: gameState.gameMode
		})
	);

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);
			// Handle game mode change
			if (data.type === 'CHANGE_MODE' && GAME_MODES.includes(data.mode)) {
				gameState.gameMode = data.mode;
				broadcast({ type: 'MODE_CHANGED', mode: data.mode });
				return;
			}

			// Handle team join
			if (data.type === 'TEAM_JOIN' && (data.team === 'A' || data.team === 'B') && data.user) {
				// Remove user from both teams first
				teams.A.members.delete(data.user);
				teams.B.members.delete(data.user);
				// Add to selected team
				teams[data.team].members.add(data.user);
				broadcastTeams();
				return;
			}

			// Handle team emoji guess
			if (
				data.type === 'TEAM_EMOJI_GUESS' &&
				(data.team === 'A' || data.team === 'B') &&
				data.emoji &&
				data.user
			) {
				// Only accept guesses from team members
				if (teams[data.team].members.has(data.user)) {
					teams[data.team].emojiGuesses.push({ emoji: data.emoji, user: data.user });
					startAggregationWindow();
					// Optionally, broadcast guesses or wait for aggregation window
				}
				return;
			}

			// Broadcast to all other clients
			clients.forEach((client) => {
				if (client !== ws && client.readyState === ws.OPEN) {
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

// Broadcast helper
function broadcast(data) {
	clients.forEach((client) => {
		if (client.readyState === 1) {
			client.send(JSON.stringify(data));
		}
	});
}

console.log('✅ WebSocket server ready!');
console.log('📡 Waiting for connections...');
