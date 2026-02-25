/**
 * SNAKE GAME ES6 IMPLEMENTATION
 * Architecture: Modular Object-Oriented Pattern
 * Highlights: Canvas API rendering, requestAnimationFrame loop, State Management, LocalStorage
 */

// ==========================================
// UTILITIES
// ==========================================
/**
 * Helper object spanning shared operations to avoid global clutter.
 */
const utils = {
    // Math helper to align coordinates beautifully to our grid sizes
    getRandomCoordinate: (min, max, gridSize) => {
        return Math.floor((Math.random() * (max - min) + min) / gridSize) * gridSize;
    },

    // Synthesized Sound Effects directly from the Web Audio API
    // Used to avoid loading external mp3/wav files and encountering cross-origin issues locally
    playSound: (type) => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'eat') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                osc.start();
                osc.stop(ctx.currentTime + 0.1);
            } else if (type === 'gameover') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch (e) {
            // Silently fail if audio context is blocked by browser policies
            console.warn('Audio play restricted context.');
        }
    }
};

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================
const CONFIG = {
    CANVAS_SIZE: 400,
    GRID_SIZE: 20,
    INITIAL_SPEED: 150, // Higher is slower (delay in ms)
    MIN_SPEED: 50,      // Max speed cap
    SPEED_DECREMENT: 2  // Amount to subtract from delay per apple eaten
};

// ==========================================
// ENTITIES
// ==========================================

/**
 * Encapsulates all domain logic for the Snake itself.
 * Excludes rendering concerns.
 */
class Snake {
    constructor() {
        this.reset();
    }

    reset() {
        // Initial state: Start moving right with 3 segments
        this.body = [
            { x: 160, y: 200 }, // Head
            { x: 140, y: 200 },
            { x: 120, y: 200 }  // Tail
        ];
        this.direction = { x: parseInt(CONFIG.GRID_SIZE), y: 0 };
        this.nextDirection = { x: parseInt(CONFIG.GRID_SIZE), y: 0 };
    }

    setDirection(dx, dy) {
        // Core anti-reversal logic: prevents snake from reversing directly into itself
        const isReversingX = this.direction.x !== 0 && dx !== 0; // if moving X, block other X changes
        const isReversingY = this.direction.y !== 0 && dy !== 0; // if moving Y, block other Y changes

        if (isReversingX || isReversingY) return;

        this.nextDirection = { x: dx, y: dy };
    }

    update() {
        // Apply pending direction (prevents multi-key press skipping bugs)
        this.direction = { ...this.nextDirection };

        const currentHead = this.body[0];
        const newHead = {
            x: currentHead.x + this.direction.x,
            y: currentHead.y + this.direction.y
        };

        // Push to front (movement)
        this.body.unshift(newHead);

        return newHead; // Engine decides if tail gets removed based on collision
    }

    shrink() {
        this.body.pop();
    }

    checkSelfCollision(head) {
        // Start from index 1 because index 0 is the newly added head
        for (let i = 1; i < this.body.length; i++) {
            if (this.body[i].x === head.x && this.body[i].y === head.y) {
                return true;
            }
        }
        return false;
    }

    checkWallCollision(head, maxLimit) {
        return head.x < 0 || head.x >= maxLimit || head.y < 0 || head.y >= maxLimit;
    }
}

/**
 * Handles Food spawn logic constraints.
 */
class Food {
    constructor(maxLimit, size) {
        this.maxLimit = maxLimit;
        this.size = size;
        this.position = { x: 0, y: 0 };
    }

    spawn(snakeBody) {
        let attempts = 0;
        let validPosition = false;

        // Loop until a spot not currently occupied by the snake is found
        while (!validPosition && attempts < 100) {
            this.position = {
                x: utils.getRandomCoordinate(0, this.maxLimit, this.size),
                y: utils.getRandomCoordinate(0, this.maxLimit, this.size)
            };

            // Returns true if NO snake segment is at this position
            validPosition = !snakeBody.some(segment =>
                segment.x === this.position.x && segment.y === this.position.y
            );
            attempts++;
        }
    }
}

// ==========================================
// UI & RENDERING CONTROLLER
// ==========================================
/**
 * Dedicated layer explicitly for DOM interactions and Canvas rendering
 */
