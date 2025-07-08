<script lang="ts">
	import { onMount } from 'svelte';

	// Emoji Packs
	const EMOJI_PACKS: Record<string, string[]> = {
		faces: [
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
		],
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
		food: [
			'🍕',
			'🍔',
			'🍟',
			'🍦',
			'🍩',
			'🍪',
			'🍰',
			'🍫',
			'🍭',
			'🍬',
			'🍎',
			'🍌',
			'🍇',
			'🍓',
			'🍉'
		],
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

	// Color Themes
	const COLOR_THEMES: Record<
		string,
		{ bg: string; text: string; button: string; buttonHover: string }
	> = {
		light: {
			bg: 'linear-gradient(135deg, #f9d423 0%, #ff4e50 100%)',
			text: '#333',
			button: '#fff',
			buttonHover: '#ffe082'
		},
		dark: {
			bg: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
			text: '#fff',
			button: '#34495e',
			buttonHover: '#3498db'
		},
		neon: {
			bg: 'linear-gradient(135deg, #ff00ff 0%, #00ffff 100%)',
			text: '#fff',
			button: '#000',
			buttonHover: '#ff00ff'
		}
	};

	let currentPack: string = 'faces';
	let currentTheme: string = 'light';
	let EMOJIS: string[] = EMOJI_PACKS[currentPack];

	let sequence: string[] = [];
	let userInput: string[] = [];
	let round = 1;
	let score = 0;
	let gameOver = false;
	let showingSequence = false;
	let message = '';
	let debug = false;

	// Game States
	let gameStarted = false;
	let gamePaused = false;
	let showTutorial = true;
	let gameMode = 'normal'; // 'normal' or 'timed'
	let timeLeft = 60;
	let timer: ReturnType<typeof setInterval>;

	// Visual & Audio Feedback
	let audioCorrect: HTMLAudioElement;
	let audioWrong: HTMLAudioElement;
	let audioGameOver: HTMLAudioElement;
	let audioTick: HTMLAudioElement;

	let audioLoaded = false;
	let audioError = '';

	let animateIdx: number | null = null;
	let animateType: 'bounce' | 'shake' | null = null;

	let audienceEmojiQueue: { emoji: string; user: string }[] = [];
	let chatMessages: { user: string; comment: string }[] = [];

	// Add game modes
	const GAME_MODES = [
		'STREAMER_PLAY',
		'AUDIENCE_VS_COMPUTER',
		'STREAMER_VS_AUDIENCE',
		'AUDIENCE_VS_AUDIENCE'
	];

	let selectedMode = 'STREAMER_PLAY';
	let ws: WebSocket;

	// Team state for Audience vs Audience mode
	let teams: {
		A: { members: string[]; score: number };
		B: { members: string[]; score: number };
	} = {
		A: { members: [], score: 0 },
		B: { members: [], score: 0 }
	};

	// Animation state for team members
	let teamAnimations: {
		A: Set<string>;
		B: Set<string>;
	} = {
		A: new Set<string>(),
		B: new Set<string>()
	};

	// Team gameplay state
	let teamGameState = {
		isActive: false,
		currentTurn: 'A',
		currentSequence: [],
		roundNumber: 1,
		sequenceLength: 1,
		waitingForGuess: false
	};

	// Team round display
	let showTeamSequence = false;
	let teamSequenceDisplay = '';

	function getRandomEmoji() {
		return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
	}

	function changeEmojiPack(pack: string) {
		currentPack = pack;
		EMOJIS = EMOJI_PACKS[pack];
	}

	function changeTheme(theme: string) {
		currentTheme = theme;
	}

	function startGame() {
		sequence = [getRandomEmoji()];
		userInput = [];
		round = 1;
		score = 0;
		gameOver = false;
		gamePaused = false;
		message = '';
		timeLeft = 60;
		gameStarted = true;
		showTutorial = false;

		// Notify backend that game started
		if (ws && ws.readyState === 1) {
			ws.send(
				JSON.stringify({
					type: 'SEQUENCE_STATE',
					showingSequence: false,
					gameStarted: true
				})
			);
		}

		if (gameMode === 'timed') {
			startTimer();
		}

		showSequence();
	}

	function startTimer() {
		timer = setInterval(() => {
			if (!gamePaused && !gameOver) {
				timeLeft--;
				// Play tick sound every second
				audioTick?.play().catch((error) => {
					console.error('Tick sound failed:', error);
				});

				if (timeLeft <= 0) {
					clearInterval(timer);
					gameOver = true;
					message = `Time's up! Score: ${score}`;
					audioGameOver?.play();

					// Notify backend that game ended
					if (ws && ws.readyState === 1) {
						ws.send(
							JSON.stringify({
								type: 'SEQUENCE_STATE',
								showingSequence: false,
								gameStarted: false
							})
						);
					}
				}
			}
		}, 1000);
	}

	function pauseGame() {
		gamePaused = true;
		if (gameMode === 'timed') {
			clearInterval(timer);
		}

		// Notify backend that game is paused (no sequence display, but game is still active)
		if (ws && ws.readyState === 1) {
			ws.send(
				JSON.stringify({
					type: 'SEQUENCE_STATE',
					showingSequence: false,
					gameStarted: true
				})
			);
		}
	}

	function resumeGame() {
		gamePaused = false;
		if (gameMode === 'timed' && timeLeft > 0) {
			startTimer();
		}
	}

	async function showSequence() {
		showingSequence = true;
		// Notify backend that sequence is being shown
		if (ws && ws.readyState === 1) {
			ws.send(
				JSON.stringify({
					type: 'SEQUENCE_STATE',
					showingSequence: true,
					gameStarted: true
				})
			);
		}

		for (let i = 0; i < sequence.length; i++) {
			message = sequence[i];
			await new Promise((r) => setTimeout(r, 700));
			message = '';
			await new Promise((r) => setTimeout(r, 300));
		}
		showingSequence = false;
		userInput = [];

		// Notify backend that sequence display ended
		if (ws && ws.readyState === 1) {
			ws.send(
				JSON.stringify({
					type: 'SEQUENCE_STATE',
					showingSequence: false,
					gameStarted: true
				})
			);
		}
	}

	function handleEmojiTap(emoji: string, idx: number) {
		if (showingSequence || gameOver || gamePaused) return;

		userInput.push(emoji);
		const seqIdx = userInput.length - 1;

		if (emoji !== sequence[seqIdx]) {
			// Wrong tap - play sound and animate
			animateIdx = idx;
			animateType = 'shake';
			audioWrong?.play();
			vibrate([100, 50, 100]);

			// Make the emoji disappear and show game over after delay
			setTimeout(() => {
				animateIdx = null;
				animateType = null;
				message = ''; // Clear the sequence display

				// Show game over after emoji disappears
				setTimeout(() => {
					gameOver = true;
					message = `Game Over! Score: ${score}`;
					audioGameOver?.play();
					clearInterval(timer);

					// Notify backend that game ended
					if (ws && ws.readyState === 1) {
						ws.send(
							JSON.stringify({
								type: 'SEQUENCE_STATE',
								showingSequence: false,
								gameStarted: false
							})
						);
					}
				}, 1000); // Wait 1 second after emoji disappears
			}, 500); // Shake for 500ms
			return;
		}

		// Correct tap
		animateIdx = idx;
		animateType = 'bounce';
		audioCorrect?.play();
		vibrate([50]);

		setTimeout(() => {
			if (animateIdx === idx) {
				animateIdx = null;
				animateType = null;
			}
		}, 300);

		if (userInput.length === sequence.length) {
			score++;
			round++;
			setTimeout(() => {
				// Add one emoji from the audience queue if available
				if (audienceEmojiQueue.length > 0) {
					const next = audienceEmojiQueue.shift();
					if (next) {
						sequence.push(next.emoji);
					}
				} else {
					sequence.push(getRandomEmoji());
				}
				showSequence();
			}, 600);
		}
	}

	function vibrate(pattern: number[]) {
		if ('vibrate' in navigator) {
			navigator.vibrate(pattern);
		}
	}

	function skipTutorial() {
		showTutorial = false;
	}

	function testAudio() {
		if (audioCorrect) {
			audioCorrect
				.play()
				.then(() => {
					console.log('Audio test successful');
				})
				.catch((error) => {
					console.error('Audio test failed:', error);
					audioError = error.message;
				});
		}
	}

	function changeMode() {
		if (ws && ws.readyState === 1) {
			ws.send(JSON.stringify({ type: 'CHANGE_MODE', mode: selectedMode }));
		}
	}

	onMount(() => {
		// Initialize audio with error handling
		try {
			audioCorrect = new Audio('/audio/correct.mp3');
			audioWrong = new Audio('/audio/wrong.mp3');
			audioGameOver = new Audio('/audio/gameover.mp3');
			audioTick = new Audio('/audio/tick.mp3');

			// Preload audio files
			Promise.all([audioCorrect.load(), audioWrong.load(), audioGameOver.load(), audioTick.load()])
				.then(() => {
					audioLoaded = true;
					console.log('All audio files loaded successfully');
				})
				.catch((error) => {
					console.error('Audio loading failed:', error);
					audioError = error.message;
				});
		} catch (error) {
			console.error('Audio initialization failed:', error);
			audioError = error instanceof Error ? error.message : 'Unknown error';
		}

		// WebSocket connection to TikTok bot/game server
		ws = new WebSocket('ws://localhost:3001');
		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('WS EVENT:', data); // Catch-all log for all incoming events

			// Real-time chat display for all chat messages
			// if (data.type === 'chat_message') {
			// 	chatMessages = [{ user: data.user, comment: data.comment }, ...chatMessages].slice(0, 10);
			// }

			// Always queue audience emojis with user
			if (data.type === 'audience_emoji') {
				audienceEmojiQueue.push({ emoji: data.emoji, user: data.user });
			}

			// Handle theme change
			if (data.type === 'audience_theme') {
				changeTheme(data.theme);
			}

			// Handle emoji pack change
			if (data.type === 'audience_pack') {
				changeEmojiPack(data.pack);
			}

			// Handle game mode change
			if (data.type === 'MODE_CHANGED') {
				selectedMode = data.mode;
			}

			// Handle team state
			if (data.type === 'TEAM_STATE') {
				// Check for new members to animate
				(['A', 'B'] as const).forEach((teamKey) => {
					const newMembers = data.teams[teamKey].members;
					const oldMembers = teams[teamKey].members;

					// Find new members (joined)
					newMembers.forEach((member: string) => {
						if (!oldMembers.includes(member)) {
							teamAnimations[teamKey].add(member);
							// Force reactivity for animations
							teamAnimations = { ...teamAnimations };
							
							// Remove animation after 2 seconds
							setTimeout(() => {
								teamAnimations[teamKey].delete(member);
								teamAnimations = { ...teamAnimations }; // Trigger reactivity
							}, 2000);
						}
					});
				});

				// Update teams with proper reactivity
				teams = {
					A: { 
						members: [...data.teams.A.members], 
						score: data.teams.A.score 
					},
					B: { 
						members: [...data.teams.B.members], 
						score: data.teams.B.score 
					}
				};
			}

			// Handle team game events
			if (data.type === 'TEAM_GAME_START') {
				teamGameState = {
					...teamGameState,
					isActive: true,
					currentTurn: 'A',
					roundNumber: 1
				};
				teams = {
					A: { ...data.teams.A },
					B: { ...data.teams.B }
				};
				console.log('🎮 Team game started!');
			}

			if (data.type === 'TEAM_ROUND_START') {
				teamGameState = {
					...teamGameState,
					currentTurn: data.currentTurn,
					roundNumber: data.round,
					currentSequence: data.sequence,
					waitingForGuess: true
				};

				// Show sequence to audience
				showTeamSequence = true;
				teamSequenceDisplay = data.sequence.join(' ');

				// Notify backend that sequence is being shown
				if (ws && ws.readyState === 1) {
					ws.send(
						JSON.stringify({
							type: 'SEQUENCE_STATE',
							showingSequence: true,
							gameStarted: true
						})
					);
				}

				// Hide sequence after 3 seconds
				setTimeout(() => {
					showTeamSequence = false;
					teamSequenceDisplay = '';

					// Notify backend that sequence display ended
					if (ws && ws.readyState === 1) {
						ws.send(
							JSON.stringify({
								type: 'SEQUENCE_STATE',
								showingSequence: false,
								gameStarted: true
							})
						);
					}
				}, 3000);

				console.log(
					`🎮 Round ${data.round} - Team ${data.currentTurn}'s turn. Sequence: ${data.sequence.join(' ')}`
				);
			}

			if (data.type === 'TEAM_ROUND_END') {
				teamGameState = {
					...teamGameState,
					waitingForGuess: false
				};
				teams = {
					A: { ...data.teams.A },
					B: { ...data.teams.B }
				};
				console.log('🎮 Round ended!', data);
			}

			if (data.type === 'TEAM_GAME_END') {
				teamGameState = {
					...teamGameState,
					isActive: false
				};
				console.log('🎮 Team game ended!', data.finalScores);

				// Notify backend that team game ended
				if (ws && ws.readyState === 1) {
					ws.send(
						JSON.stringify({
							type: 'SEQUENCE_STATE',
							showingSequence: false,
							gameStarted: false
						})
					);
				}
			}
		};
	});
