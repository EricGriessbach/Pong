const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const collisionCanvas = document.getElementById('collisionCanvas');
const collisionCtx = collisionCanvas.getContext('2d');
const postCollisionCanvas = document.getElementById('postCollisionCanvas');
const postCollisionCtx = postCollisionCanvas.getContext('2d');

let collisionData = null;
let postCollisionData = null;
let captureNextFrame = false;
// Physics parameters
const startVel = 5;
const damping = 0.98; // Air resistance
const e = 0.7; // Coefficient of restitution
const TOLERANCE = 0.00001; // Tolerance for CCD
const MAX_ITERATIONS = 100; // Max iterations for bisection
let COLLISION = false;
let timeBetweenFrames = 0;
const BALL_START_POS = { x: canvas.width / 2, y: 100 };
const BALL_START_VEL = { x: 0, y: 4 };
const TARGET_RADIUS = 50; // Adjust the radius as needed
const t = (canvas.height - BALL_START_POS.y) / BALL_START_VEL.y;

const TARGET_POS = {
    x: canvas.width / 2, // Center horizontally
    y: 200  // Adjust vertical position as needed
};
const VELOCITY_THRESHOLD = 0.1; // Minimum velocity to consider ball "stopped"
let score = 0;
let trials = 0;
let isPaused = false;
let paddleAngle = 0; // Angle in radians
let collisionCount = 0;

// Game objects
let ball = {
    pos: {x: canvas.width / 2, y: 100 },
    vel: { x: 0, y: 5 },
    upwardDamping: 0.93,
    prevPos: {x: canvas.width / 2, y: 100 },
    radius: 20,
    mass: 1,
    angle: 0,
    angularVel: 0,
    spinEffect: 0.1, // Adjust as needed
    angularDamping: 0.98 // Angular damping
};

let paddle = {
    pos: { x: canvas.width / 2 - 75, y: canvas.height - 100 },
    prevPos: { x: canvas.width / 2 - 75, y: canvas.height - 100 },
    vel: { x: 0, y: 0 },
    width: 150,
    height: 20,
    stiffness: 0.5, // Spring stiffness
};

const maxDx = canvas.width - ball.radius - BALL_START_POS.x;
const minDx = - (BALL_START_POS.x - ball.radius);
const maxVx = maxDx / t;
const minVx = minDx / t;

// Mouse control
let mouseY = paddle.pos.y + paddle.height / 2;
let mouseX = paddle.pos.x + paddle.width / 2;
canvas.addEventListener('mousemove', function (e) {
    const rect = canvas.getBoundingClientRect();
    mouseY = e.clientY - rect.top;
    mouseX = e.clientX - rect.left;
});

// Function to reset ball
function resetBall() {
    // Randomize starting x position within canvas width
    ball.pos.x = ball.radius + Math.random() * (canvas.width - 2 * ball.radius);
    ball.prevPos.x = ball.pos.x;

    // Fixed starting y position
    ball.pos.y = BALL_START_POS.y;
    ball.prevPos.y = ball.pos.y;

    // Time to reach bottom
    const t = (canvas.height - ball.pos.y) / BALL_START_VEL.y;

    // Calculate min and max x displacement to stay within canvas
    const maxDx = (canvas.width - ball.radius) - ball.pos.x; // Right boundary
    const minDx = ball.radius - ball.pos.x; // Left boundary

    // Corresponding velocities
    const maxVx = maxDx / t;
    const minVx = minDx / t;

    // Randomize x velocity within calculated range
    ball.vel.x = minVx + Math.random() * (maxVx - minVx);
    ball.angularVel = 0; // Reset angular velocity

    // Fixed starting y velocity
    ball.vel.y = BALL_START_VEL.y;
    trials++;
    isPaused = false;
}

// Function to toggle pause state
function togglePause() {
    isPaused = !isPaused;
    if (!isPaused) {
        collisionData = null; // Clear collision visualization when resuming
        timeBetweenFrames = performance.now(); // Reset timing
    }
}

// Add event listener for "p" key
document.addEventListener('keydown', function(event) {
    if (isPaused && event.code === 'Space') {
        isPaused = false;
        collisionData = null; // Clear collision visualization
        postCollisionData = null; // Clear post-collision data if needed
        timeBetweenFrames = performance.now(); // Reset timing
    }
    // Reset game on "r" key
    if (event.code === 'KeyR') {
        score = 0;
        trials = 0;
        resetBall();
    }
});