class UIController {
    constructor() {
        // DOM Elements
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.scoreDisplay = document.getElementById('current-score');
        this.highScoreDisplay = document.getElementById('high-score');

        this.overlay = document.getElementById('game-overlay');
        this.finalScoreDisplay = document.getElementById('final-score');
        this.restartBtn = document.getElementById('restart-btn');

        // Mobile Controls
        this.btnUp = document.getElementById('btn-up');
        this.btnDown = document.getElementById('btn-down');
        this.btnLeft = document.getElementById('btn-left');
        this.btnRight = document.getElementById('btn-right');

        // System styling extraction (allows CSS theming to control canvas styling transparently)
        this.styles = getComputedStyle(document.documentElement);
    }

    getCssColor(varName, fallback) {
        return this.styles.getPropertyValue(varName).trim() || fallback;
    }

    clearBoard() {
        this.ctx.fillStyle = this.getCssColor('--board-bg', '#0f172a');
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawSnake(snake) {
        const primaryColor = this.getCssColor('--snake-color', '#10b981');
        const headColor = this.getCssColor('--snake-head-color', '#34d399');
        const radius = CONFIG.GRID_SIZE / 2;

        this.ctx.fillStyle = primaryColor;

        // Draw the body (everything except the head)
        for (let i = 1; i < snake.body.length; i++) {
            const current = snake.body[i];
            const prev = snake.body[i - 1]; // Segment closer to head

            // Draw a circle for each segment to create rounded joints
            this.ctx.beginPath();
            this.ctx.arc(
                current.x + radius,
                current.y + radius,
                radius - 1,
                0,
                Math.PI * 2
            );
            this.ctx.fill();

            // Bridge gaps between current block and previous block to make a continuous shape
            const dx = prev.x - current.x;
            const dy = prev.y - current.y;

            if (Math.abs(dx) <= CONFIG.GRID_SIZE && Math.abs(dy) <= CONFIG.GRID_SIZE) {
                if (dx !== 0) { // Horizontal connection
                    const minX = Math.min(current.x, prev.x);
                    this.ctx.fillRect(minX + radius, current.y + 1, CONFIG.GRID_SIZE, CONFIG.GRID_SIZE - 2);
                } else if (dy !== 0) { // Vertical connection
                    const minY = Math.min(current.y, prev.y);
                    this.ctx.fillRect(current.x + 1, minY + radius, CONFIG.GRID_SIZE - 2, CONFIG.GRID_SIZE);
                }
            }
        }

        // Draw the Head
        const head = snake.body[0];

        // Ensure head base layer bridges smoothly to the body
        if (snake.body.length > 1) {
            const next = snake.body[1];
            const dx = next.x - head.x;
            const dy = next.y - head.y;
            this.ctx.fillStyle = primaryColor;
            if (Math.abs(dx) <= CONFIG.GRID_SIZE && Math.abs(dy) <= CONFIG.GRID_SIZE) {
                if (dx !== 0) {
                    const minX = Math.min(head.x, next.x);
                    this.ctx.fillRect(minX + radius, head.y + 1, CONFIG.GRID_SIZE, CONFIG.GRID_SIZE - 2);
                } else if (dy !== 0) {
                    const minY = Math.min(head.y, next.y);
                    this.ctx.fillRect(head.x + 1, minY + radius, CONFIG.GRID_SIZE - 2, CONFIG.GRID_SIZE);
                }
            }
        }

        // Now overlay head styling
        this.ctx.fillStyle = headColor;
        this.ctx.beginPath();
        this.ctx.arc(head.x + radius, head.y + radius, radius - 1, 0, Math.PI * 2);
        this.ctx.fill();

        // Add Eyes on the Head
        this.ctx.fillStyle = 'white';
        const eyeRadius = 3;
        let eye1X, eye1Y, eye2X, eye2Y;

        // Positioning eyes dynamically based on movement direction
        const dir = snake.direction;

        if (dir.x > 0) { // Facing Right
            eye1X = head.x + radius + 3; eye1Y = head.y + radius - 4;
            eye2X = head.x + radius + 3; eye2Y = head.y + radius + 4;
        } else if (dir.x < 0) { // Facing Left
            eye1X = head.x + radius - 3; eye1Y = head.y + radius - 4;
            eye2X = head.x + radius - 3; eye2Y = head.y + radius + 4;
        } else if (dir.y < 0) { // Facing Up
            eye1X = head.x + radius - 4; eye1Y = head.y + radius - 3;
            eye2X = head.x + radius + 4; eye2Y = head.y + radius - 3;
        } else { // Facing Down (or default initial state moving right initially but direction empty yet?)
            // Fallback to Down visually, or if moving down
            eye1X = head.x + radius - 4; eye1Y = head.y + radius + 3;
            eye2X = head.x + radius + 4; eye2Y = head.y + radius + 3;
            // Let's accurately handle if dir.x === 0 and y === 0 at start
            if (dir.x === 0 && dir.y === 0) {
                // Because we started with a right direction initially, let's treat it as right
                eye1X = head.x + radius + 3; eye1Y = head.y + radius - 4;
                eye2X = head.x + radius + 3; eye2Y = head.y + radius + 4;
            }
        }

        this.ctx.beginPath(); this.ctx.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2); this.ctx.fill();

        // Draw black pupils
        this.ctx.fillStyle = 'black';
        this.ctx.beginPath(); this.ctx.arc(eye1X, eye1Y, 1.5, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(eye2X, eye2Y, 1.5, 0, Math.PI * 2); this.ctx.fill();
    }

    drawFood(food) {
        this.ctx.fillStyle = this.getCssColor('--danger', '#ef4444');
        this.ctx.beginPath();

        // Draw food as a circle
        const radius = (CONFIG.GRID_SIZE / 2) - 1;
        this.ctx.arc(
            food.position.x + CONFIG.GRID_SIZE / 2,
            food.position.y + CONFIG.GRID_SIZE / 2,
            radius,
            0,
            Math.PI * 2
        );
        this.ctx.fill();
    }

    updateScores(score, highScore) {
        this.scoreDisplay.textContent = score;
        this.highScoreDisplay.textContent = highScore;
    }

    showGameOver(score) {
        this.finalScoreDisplay.textContent = score;
        this.overlay.classList.remove('hidden');
    }

    hideGameOver() {
        this.overlay.classList.add('hidden');
    }
}

// ==========================================
// MAIN GAME ENGINE / CONTROLLER
// ==========================================
/**
 * Serves as the central mediator or controller orchestrating models (Snake, Food)
 * and view (UIController) transitions based on input limits & game ticks.
 */
class Game {
    constructor() {
        // Instantiate Dependencies
        this.snake = new Snake();
        this.food = new Food(CONFIG.CANVAS_SIZE, CONFIG.GRID_SIZE);
        this.ui = new UIController();

        // State
        this.score = 0;
        this.highScore = Number(localStorage.getItem('snakeHighScore')) || 0;
        this.state = 'MENU'; // States: MENU, RUNNING, GAMEOVER

        // Loop controls
        this.currentSpeed = CONFIG.INITIAL_SPEED; // delay between frames (ms)
        this.lastRenderTime = 0;
        this.animationFrameId = null;

        this.init();
    }