</script>

<!-- Tutorial Overlay -->
{#if showTutorial}
	<div class="tutorial-overlay">
		<div class="tutorial-content">
			<h2>How to Play Emoji Echo</h2>
			<div class="tutorial-steps">
				<p>1. Watch the emoji sequence carefully</p>
				<p>2. Tap the emojis in the same order</p>
				<p>3. Each round adds one more emoji</p>
				<p>4. Don't make a mistake or it's game over!</p>
				<p style="margin-top:1.5rem; font-weight:bold; color:#ff4e50;">Audience can play too!</p>
				<p>
					Send emoji commands in TikTok chat like <span
						style="background:#eee; padding:2px 6px; border-radius:4px;">w 😍</span
					>
					or <span style="background:#eee; padding:2px 6px; border-radius:4px;">W 🦄</span>
				</p>
				<p>
					Type <span style="background:#eee; padding:2px 6px; border-radius:4px;"
						>w &lt;emoji&gt;</span
					>
					or
					<span style="background:#eee; padding:2px 6px; border-radius:4px;">W &lt;emoji&gt;</span> to
					send an emoji to the game!
				</p>
			</div>
			<div class="tutorial-modes">
				<button
					class="mode-btn"
					on:click={() => {
						gameMode = 'normal';
						skipTutorial();
					}}>Normal Mode</button
				>
				<button
					class="mode-btn"
					on:click={() => {
						gameMode = 'timed';
						skipTutorial();
					}}>Timed Mode (60s)</button
				>
			</div>
		</div>
	</div>
{:else if !gameStarted}
	<!-- Main Menu -->
	<div class="menu-container" style="background: {COLOR_THEMES[currentTheme].bg}">
		<h1 class="game-title">Emoji Echo</h1>

		{#if !gameStarted && !showTutorial}
			<div class="menu-section">
				<h3>Choose Game Mode:</h3>
				<select bind:value={selectedMode} on:change={changeMode}>
					{#each GAME_MODES as mode}
						<option value={mode}>{mode.replace(/_/g, ' ')}</option>
					{/each}
				</select>
				<p style="color:white; margin-top:0.5rem;">
					Current Mode: {selectedMode.replace(/_/g, ' ')}
				</p>
			</div>
		{/if}

		<div class="menu-section">
			<h3>Choose Emoji Pack:</h3>
			<div class="pack-buttons">
				{#each Object.keys(EMOJI_PACKS) as pack}
					<button
						class="pack-btn {currentPack === pack ? 'active' : ''}"
						on:click={() => changeEmojiPack(pack)}
					>
						{EMOJI_PACKS[pack][0]}
						{pack}
					</button>
				{/each}
			</div>
		</div>

		<div class="menu-section">
			<h3>Choose Theme:</h3>
			<div class="theme-buttons">
				{#each Object.keys(COLOR_THEMES) as theme}
					<button
						class="theme-btn {currentTheme === theme ? 'active' : ''}"
						on:click={() => changeTheme(theme)}
					>
						{theme}
					</button>
				{/each}
			</div>
		</div>

		<button class="start-menu-btn" on:click={startGame}>Start Game</button>

		<!-- Audio Test Section -->
		<div class="menu-section">
			<h3>Audio Test:</h3>
			<button class="test-audio-btn" on:click={testAudio}>Test Audio</button>
			{#if audioLoaded}
				<div class="audio-status success">✅ Audio loaded successfully</div>
			{:else if audioError}
				<div class="audio-status error">❌ Audio error: {audioError}</div>
			{:else}
				<div class="audio-status">⏳ Loading audio...</div>
			{/if}
		</div>
	</div>
{:else}
	<!-- Game UI -->
	<div class="game-container" style="background: {COLOR_THEMES[currentTheme].bg}">
		{#if !gameOver}
			<!-- {#if chatMessages.length > 0}
				<div class="audience-chat">
					{#each chatMessages as msg}
						<div class="chat-msg overflow-y-auto"><span class="audience-user">{msg.user}:</span> <span class="chat-text">{msg.comment}</span></div>
					{/each}
				</div>
			{/if} -->
			<div class="game-header">
				<div class="score">Round: {round} | Score: {score}</div>
				{#if gameMode === 'timed'}
					<div class="timer">Time: {timeLeft}s</div>
				{/if}
				<button class="pause-btn" on:click={gamePaused ? resumeGame : pauseGame}>
					{gamePaused ? '▶️' : '⏸️'}
				</button>
			</div>

			{#if gamePaused}
				<div class="pause-overlay">
					<div class="pause-content">
						<h2>Game Paused</h2>
						<button class="resume-btn" on:click={resumeGame}>Resume</button>
					</div>
				</div>
			{/if}

			<div class="sequence">{message}</div>

			<div class="emoji-grid">
				<!-- Sequence Display Overlay -->
				{#if showingSequence || showTeamSequence}
					<div class="sequence-overlay">
						<div class="sequence-indicator">
							<div class="loading-spinner"></div>
							<div class="sequence-message">
								{#if showingSequence}
									Watching Sequence...
								{:else if showTeamSequence}
									Team {teamGameState.currentTurn} Sequence
								{/if}
							</div>
						</div>
					</div>
				{/if}

				{#each EMOJIS as emoji, idx}
					<button
						class="emoji-btn {animateIdx === idx && animateType === 'bounce'
							? 'bounce'
							: ''} {animateIdx === idx && animateType === 'shake' ? 'shake' : ''}"
						style="background: {COLOR_THEMES[currentTheme].button}"
						on:click={() => handleEmojiTap(emoji, idx)}
						disabled={showingSequence || showTeamSequence || gameOver || gamePaused}
					>
						{emoji}
					</button>
				{/each}
			</div>

			{#if debug}
				<div style="margin:1rem 0; color:{COLOR_THEMES[currentTheme].text}; font-size:1rem;">
					<div>Sequence: {sequence.join(' ')}</div>
					<div>Your input: {userInput.join(' ')}</div>
				</div>
			{/if}

			{#if selectedMode === 'AUDIENCE_VS_AUDIENCE'}
				<div class="team-play-section">
					<div class="team team-a">
						<h3>Team A</h3>
						<div>Score: {teams.A?.score ?? 0}</div>
						<div class="team-members">
							Members:
							{#if !teams.A?.members || teams.A.members.length === 0}
								<span class="no-members">None</span>
							{:else}
								{#each teams.A?.members ?? [] as member}
									<span class="member {teamAnimations.A.has(member) ? 'member-joined' : ''}">
										{member}
									</span>
								{/each}
							{/if}
						</div>
						{#if teamGameState.isActive && teamGameState.currentTurn === 'A'}
							<div class="current-turn">🎯 CURRENT TURN</div>
						{/if}
					</div>
					<div class="team team-b">
						<h3>Team B</h3>
						<div>Score: {teams.B?.score ?? 0}</div>
						<div class="team-members">
							Members:
							{#if !teams.B?.members || teams.B.members.length === 0}
								<span class="no-members">None</span>
							{:else}
								{#each teams.B?.members ?? [] as member}
									<span class="member {teamAnimations.B.has(member) ? 'member-joined' : ''}">
										{member}
									</span>
								{/each}
							{/if}
						</div>
						{#if teamGameState.isActive && teamGameState.currentTurn === 'B'}
							<div class="current-turn">🎯 CURRENT TURN</div>
						{/if}
					</div>

					{#if teamGameState.isActive}
						<div class="team-game-info">
							<div class="round-info">Round {teamGameState.roundNumber}</div>
							<div class="debug-info" style="font-size: 0.8rem; color: rgba(255,255,255,0.7);">
								Active: {teamGameState.isActive} | Turn: {teamGameState.currentTurn} | Waiting: {teamGameState.waitingForGuess}
							</div>
							{#if showTeamSequence}
								<div class="team-sequence">Sequence: {teamSequenceDisplay}</div>
							{:else if teamGameState.waitingForGuess}
								<div class="guess-instruction">
									Team {teamGameState.currentTurn}: Type "GUESS <emoji>" in chat! </emoji>
								</div>
							{/if}
						</div>
					{:else}
						<div class="team-instructions">
							<p>Join a team: Type "Team A" or "Team B" in chat</p>
							<p>When it's your turn: Type "GUESS <emoji>" in chat</emoji></p>
						</div>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="gameover-overlay">
				<div class="gameover-title">Game Over!</div>
				<div class="gameover-score">Final Score: {score}</div>
				<div class="gameover-details">
					<p>Rounds completed: {round - 1}</p>
					{#if gameMode === 'timed'}
						<p>Time remaining: {timeLeft}s</p>
					{/if}
				</div>
				<div class="gameover-buttons">
					<button class="gameover-restart" on:click={startGame}>Play Again</button>
					<button
						class="gameover-menu"
						on:click={() => {
							gameStarted = false;
							showTutorial = true;

							// Notify backend that game ended
							if (ws && ws.readyState === 1) {
								ws.send(
									JSON.stringify({
										type: 'SEQUENCE_STATE',
										showingSequence: false,
										gameStarted: false
									})
								);
							}
						}}>Main Menu</button
					>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Tutorial Styles */
	.tutorial-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.tutorial-content {
		background: white;
		padding: 2rem;
		border-radius: 1rem;
		text-align: center;
		max-width: 90vw;
	}

	.tutorial-steps {
		margin: 1.5rem 0;
		text-align: left;
	}

	.tutorial-steps p {
		margin: 0.5rem 0;
		font-size: 1.1rem;
	}

	.tutorial-modes {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 1.5rem;
	}

	.mode-btn {
		padding: 0.8rem 1.5rem;
		border: none;
		border-radius: 0.5rem;
		background: #ff4e50;
		color: white;
		font-weight: bold;
		cursor: pointer;
	}

	/* Menu Styles */
	.menu-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		font-family: 'Segoe UI', sans-serif;
		padding: 2rem;
	}

	.game-title {
		font-size: 3rem;
		color: white;
		margin-bottom: 2rem;
		text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
	}

	.menu-section {
		margin: 1.5rem 0;
		text-align: center;
	}

	.menu-section h3 {
		color: white;
		margin-bottom: 1rem;
		font-size: 1.3rem;
	}

	.pack-buttons,
	.theme-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
	}

	.pack-btn,
	.theme-btn {
		padding: 0.8rem 1.2rem;
		border: 2px solid white;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.2);
		color: white;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s;
	}

	.pack-btn.active,
	.theme-btn.active {
		background: white;
		color: #ff4e50;
	}

	.start-menu-btn {
		margin-top: 2rem;
		padding: 1rem 3rem;
		font-size: 1.5rem;
		border: none;
		border-radius: 2rem;
		background: white;
		color: #ff4e50;
		font-weight: bold;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	/* Game Styles */
	.game-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		font-family: 'Segoe UI', sans-serif;
	}

	.game-header {
		display: flex;
		align-items: center;
		gap: 2rem;
		margin-bottom: 1rem;
	}

	.score,
	.timer {
		font-size: 1.2rem;
		color: white;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
	}

	.pause-btn {
		font-size: 1.5rem;
		background: rgba(255, 255, 255, 0.2);
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem;
		cursor: pointer;
	}

	.pause-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
	}

	.pause-content {
		background: white;
		padding: 2rem;
		border-radius: 1rem;
		text-align: center;
	}

	.resume-btn {
		padding: 0.8rem 2rem;
		border: none;
		border-radius: 0.5rem;
		background: #ff4e50;
		color: white;
		font-weight: bold;
		cursor: pointer;
		margin-top: 1rem;
	}

	.sequence {
		font-size: 3rem;
		margin: 1rem 0;
		min-height: 3.5rem;
		letter-spacing: 0.5rem;
		color: white;
		text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
	}

	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(5, 3.5rem);
		gap: 1rem;
		margin: 2rem 0;
		position: relative;
	}

	.emoji-btn {
		font-size: 2rem;
		border: none;
		border-radius: 1rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		padding: 0.5rem;
		transition: transform 0.1s;
		cursor: pointer;
	}

	.emoji-btn:active {
		transform: scale(1.1);
	}

	.emoji-btn.bounce {
		animation: bounce 0.3s;
	}

	@keyframes bounce {
		0% {
			transform: scale(1);
		}
		30% {
			transform: scale(1.3);
		}
		60% {
			transform: scale(0.95);
		}
		100% {
			transform: scale(1);
		}
	}

	.emoji-btn.shake {
		animation: shake 0.5s;
	}

	@keyframes shake {
		0%,
		100% {
			transform: translateX(0);
		}
		20%,
		60% {
			transform: translateX(-10px);
		}
		40%,
		80% {
			transform: translateX(10px);
		}
	}

	/* Game Over Styles */
	.gameover-overlay {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: absolute;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.85);
		z-index: 10;
	}

	.gameover-title {
		font-size: 2.5rem;
		color: #fff;
		margin-bottom: 1.5rem;
		font-weight: bold;
		text-shadow: 2px 2px 8px #ff4e50;
	}

	.gameover-score {
		font-size: 1.5rem;
		color: #ffe082;
		margin-bottom: 1rem;
		text-shadow: 1px 1px 4px #000;
	}

	.gameover-details {
		color: #fff;
		margin-bottom: 2rem;
		text-align: center;
	}

	.gameover-details p {
		margin: 0.5rem 0;
	}

	.gameover-buttons {
		display: flex;
		gap: 1rem;
	}

	.gameover-restart,
	.gameover-menu {
		font-size: 1.2rem;
		padding: 1rem 2rem;
		border-radius: 2rem;
		border: none;
		font-weight: bold;
		cursor: pointer;
		transition: background 0.2s;
	}

	.gameover-restart {
		background: #ff4e50;
		color: #fff;
	}

	.gameover-menu {
		background: #fff;
		color: #ff4e50;
	}

	.gameover-restart:hover {
		background: #f9d423;
		color: #ff4e50;
	}

	.gameover-menu:hover {
		background: #ffe082;
	}

	/* Audio Test Styles */
	.test-audio-btn {
		padding: 0.8rem 1.5rem;
		border: 2px solid white;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.2);
		color: white;
		font-weight: bold;
		cursor: pointer;
		margin-bottom: 1rem;
	}

	.audio-status {
		color: white;
		font-size: 0.9rem;
		margin-top: 0.5rem;
	}

	.audio-status.success {
		color: #4ade80;
	}

	.audio-status.error {
		color: #f87171;
	}

	/* Audience Chat Styles */
	.audience-chat {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		margin-bottom: 0.5rem;
		width: 100%;
		max-width: 320px;
	}
	.chat-msg {
		background: rgba(255, 255, 255, 0.85);
		color: #222;
		padding: 0.2rem 0.7rem;
		border-radius: 0.5rem;
		font-size: 1.1rem;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
		display: flex;
		align-items: center;
	}

	.chat-text {
		margin-left: 0.3rem;
		word-break: break-word;
	}

	/* Team Play Styles */
	.team-play-section {
		display: flex;
		gap: 2rem;
		margin-top: 2rem;
	}

	.team {
		text-align: center;
	}

	.team h3 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.team-turn {
		font-size: 1.2rem;
		margin-top: 0.5rem;
	}

	.current-turn {
		font-size: 1.2rem;
		margin-top: 0.5rem;
		color: #ff4e50;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.team-game-info {
		margin-top: 1rem;
		text-align: center;
		color: white;
	}

	.round-info {
		font-size: 1.3rem;
		margin-bottom: 0.5rem;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
	}

	.team-sequence {
		font-size: 2rem;
		margin-bottom: 0.5rem;
		font-weight: bold;
		text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
		animation: fadeInOut 3s ease-in-out;
	}

	@keyframes fadeInOut {
		0%,
		100% {
			opacity: 0;
		}
		20%,
		80% {
			opacity: 1;
		}
	}

	.guess-instruction {
		font-size: 1.1rem;
		margin-bottom: 0.5rem;
		color: #ffe082;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
	}

	.team-instructions {
		font-size: 1rem;
		margin-top: 1rem;
		color: white;
		text-align: center;
	}

	.team-instructions p {
		margin: 0.3rem 0;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
	}

	.team-members {
		margin: 0.5rem 0;
	}

	.member {
		display: inline-block;
		margin: 0.2rem 0.3rem;
		padding: 0.2rem 0.5rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 0.3rem;
		transition: all 0.3s ease;
	}

	.member-joined {
		animation: memberJoin 2s ease-out;
	}

	@keyframes memberJoin {
		0% {
			transform: scale(0) rotate(-10deg);
			opacity: 0;
			background: rgba(76, 175, 80, 0.8);
			box-shadow: 0 0 20px rgba(76, 175, 80, 0.6);
		}
		50% {
			transform: scale(1.2) rotate(5deg);
			opacity: 1;
			background: rgba(76, 175, 80, 0.9);
			box-shadow: 0 0 30px rgba(76, 175, 80, 0.8);
		}
		100% {
			transform: scale(1) rotate(0deg);
			opacity: 1;
			background: rgba(255, 255, 255, 0.1);
			box-shadow: none;
		}
	}

	.no-members {
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
	}

	/* Sequence Overlay Styles */
	.sequence-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
		border-radius: 0.5rem;
		backdrop-filter: blur(5px);
	}

	.sequence-indicator {
		background: rgba(255, 255, 255, 0.95);
		padding: 1.5rem 2rem;
		border-radius: 0.8rem;
		text-align: center;
		animation: fadeInScale 0.3s ease-out;
	}

	@keyframes fadeInScale {
		0% {
			opacity: 0;
			transform: scale(0.8);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.loading-spinner {
		width: 30px;
		height: 30px;
		border: 3px solid #f3f3f3;
		border-top: 3px solid #ff4e50;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 0.8rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.sequence-message {
		font-size: 1rem;
		font-weight: bold;
		color: #333;
		text-shadow: none;
	}
</style>