document.addEventListener('wheel', function (e) {
    paddleAngle += e.deltaY * 0.001; // Adjust the sensitivity as needed
});

function drawCollisionData() {
    if (!collisionData) return;

    // Clear the canvas
    collisionCtx.clearRect(0, 0, collisionCanvas.width, collisionCanvas.height);

    // Set up scaling
    const scale = 2; // Adjust as needed to fit the canvas
    collisionCtx.save();
    collisionCtx.translate(collisionCanvas.width / 2, collisionCanvas.height / 2);
    collisionCtx.scale(scale, scale);

    // Compute paddle center
    const paddleCenter = {
        x: collisionData.paddlePos.x + collisionData.paddleWidth / 2,
        y: collisionData.paddlePos.y + collisionData.paddleHeight / 2
    };

    // Compute ball position relative to paddle center
    const relBallPos = {
        x: collisionData.ballPos.x - paddleCenter.x,
        y: collisionData.ballPos.y - paddleCenter.y
    };

    // Rotate ball position into paddle's local space
    const cosA = Math.cos(-collisionData.paddleAngle);
    const sinA = Math.sin(-collisionData.paddleAngle);
    const localBallPos = {
        x: relBallPos.x * cosA - relBallPos.y * sinA,
        y: relBallPos.x * sinA + relBallPos.y * cosA
    };

    // Transform ball velocity into paddle's local space
    const localBallVel = {
        x: collisionData.ballVel.x * cosA - collisionData.ballVel.y * sinA,
        y: collisionData.ballVel.x * sinA + collisionData.ballVel.y * cosA
    };
    // Draw paddle in local coordinates
    collisionCtx.save();
    collisionCtx.translate(-collisionData.paddleWidth / 2, -collisionData.paddleHeight / 2);
    collisionCtx.beginPath();
    collisionCtx.rect(0, 0, collisionData.paddleWidth, collisionData.paddleHeight);
    collisionCtx.fillStyle = '#28a745';
    collisionCtx.fill();
    collisionCtx.closePath();
    collisionCtx.restore();

    // Draw ball in local coordinates
    collisionCtx.beginPath();
    collisionCtx.arc(localBallPos.x, localBallPos.y, collisionData.ballRadius, 0, Math.PI * 2);
    collisionCtx.fillStyle = '#007bff';
    collisionCtx.fill();
    collisionCtx.closePath();

    // Draw velocity vector
    collisionCtx.beginPath();
    collisionCtx.moveTo(localBallPos.x, localBallPos.y);
    collisionCtx.lineTo(
        localBallPos.x + localBallVel.x * 10,
        localBallPos.y + localBallVel.y * 10
    );
    collisionCtx.strokeStyle = '#ff0000';
    collisionCtx.lineWidth = 2;
    collisionCtx.stroke();
    collisionCtx.closePath();

    collisionCtx.restore();
}
function drawPostCollisionData() {
    if (!postCollisionData) return;

    // Clear the canvas
    postCollisionCtx.clearRect(0, 0, postCollisionCanvas.width, postCollisionCanvas.height);

    // Set up scaling
    const scale = 2; // Adjust as needed
    postCollisionCtx.save();
    postCollisionCtx.translate(postCollisionCanvas.width / 2, postCollisionCanvas.height / 2);
    postCollisionCtx.scale(scale, scale);

    // Compute paddle center
    const paddleCenter = {
        x: 0,
        y: 0
    };

    // Transform to paddle's local coordinate system
    postCollisionCtx.save();
    postCollisionCtx.translate(paddleCenter.x, paddleCenter.y);
    //postCollisionCtx.rotate(postCollisionData.paddleAngle);

    // Draw paddle centered at origin
    postCollisionCtx.beginPath();
    postCollisionCtx.rect(
        -postCollisionData.paddleWidth / 2,
        -postCollisionData.paddleHeight / 2,
        postCollisionData.paddleWidth,
        postCollisionData.paddleHeight
    ); 
    postCollisionCtx.fillStyle = '#28a745';
    postCollisionCtx.fill();
    postCollisionCtx.closePath();

    // Compute ball position relative to paddle center
    const relBallPos = {
        x: postCollisionData.ballPos.x - (postCollisionData.paddlePos.x + postCollisionData.paddleWidth / 2),
        y: postCollisionData.ballPos.y - (postCollisionData.paddlePos.y + postCollisionData.paddleHeight / 2)
    };

    // Rotate ball position into paddle's local space
    const cosA = Math.cos(-postCollisionData.paddleAngle);
    const sinA = Math.sin(-postCollisionData.paddleAngle);
    const localBallPos = {
        x: relBallPos.x * cosA - relBallPos.y * sinA,
        y: relBallPos.x * sinA + relBallPos.y * cosA
    };

    // Draw ball in paddle's local coordinate system
    postCollisionCtx.beginPath();
    postCollisionCtx.arc(localBallPos.x, localBallPos.y, postCollisionData.ballRadius, 0, Math.PI * 2);
    postCollisionCtx.fillStyle = '#007bff';
    postCollisionCtx.fill();
    postCollisionCtx.closePath();

    // Transform ball velocity into paddle's local space
    const localBallVel = {
        x: postCollisionData.ballVel.x * cosA - postCollisionData.ballVel.y * sinA,
        y: postCollisionData.ballVel.x * sinA + postCollisionData.ballVel.y * cosA
    };

    // Draw velocity vector
    postCollisionCtx.beginPath();
    postCollisionCtx.moveTo(localBallPos.x, localBallPos.y);
    postCollisionCtx.lineTo(
        localBallPos.x + localBallVel.x * 10,
        localBallPos.y + localBallVel.y * 10
    );
    postCollisionCtx.strokeStyle = '#ff0000';
    postCollisionCtx.lineWidth = 2;
    postCollisionCtx.stroke();
    postCollisionCtx.closePath();

    postCollisionCtx.restore(); // Restore after drawing in paddle's local space
    postCollisionCtx.restore(); // Restore initial context
}
function update() {
    if (isPaused && captureNextFrame) {
        // Allow update to run one more time to capture post-collision data
    } else if (isPaused) {
        return; // Skip update if paused
    }

    // Get time between frames
    let currentTime = performance.now();
    let deltaTime = (currentTime - timeBetweenFrames) / 1000;
    timeBetweenFrames = performance.now();
    // Store previous positions
    paddle.prevPos.x = paddle.pos.x;
    paddle.prevPos.y = paddle.pos.y;

    // Update paddle position
    paddle.pos.x = mouseX - paddle.width / 2;
    paddle.pos.y = mouseY - paddle.height / 2;

    // Calculate paddle velocity
    paddle.vel.x = paddle.pos.x - paddle.prevPos.x;
    paddle.vel.y = paddle.pos.y - paddle.prevPos.y;
    // Constrain paddle within canvas vertically
    if (paddle.pos.y < 0) paddle.pos.y = 0;
    if (paddle.pos.y + paddle.height > canvas.height) paddle.pos.y = canvas.height - paddle.height;

    // Constrain paddle within canvas horizontally
    if (paddle.pos.x < 0) paddle.pos.x = 0;
    if (paddle.pos.x + paddle.width > canvas.width) paddle.pos.x = canvas.width - paddle.width;
    // Store previous positions
    ball.prevPos.x = ball.pos.x;
    ball.prevPos.y = ball.pos.y;


    ball.pos.y += ball.vel.y;
    ball.pos.x += ball.vel.x;
    // Calculate Magnus acceleration components
    const magnusAccelX = -ball.angularVel * ball.vel.y * ball.spinEffect;
    const magnusAccelY = ball.angularVel * ball.vel.x * ball.spinEffect;
    // Update ball velocity with Magnus effect
    ball.vel.x += magnusAccelX;
    ball.vel.y += magnusAccelY;
    ball.angle += ball.angularVel;
    // Tentative position update (without collision)
    const collisionResult = detectCollision(deltaTime);

    if (collisionResult.collides) {
        handleCollision(collisionResult);
    } 
    if (ball.vel.y < 0) { // Moving upward
        ball.vel.y *= ball.upwardDamping;
        ball.vel.x *= ball.upwardDamping;
        ball.angularVel *= ball.angularDamping; // Adjust damping as needed

    }

    if (captureNextFrame) {
        captureNextFrame = false; // Reset the flag
    }

    // Modified boundary and halt conditions in update()
    if (ball.pos.y - ball.radius < 0 || 
        ball.pos.y + ball.radius > canvas.height ||
        ball.pos.x + ball.radius < 0 || 
        ball.pos.x - ball.radius > canvas.width ||
        (Math.abs(ball.vel.y) + Math.abs(ball.vel.x)) < VELOCITY_THRESHOLD) { // Reset if stopped or out of bounds
        
        const dx = ball.pos.x - TARGET_POS.x;
        const dy = ball.pos.y - TARGET_POS.y;
        const distanceSquared = dx * dx + dy * dy;
        const radiiSum = ball.radius + TARGET_RADIUS;
        
        if (distanceSquared <= radiiSum * radiiSum && Math.abs(ball.vel.y) < VELOCITY_THRESHOLD) {
            score++; // Increment score only if stopped in target
        }
        resetBall();
    }
}