    init() {
        this.ui.updateScores(this.score, this.highScore);
        this.bindEvents();

        // Render initial static frame
        this.ui.clearBoard();
        this.ui.drawSnake(this.snake);
    }

    bindEvents() {
        // Setup UI listener
        this.ui.restartBtn.addEventListener('click', () => {
            if (this.state === 'GAMEOVER') {
                this.reset();
                this.start();
            }
        });

        // Setup Keyboard listeners
        window.addEventListener('keydown', (e) => this.handleInput(e));

        // Setup Mobile Touch Listeners 
        // We use touchstart to prevent 300ms click delay on some mobile devices and make controls snappy
        const addControl = (btn, key) => {
            const trigger = (e) => {
                e.preventDefault(); // Prevents double firing from mouse events later or scrolling
                this.handleInput({ key: key, preventDefault: () => { } });
            };
            btn.addEventListener('touchstart', trigger, { passive: false });
            btn.addEventListener('mousedown', trigger); // Fallback for clicking UI with mouse
        };

        addControl(this.ui.btnUp, 'ArrowUp');
        addControl(this.ui.btnDown, 'ArrowDown');
        addControl(this.ui.btnLeft, 'ArrowLeft');
        addControl(this.ui.btnRight, 'ArrowRight');
    }

    handleInput(e) {
        const allowedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' ', 'Enter'];
        if (allowedKeys.includes(e.key)) {
            // Prevent scrolling on arrows/space
            if (e.key !== 'Enter') e.preventDefault();
        } else {
            return;
        }

