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
	gameMode: 'STREAMER_PLAY', // default mode
	showingSequence: false, // Track when sequence is being displayed for ALL modes
	gameStarted: false // Track if any game is currently active
};

// Team play state for Audience vs Audience mode
let teams = {
	A: { members: new Set(), score: 0, emojiGuesses: [] },
	B: { members: new Set(), score: 0, emojiGuesses: [] }
};

// Team gameplay state
let teamGameState = {
	isActive: false,
	currentTurn: 'A', // 'A' or 'B'
	currentSequence: [],
	roundNumber: 1,
	sequenceLength: 1,
	waitingForGuess: false,
	guessWindow: null,
	showingSequence: false // Track when sequence is being displayed
};

// Aggregation window (ms)
const AGGREGATION_WINDOW = 3000;
let aggregationTimeout = null;

// Helper to start a new team game round
function startTeamRound() {
	if (teamGameState.isActive) {
		// Generate new sequence
		const emojis = [
			'😀',
			'😂',
			'😍',
			'😎',
			'🤩',
			'🥳',
			'😜',
			'😱',
			'🤖',
			'👻',
			'😴',
			'😡',
			'🤔',
			'😇',
			'🤠'
		];
		teamGameState.currentSequence = [];
		for (let i = 0; i < teamGameState.sequenceLength; i++) {
			teamGameState.currentSequence.push(emojis[Math.floor(Math.random() * emojis.length)]);
		}

		// Clear previous guesses
		teams.A.emojiGuesses = [];
		teams.B.emojiGuesses = [];

		// Set sequence display state
		teamGameState.showingSequence = true;
		teamGameState.waitingForGuess = false;

		// Broadcast new round
		broadcast({
			type: 'TEAM_ROUND_START',
			round: teamGameState.roundNumber,
			sequence: teamGameState.currentSequence,
			currentTurn: teamGameState.currentTurn
		});

		console.log(
			`🎮 Team round ${teamGameState.roundNumber} started. Sequence: ${teamGameState.currentSequence.join(' ')}`
		);

		// After 3 seconds, allow guessing
		setTimeout(() => {
			teamGameState.showingSequence = false;
			teamGameState.waitingForGuess = true;
			console.log(`🎮 Sequence display ended. Team ${teamGameState.currentTurn} can now guess.`);
		}, 3000);
	}
}

// Helper to end team round and calculate scores
function endTeamRound() {
	if (!teamGameState.isActive) return;

	// Calculate scores for both teams
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

			// Check if correct
			const correctEmoji =
				teamGameState.currentSequence[teamGameState.currentTurn === teamKey ? 0 : 1] ||
				teamGameState.currentSequence[0];
			const isCorrect = mostCommon === correctEmoji;

			if (isCorrect) {
				teams[teamKey].score += 1;
				console.log(`✅ Team ${teamKey} guessed correctly: ${mostCommon}`);
			} else {
				console.log(
					`❌ Team ${teamKey} guessed incorrectly: ${mostCommon} (expected: ${correctEmoji})`
				);
			}
		}
	});

	// Reset sequence display state
	teamGameState.showingSequence = false;
	teamGameState.waitingForGuess = false;

	// Broadcast round results
	broadcast({
		type: 'TEAM_ROUND_END',
		teams: {
			A: { score: teams.A.score, guesses: teams.A.emojiGuesses },
			B: { score: teams.B.score, guesses: teams.B.emojiGuesses }
		},
		correctSequence: teamGameState.currentSequence
	});

	// Switch turns and increase sequence length
	teamGameState.currentTurn = teamGameState.currentTurn === 'A' ? 'B' : 'A';
	teamGameState.roundNumber += 1;
	teamGameState.sequenceLength = Math.min(teamGameState.sequenceLength + 1, 5); // Max 5 emojis

	// Start next round after delay
	setTimeout(() => {
		startTeamRound();
	}, 3000);
}

// Helper to start team game
function startTeamGame() {
	teamGameState.isActive = true;
	teamGameState.currentTurn = 'A';
	teamGameState.roundNumber = 1;
	teamGameState.sequenceLength = 1;
	teamGameState.showingSequence = false;
	teamGameState.waitingForGuess = false;
	teams.A.score = 0;
	teams.B.score = 0;

	broadcast({
		type: 'TEAM_GAME_START',
		teams: {
			A: { members: Array.from(teams.A.members), score: 0 },
			B: { members: Array.from(teams.B.members), score: 0 }
		}
	});

	console.log('🎮 Team game started!');
	startTeamRound();
}