function detectCollision(deltaTime) {
    const substeps = 10;
    const subDeltaTime = deltaTime / substeps;
    for (let i = 0; i < substeps; i++) {
        const t = i / substeps; // Normalized time [0,1]

        // Interpolate positions
        const ballPos = {
            x: ball.prevPos.x + t * (ball.pos.x - ball.prevPos.x),
            y: ball.prevPos.y + t * (ball.pos.y - ball.prevPos.y)
        };

        const paddlePos = {
            x: paddle.prevPos.x + t * (paddle.pos.x - paddle.prevPos.x),
            y: paddle.prevPos.y + t * (paddle.pos.y - paddle.prevPos.y)
        };

        // Translate to paddle center
        const dx = ballPos.x - (paddlePos.x + paddle.width / 2);
        const dy = ballPos.y - (paddlePos.y + paddle.height / 2);

        // Rotate coordinates
        const cos = Math.cos(-paddleAngle);
        const sin = Math.sin(-paddleAngle);

        const localBallPos = {
            x: dx * cos - dy * sin,
            y: dx * sin + dy * cos
        };

        // Paddle half dimensions
        const halfWidth = paddle.width / 2;
        const halfHeight = paddle.height / 2;

        // Closest point on paddle rectangle
        const closest = {
            x: Math.max(-halfWidth, Math.min(halfWidth, localBallPos.x)),
            y: Math.max(-halfHeight, Math.min(halfHeight, localBallPos.y))
        };

        // Distance between ball and closest point
        const dxLocal = localBallPos.x - closest.x;
        const dyLocal = localBallPos.y - closest.y;
        const distanceSquared = dxLocal * dxLocal + dyLocal * dyLocal;
        if (distanceSquared <= ball.radius * ball.radius) {
            COLLISION = true;
            setTimeout(() => COLLISION = false, 500);
            return {
                collides: true,
                tCollide: t
            };
        }
    }

    return {
        collides: false,
        tCollide: 1
    };
}

