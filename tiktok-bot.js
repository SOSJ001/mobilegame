import { WebcastPushConnection } from 'tiktok-live-connector';
import WebSocket from 'ws';

// Configuration
const TIKTOK_USERNAME = 'mickey7hi'; // Replace with your TikTok username
const GAME_WEBSOCKET_URL = 'ws://localhost:3001'; // WebSocket server for game

// WebSocket connection to game
let gameSocket = null;

// Connect to game WebSocket
function connectToGame() {
	try {
		gameSocket = new WebSocket(GAME_WEBSOCKET_URL);

		gameSocket.on('open', () => {
			console.log('✅ Connected to game WebSocket');
		});

		gameSocket.on('close', () => {
			console.log('❌ Disconnected from game WebSocket');
			// Try to reconnect after 5 seconds
			setTimeout(connectToGame, 5000);
		});

		gameSocket.on('error', (error) => {
			console.error('❌ WebSocket error:', error);
		});
	} catch (error) {
		console.error('❌ Failed to connect to game:', error);
	}
}

// Send command to game
function sendToGame(command) {
	if (gameSocket && gameSocket.readyState === WebSocket.OPEN) {
		gameSocket.send(JSON.stringify(command));
	}
}

// TikTok Live Connection
const tiktokLiveConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
	processInitialData: true,
	enableExtendedGiftInfo: true,
	enableWebsocketUpgrade: true,
	requestPollingIntervalMs: 2000,
	sessionId: undefined,
	clientParams: {},
	enableRequestSignature: false,
	enableTrustedDevice: false
});

// Connect to TikTok Live
tiktokLiveConnection
	.connect()
	.then((state) => {
		console.log(`✅ Connected to TikTok Live: @${TIKTOK_USERNAME}`);
	})
	.catch((err) => {
		console.error('❌ Failed to connect to TikTok Live:', err);
	});

// Deduplication cache: key = user+comment, value = timestamp
const recentMessages = new Map();
const DEDUPLICATION_WINDOW_MS = 3000; // 3 seconds

// Full emoji-to-pack mapping (copied from Svelte EMOJI_PACKS)
const EMOJI_PACKS = {
	faces: ['😀', '😂', '😍', '😎', '🤩', '🥳', '😜', '😱', '🤖', '👻', '😴', '😡', '🤔', '😇', '🤠'],
	animals: [
		'🐶',
		'🐱',
		'🦄',
		'🐸',
		'🦁',
		'🐯',
		'🐨',
		'🐼',
		'🦊',
		'🐰',
		'🐷',
		'🐮',
		'🐸',
		'🦋',
		'🐙'
	],
	food: ['🍕', '🍔', '🍟', '🍦', '🍩', '🍪', '🍰', '🍫', '🍭', '🍬', '🍎', '🍌', '🍇', '🍓', '🍉'],
	sports: [
		'⚽',
		'🏀',
		'🏈',
		'⚾',
		'🎾',
		'🏐',
		'🏓',
		'🏸',
		'🏊',
		'🏃',
		'🚴',
		'🎯',
		'🎳',
		'🏆',
		'🥇'
	],
	objects: [
		'🚗',
		'✈️',
		'🚁',
		'🚢',
		'🚲',
		'🏠',
		'🏰',
		'🗼',
		'🎡',
		'🎢',
		'🎪',
		'🎭',
		'🎨',
		'🎤',
		'🎧'
	]
};

// Build emoji-to-pack map
const emojiToPack = {};
for (const [pack, emojis] of Object.entries(EMOJI_PACKS)) {
	for (const emoji of emojis) {
		emojiToPack[emoji] = pack;
	}
}