// Helper to stop team game
function stopTeamGame() {
	teamGameState.isActive = false;
	teamGameState.showingSequence = false;
	teamGameState.waitingForGuess = false;
	if (teamGameState.guessWindow) {
		clearTimeout(teamGameState.guessWindow);
		teamGameState.guessWindow = null;
	}

	broadcast({
		type: 'TEAM_GAME_END',
		finalScores: {
			A: teams.A.score,
			B: teams.B.score
		}
	});

	console.log('🎮 Team game ended!');
}

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
		},
		gameState: teamGameState
	};
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

	// Send current team state to new client
	if (gameState.gameMode === 'AUDIENCE_VS_AUDIENCE') {
		broadcastTeams();
	}

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);

			// Handle game mode change
			if (data.type === 'CHANGE_MODE' && GAME_MODES.includes(data.mode)) {
				gameState.gameMode = data.mode;
				broadcast({ type: 'MODE_CHANGED', mode: data.mode });

				// Handle team game start/stop based on mode
				if (data.mode === 'AUDIENCE_VS_AUDIENCE') {
					if (!teamGameState.isActive) {
						startTeamGame();
					}
				} else {
					if (teamGameState.isActive) {
						stopTeamGame();
					}
				}
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
			if (data.type === 'TEAM_EMOJI_GUESS' && data.emoji && data.user) {
				// Determine which team the user is on
				let userTeam = null;
				if (teams.A.members.has(data.user)) {
					userTeam = 'A';
				} else if (teams.B.members.has(data.user)) {
					userTeam = 'B';
				}

				// Only accept guesses if:
				// 1. User is on a team
				// 2. It's their team's turn
				// 3. Sequence is not being displayed
				// 4. Game is waiting for guesses
				if (
					userTeam &&
					teamGameState.currentTurn === userTeam &&
					!teamGameState.showingSequence &&
					teamGameState.waitingForGuess
				) {
					teams[userTeam].emojiGuesses.push({ emoji: data.emoji, user: data.user });
					console.log(`✅ ${data.user} (Team ${userTeam}) guessed: ${data.emoji}`);

					// Start guess window if not already started
					if (!teamGameState.guessWindow) {
						teamGameState.guessWindow = setTimeout(() => {
							endTeamRound();
							teamGameState.guessWindow = null;
						}, 5000); // 5 second window for guessing
					}
				} else {
					// Log why guess was rejected
					if (!userTeam) {
						console.log(`❌ ${data.user} tried to guess but is not on a team`);
					} else if (teamGameState.currentTurn !== userTeam) {
						console.log(
							`❌ ${data.user} (Team ${userTeam}) tried to guess but it's Team ${teamGameState.currentTurn}'s turn`
						);
					} else if (teamGameState.showingSequence) {
						console.log(
							`❌ ${data.user} (Team ${userTeam}) tried to guess during sequence display`
						);
					} else if (!teamGameState.waitingForGuess) {
						console.log(
							`❌ ${data.user} (Team ${userTeam}) tried to guess but game is not waiting for guesses`
						);
					}
				}
				return;
			}

			// Handle sequence display state updates from frontend
			if (data.type === 'SEQUENCE_STATE') {
				gameState.showingSequence = data.showingSequence;
				gameState.gameStarted = data.gameStarted;
				console.log(
					`🎮 Sequence state updated: showingSequence=${data.showingSequence}, gameStarted=${data.gameStarted}`
				);
				return;
			}

			// Handle team game control
			if (data.type === 'TEAM_GAME_CONTROL') {
				if (data.action === 'START' && gameState.gameMode === 'AUDIENCE_VS_AUDIENCE') {
					startTeamGame();
				} else if (data.action === 'STOP') {
					stopTeamGame();
				}
				return;
			}

			// Filter audience emoji messages during sequence display
			if (data.type === 'audience_emoji') {
				if (gameState.showingSequence) {
					console.log(
						`❌ ${data.user} tried to send emoji ${data.emoji} during sequence display - blocked`
					);
					return; // Don't broadcast during sequence display
				} else if (!gameState.gameStarted) {
					console.log(
						`❌ ${data.user} tried to send emoji ${data.emoji} but no game is active - blocked`
					);
					return; // Don't broadcast if no game is active
				} else {
					console.log(`✅ ${data.user} sent emoji ${data.emoji} - accepted`);
				}
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