function handleCollision(collisionResult) {
    // Calculate collision point in world coordinates

    const collisionPoint = {
        x: ball.prevPos.x + (ball.pos.x - ball.prevPos.x) * (collisionResult.tCollide),
        y: ball.prevPos.y + (ball.pos.y - ball.prevPos.y) * (collisionResult.tCollide)
    };

    // Calculate paddle center
    const paddleCenter = {
        x: paddle.pos.x + paddle.width / 2,
        y: paddle.pos.y + paddle.height / 2
    };

    // Relative collision point from paddle center
    const relCollision = {
        x: collisionPoint.x - paddleCenter.x,
        y: collisionPoint.y - paddleCenter.y
    };

    // Transform collision point to paddle's local space
    const cosA = Math.cos(-paddleAngle);
    const sinA = Math.sin(-paddleAngle);

    const localCollision = {
        x: relCollision.x * cosA - relCollision.y * sinA,
        y: relCollision.x * sinA + relCollision.y * cosA
    };

    // Ball's velocity relative to paddle
    const relVel = {
        x: ball.vel.x - paddle.vel.x,
        y: ball.vel.y - paddle.vel.y
    };

    // Transform relative velocity to paddle's local space
    const localVel = {
        x: relVel.x * cosA - relVel.y * sinA,
        y: relVel.x * sinA + relVel.y * cosA
    };

    // Update ball's angular velocity
    const frictionCoefficient = 0.1; // Adjust as needed
    const radius = ball.radius;
    const impulse = frictionCoefficient * localVel.x;
    ball.angularVel += impulse / radius;

    // 7. Reflect the velocity in paddle's local space
    localVel.y = -e * localVel.y;  // Only reflect the normal component

    // Save collision data
    collisionData = {
        ballPos: { x: collisionPoint.x, y: collisionPoint.y },
        ballVel: { x: ball.vel.x, y: ball.vel.y },
        paddlePos: { x: paddle.pos.x, y: paddle.pos.y },
        paddleAngle: paddleAngle,
        paddleWidth: paddle.width,
        paddleHeight: paddle.height,
        ballRadius: ball.radius
    };

    // 8. Transform velocity back to world space
    const cosNegA = Math.cos(-paddleAngle);
    const sinNegA = Math.sin(-paddleAngle);
    const newRelVel = {
        x: localVel.x * cosNegA + localVel.y * sinNegA,
        y: -localVel.x * sinNegA + localVel.y * cosNegA
    };

    // 9. Add paddle velocity back to get final ball velocity
    ball.vel.x = newRelVel.x + paddle.vel.x;
    ball.vel.y = newRelVel.y + paddle.vel.y;
    // 10. Update ball position
    const remainingTime = 1 - collisionResult.tCollide;

    ball.pos.x = collisionPoint.x + ball.vel.x * remainingTime;
    ball.pos.y = collisionPoint.y + ball.vel.y * remainingTime;

    // Store previous positions
    ball.prevPos.x = ball.pos.x; 
    ball.prevPos.y = ball.pos.y;
    collisionCount++;
    if (collisionCount === 2) {
        //isPaused = true;
    }
    
    captureNextFrame = true;
    postCollisionData = {
        ballPos: { x: ball.pos.x, y: ball.pos.y },
        ballVel: { x: ball.vel.x, y: ball.vel.y },
        paddlePos: { x: paddle.pos.x, y: paddle.pos.y },
        paddleAngle: paddleAngle,
        ballRadius: ball.radius,
        paddleWidth: paddle.width,
        paddleHeight: paddle.height
    };
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(TARGET_POS.x, TARGET_POS.y, TARGET_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#ffc107';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.closePath();

    // Draw ball with rotation
    ctx.save();
    ctx.translate(ball.pos.x, ball.pos.y);
    ctx.rotate(ball.angle);
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#007bff';
    ctx.fill();
    ctx.closePath();

    // Draw cross inside the ball
    ctx.beginPath();
    // Vertical line
    ctx.moveTo(0, -ball.radius);
    ctx.lineTo(0, ball.radius);
    // Horizontal line
    ctx.moveTo(-ball.radius, 0);
    ctx.lineTo(ball.radius, 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();
    ctx.restore();

    // Draw paddle
    ctx.save();
    ctx.translate(paddle.pos.x + paddle.width / 2, paddle.pos.y + paddle.height / 2);
    ctx.rotate(paddleAngle);
    ctx.translate(-paddle.width / 2, -paddle.height / 2);
    ctx.beginPath();
    ctx.rect(0, 0, paddle.width, paddle.height);
    ctx.fillStyle = COLLISION ? '#ff0000' : '#28a745';
    ctx.fill();
    ctx.closePath();
    ctx.restore();

    // Draw score and trials
    ctx.font = '24px Arial';
    ctx.fillStyle = '#000';
    ctx.fillText(`Score: ${score}`, 10, 30);
    ctx.fillText(`Trial: ${trials}`, 10, 60);

    // Draw collision data
    drawCollisionData();

    // Draw post-collision data
    drawPostCollisionData();

    // Display pause message if the game is paused
    if (isPaused) {
        collisionCount = 0;
        ctx.font = '48px Arial';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.textAlign = 'center';
        ctx.fillText('Game Paused', canvas.width / 2, canvas.height / 2);
        ctx.font = '24px Arial';
        ctx.fillText('Press Space to Continue', canvas.width / 2, canvas.height / 2 + 40);
    }
}

// Modify the game loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();