// Listen for chat messages
tiktokLiveConnection.on('chat', (data) => {
	// console.log(`${data.uniqueId}: ${data.comment}`);
	const dedupKey = `${data.uniqueId}:${data.comment}`;
	const now = Date.now();

	// Clean up old entries
	for (const [key, ts] of recentMessages) {
		if (now - ts > DEDUPLICATION_WINDOW_MS) {
			recentMessages.delete(key);
		}
	}

	// Check for duplicate
	if (recentMessages.has(dedupKey)) {
		// Duplicate detected, ignore this message
		return;
	}
	recentMessages.set(dedupKey, now);

	// Send all chat messages to the game for real-time chat display
	sendToGame({ type: 'chat_message', user: data.uniqueId, comment: data.comment });

	// Accept any emoji in the packs
	if (emojiToPack[data.comment]) {
		const emoji = data.comment;
		const pack = emojiToPack[emoji];
		const msg = {
			type: 'audience_emoji',
			emoji,
			pack,
			user: data.uniqueId
		};
		sendToGame(msg);
		console.log(`📤 Sent to game: ${data.uniqueId} sent emoji ${emoji} (${pack})`);
	}

	// NEW: Handle '!<emoji> <word>' command (e.g., '!😍 nice')
	if (data.comment.startsWith('!')) {
		// Extract the emoji after '!' and before the first space
		const match = data.comment.match(/^!(\S+)/);
		if (match) {
			const emoji = match[1];
			if (emojiToPack[emoji]) {
				const pack = emojiToPack[emoji];
				const msg = {
					type: 'audience_emoji',
					emoji,
					pack,
					user: data.uniqueId
				};
				sendToGame(msg);
				console.log(
					`📤 Sent to game: ${data.uniqueId} sent emoji ${emoji} (${pack}) via !<emoji> <word> command`
				);
			}
		}
	}

	// NEW: Handle 'w <emoji>' or 'W <emoji>' command (e.g., 'w 😍' or 'W 😍')
	if (/^w\s|^W\s/.test(data.comment)) {
		// Extract the emoji after 'w ' or 'W '
		const match = data.comment.match(/^w\s([\p{Emoji}\u200d\u2640-\u2642-\u2600-\u27BF]+)/iu);
		if (match) {
			const emoji = match[1];
			if (emojiToPack[emoji]) {
				const pack = emojiToPack[emoji];
				const msg = {
					type: 'audience_emoji',
					emoji,
					pack,
					user: data.uniqueId
				};
				sendToGame(msg);
				console.log(
					`📤 Sent to game: ${data.uniqueId} sent emoji ${emoji} (${pack}) via w <emoji> command`
				);
			}
		}
	}

	// Check for special commands
	const comment = data.comment.toLowerCase();

	if (comment.includes('!speed')) {
		sendToGame({
			type: 'audience_speed',
			action: 'speed_up',
			user: data.uniqueId
		});
	}

	if (comment.includes('!slow')) {
		sendToGame({
			type: 'audience_speed',
			action: 'slow_down',
			user: data.uniqueId
		});
	}

	// Theme cycling state
	let themeIndex = 0;
	const themes = ['light', 'dark', 'neon'];

	if (comment.includes('!theme')) {
		// Cycle through themes in order
		themeIndex = (themeIndex + 1) % themes.length;
		const nextTheme = themes[themeIndex];
		sendToGame({
			type: 'audience_theme',
			theme: nextTheme,
			user: data.uniqueId
		});
	}

	if (comment.includes('!pack')) {
		const packs = ['faces', 'animals', 'food', 'sports', 'objects'];
		const randomPack = packs[Math.floor(Math.random() * packs.length)];
		sendToGame({
			type: 'audience_pack',
			pack: randomPack,
			user: data.uniqueId
		});
	}

	// Debug log for nickname and uniqueId
	// console.log(`DEBUG: uniqueId=${data.uniqueId}, nickname=${data.nickname}`);

	// Team join command: 'T A', 'T B', 'TEAM A', or 'TEAM B' (case-insensitive)
	if (/^(T|TEAM)\s+[AB]$/i.test(data.comment.trim())) {
		const team = data.comment.trim().slice(-1).toUpperCase();
		sendToGame({ type: 'TEAM_JOIN', user: data.uniqueId, team });
		console.log(`📤 ${data.uniqueId} joined Team ${team}`);
		return;
	}

	// Team emoji guess command: 'GUESS <emoji>' (case-insensitive)
	if (/^GUESS\s+([\p{Emoji}\u200d\u2640-\u2642-\u2600-\u27BF]+)/iu.test(data.comment.trim())) {
		const match = data.comment
			.trim()
			.match(/^GUESS\s+([\p{Emoji}\u200d\u2640-\u2642-\u2600-\u27BF]+)/iu);
		if (match) {
			const emoji = match[1];
			// Determine which team the user is on
			let userTeam = null;
			// This will be determined by the backend based on team membership
			sendToGame({
				type: 'TEAM_EMOJI_GUESS',
				user: data.uniqueId,
				emoji: emoji
			});
			console.log(`📤 ${data.uniqueId} guessed emoji: ${emoji}`);
		}
		return;
	}
});

// Listen for follows
tiktokLiveConnection.on('follow', (data) => {
	sendToGame({
		type: 'audience_follow',
		user: data.uniqueId
	});
});

// Error handling
tiktokLiveConnection.on('error', (err) => {});

// Disconnect handling
tiktokLiveConnection.on('disconnected', () => {});

// Connect to game WebSocket
connectToGame();

console.log('🤖 TikTok Chat Bot started!');
