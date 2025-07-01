<script lang="ts">
	import { onMount } from 'svelte';
	const EMOJIS = [
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
		'🐶',
		'🐱',
		'🦄',
		'🐸',
		'🍕',
		'🍔',
		'🍟',
		'🍦',
		'⚽',
		'🏀',
		'🚗',
		'✈️',
		'🌈',
		'🔥',
		'⭐'
	];

	let sequence: string[] = [];
	let userInput: string[] = [];
	let round = 1;
	let score = 0;
	let gameOver = false;
	let showingSequence = false;
	let message = '';
	let debug = false; // Set to true to show debug info

	function getRandomEmoji() {
		return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
	}

	function startGame() {
		sequence = [getRandomEmoji()];
		userInput = [];
		round = 1;
		score = 0;
		gameOver = false;
		message = '';
		showSequence();
	}

	async function showSequence() {
		showingSequence = true;
		for (let i = 0; i < sequence.length; i++) {
			message = sequence[i];
			await new Promise((r) => setTimeout(r, 700));
			message = '';
			await new Promise((r) => setTimeout(r, 300));
		}
		showingSequence = false;
		userInput = [];
	}

	function handleEmojiTap(emoji: string) {
		if (showingSequence || gameOver) return;
		userInput.push(emoji);
		const idx = userInput.length - 1;
		if (emoji !== sequence[idx]) {
			gameOver = true;
			message = `Game Over! Score: ${score}`;
			return;
		}
		if (userInput.length === sequence.length) {
			score++;
			round++;
			setTimeout(() => {
				sequence.push(getRandomEmoji());
				showSequence();
			}, 600); // Short pause before next round
		}
	}

	onMount(() => {
		startGame();
	});
</script>

<div class="game-container">
	<div class="score">Round: {round} &nbsp;|&nbsp; Score: {score}</div>
	<div class="sequence">{message}</div>
	<div class="emoji-grid">
		{#each EMOJIS as emoji}
			<button
				class="emoji-btn"
				on:click={() => handleEmojiTap(emoji)}
				disabled={showingSequence || gameOver}>{emoji}</button
			>
		{/each}
	</div>
	{#if debug}
		<div style="margin:1rem 0; color:#fff; font-size:1rem;">
			<div>Sequence: {sequence.join(' ')}</div>
			<div>Your input: {userInput.join(' ')}</div>
		</div>
	{/if}
	{#if gameOver}
		<button class="start-btn" on:click={startGame}>Restart</button>
	{/if}
</div>

<style>
	.game-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: linear-gradient(135deg, #f9d423 0%, #ff4e50 100%);
		font-family: 'Segoe UI', sans-serif;
	}
	.sequence {
		font-size: 3rem;
		margin: 1rem 0;
		min-height: 3.5rem;
		letter-spacing: 0.5rem;
	}
	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(5, 3.5rem);
		gap: 1rem;
		margin: 2rem 0;
	}
	.emoji-btn {
		font-size: 2rem;
		background: white;
		border: none;
		border-radius: 1rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		padding: 0.5rem;
		transition: transform 0.1s;
	}
	.emoji-btn:active {
		transform: scale(1.2);
		background: #ffe082;
	}
	.score {
		font-size: 1.2rem;
		margin-bottom: 1rem;
		color: #fff;
		text-shadow: 1px 1px 2px #0002;
	}
	.start-btn {
		margin-top: 2rem;
		font-size: 1.2rem;
		padding: 0.7rem 2rem;
		border-radius: 2rem;
		border: none;
		background: #fff;
		color: #ff4e50;
		font-weight: bold;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		cursor: pointer;
	}
</style>