        // Game Over handling (Space/Enter restarts)
        if (this.state === 'GAMEOVER') {
            if (e.key === ' ' || e.key === 'Enter') {
                this.reset();
                this.start();
            }
            return;
        }

        // Menu Start handling
        let startedNow = false;
        if (this.state === 'MENU' && allowedKeys.slice(0, 8).includes(e.key)) {
            this.start();
            startedNow = true;
        }

        const grid = CONFIG.GRID_SIZE;
        const key = e.key.toLowerCase();

        // Map keys to directions
        if (key === 'arrowup' || key === 'w') {
            if (startedNow && this.snake.direction.x !== 0) this.snake.setDirection(0, -grid); // Edge-case initial up
            else this.snake.setDirection(0, -grid);
        }
        else if (key === 'arrowdown' || key === 's') this.snake.setDirection(0, grid);
        else if (key === 'arrowleft' || key === 'a') this.snake.setDirection(-grid, 0);
        else if (key === 'arrowright' || key === 'd') this.snake.setDirection(grid, 0);
    }

    reset() {
        this.snake.reset();
        this.score = 0;
        this.currentSpeed = CONFIG.INITIAL_SPEED;

        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        this.ui.hideGameOver();
        this.ui.updateScores(this.score, this.highScore);
    }

    start() {
        this.state = 'RUNNING';
        this.food.spawn(this.snake.body);

        // Begin recursive loop
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    gameOver() {
        this.state = 'GAMEOVER';
        utils.playSound('gameover');

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snakeHighScore', this.highScore.toString());
        }

        this.ui.showGameOver(this.score);
        this.ui.updateScores(this.score, this.highScore);
    }

    /**
     * Replaces standard setInterval with requestAnimationFrame for 
     * smoother display synergy, better battery preservation scaling.
     */
    gameLoop(currentTime) {
        if (this.state !== 'RUNNING') return;

        this.animationFrameId = window.requestAnimationFrame(this.gameLoop.bind(this));

        const timeSinceLastRender = currentTime - this.lastRenderTime;

        // Only calculate physics based on our configurable speed parameter
        // Ensures gameplay pace is separated from monitor refresh rates
        if (timeSinceLastRender < this.currentSpeed) return;

        this.lastRenderTime = currentTime;
        this.tick();
        this.render();
    }

    // Process logic/physics calculations
    tick() {
        const head = this.snake.update();

        // 1. Collision verification
        if (this.snake.checkWallCollision(head, CONFIG.CANVAS_SIZE) ||
            this.snake.checkSelfCollision(head)) {
            this.gameOver();
            return;
        }

        // 2. Food verification
        if (head.x === this.food.position.x && head.y === this.food.position.y) {
            // Success condition
            utils.playSound('eat');
            this.score += 10;
            this.currentSpeed = Math.max(CONFIG.MIN_SPEED, this.currentSpeed - CONFIG.SPEED_DECREMENT); // speed scale mapping
            this.ui.updateScores(this.score, this.highScore);

            this.food.spawn(this.snake.body);
            // Notice: We omit `this.snake.shrink()` meaning the snake naturally extends.
        } else {
            // Failure condition (no food consumed) -> pop tail
            this.snake.shrink();
        }
    }

    // Pushes calculated state to UI layer
    render() {
        this.ui.clearBoard();
        this.ui.drawFood(this.food);
        this.ui.drawSnake(this.snake);
    }
}

// ==========================================
// BOOTSTRAP
// ==========================================
// Using DOMContentLoaded ensures layout finishes rendering before code executes
document.addEventListener('DOMContentLoaded', () => {
    // Instantiate game logic into isolation
    new Game();
});
