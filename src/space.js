//board
let tileSize = 32;
let rows = 16;
let columns = 16;

let board;
let boardWidth = tileSize * columns;
let boardHeight = tileSize * rows;
let context;
let initialized = false;

//ship
let shipWidth = tileSize * 2;
let shipHeight = tileSize;
let shipX = tileSize * columns/2 - tileSize;
let shipY = tileSize * rows - tileSize*2;

let ship = {
    x: shipX,
    y: shipY,
    width: shipWidth,
    height: shipHeight
}

let shipImg;
let shipVelocityX = tileSize; //ship moves one tile per click on x axis
let facemeshVelocityX = tileSize/2; // smoother per-frame movement for facemesh
let maxAxisSpeed = 220; // pixels/sec for analog tilt movement
let lastTime = performance.now();

//aliens
let alienArray = [];
let alienWidth = tileSize * 2;
let alienHeight = tileSize;
let alienX = tileSize;
let alienY = tileSize;

let alienImg;
let alienRows = 2;
let alienColumns = 3;
let alienCount = 0; //number of aliens to defeat
let alienVelocityX = 1;

//bullets
let bulletArray = [];
let bulletVelocityY = -10; //moving up so it is negative

//score
let score = 0;
let gameOver = false;

// Facemesh controls
let gameControls = {
    left: false,
    right: false,
    mouthOpen: false,
    axisX: 0,
};
let lastShotTime = 0;
let shootCooldown = 150; // milliseconds between shots

// Expose function to window for React/Facemesh to call
window.updateGameControls = function(controls) {
    gameControls.left = !!controls.left;
    gameControls.right = !!controls.right;
    gameControls.mouthOpen = !!controls.mouthOpen;
    gameControls.axisX = typeof controls.axisX === 'number' ? Math.max(-1, Math.min(1, controls.axisX)) : 0;
};

// Initialize game
function initializeGame() {
    if (initialized) return;
    board = document.getElementById("board");
    if (!board) {
        setTimeout(initializeGame, 50);
        return;
    }

    initialized = true;
    lastTime = performance.now();
    
    board.width = boardWidth;
    board.height = boardHeight;
    context = board.getContext("2d");

    //load initial ship image
    shipImg = new Image();
    shipImg.src = "/images/ship.png";
    shipImg.onload = function() {
        if (context) context.drawImage(shipImg, ship.x, ship.y, ship.width, ship.height);
    }

    //load alien ship image
    alienImg = new Image();
    alienImg.src = "/images/alien.png";
    createAliens();

    requestAnimationFrame(update);

    document.addEventListener("keydown", moveShip);
    document.addEventListener("keyup", shoot);
}

// Start the game on demand (called from React Start button)
window.startSpaceGame = function() {
    initializeGame();
};

function update() {
    requestAnimationFrame(update);

    if (gameOver) return;

    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000); // cap dt to avoid big jumps
    lastTime = now;
    const frameScale = dt * 60; // scale factor so existing per-frame speeds remain similar at ~60fps

    //ship
    context.clearRect(0,0, board.width, board.height);
    
    // Handle facemesh-based movement
    if (Math.abs(gameControls.axisX) > 0.001) {
        // Analog tilt control with speed proportional to tilt
        ship.x += gameControls.axisX * maxAxisSpeed * dt;
    } else {
        // Fallback to binary left/right
        if (gameControls.left && ship.x - facemeshVelocityX >= 0) {
            ship.x -= facemeshVelocityX * frameScale;
        } else if (gameControls.right && ship.x + facemeshVelocityX + ship.width <= boardWidth) {
            ship.x += facemeshVelocityX * frameScale;
        }
    }
    // Clamp within bounds
    if (ship.x < 0) ship.x = 0;
    if (ship.x + ship.width > boardWidth) ship.x = boardWidth - ship.width;
    
    // Handle facemesh-based shooting
    if (gameControls.mouthOpen) {
        const now = Date.now();
        if (now - lastShotTime > shootCooldown) {
            createBullet();
            lastShotTime = now;
        }
    }
    
    context.drawImage(shipImg, ship.x, ship.y, ship.width, ship.height);

    //alien
    for (let i = 0; i < alienArray.length; i++) {
        let alien = alienArray[i];

        if (alien.alive) {
            alien.x += alienVelocityX * frameScale;

            //if alien touches side borders
            if (alien.x  + alien.width >= board.width || alien.x <= 0) {
                alienVelocityX *= (-1);
                alien.x += alienVelocityX*2;

                //move all aliens up by one row
                for (let j = 0; j < alienArray.length; j++) {
                    alienArray[j].y += alienHeight;
                }
            }

            context.drawImage(alien.img, alien.x, alien.y, alien.width, alien.height);

            if (alien.y >= ship.y) gameOver = true;
        }
    }

    //bullets
    for (let i = 0; i < bulletArray.length; i++) {

        let bullet = bulletArray[i];
        bullet.y += bulletVelocityY * frameScale;
        context.fillStyle="white";
        context.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        
        //bullet collision
        for (let j = 0; j < alienArray.length; j++) {
            let alien = alienArray[j];

            if (!bullet.used && alien.alive && detectCollision(bullet, alien)) {
                bullet.used = true;
                alien.alive = false;
                alienCount--;
                score += 100 ;
            }
        }
    }

    //clear bullets
    while (bulletArray.length > 0 && (bulletArray[0].used || bulletArray[0].y < 0)) {
        bulletArray.shift() //remove first element of array
    }

    if (alienCount == 0) {
        alienColumns = Math.min(alienColumns + 1, columns/2 - 2); //cap is at 6 columns of aliens
        alienRows = Math.min(alienRows + 1, rows - 4); //cap 8 at 12 rows of aliens
        alienVelocityX += 0.2

        alienArray = [];
        bulletArray = [];
        createAliens();
    }

    //score
    context.fillStyle="white";
    context.font="16px courier";
    context.fillText(`Score:${score}`, 5, 20);   
}

function moveShip(e) {

    if (gameOver) return;

    if (e.code == "ArrowLeft" && ship.x - shipVelocityX >= 0) {
        ship.x -= shipVelocityX; //moving left one tile
       
        //need to add ship.width because ship.x represents the left edge of the ship
    } else if (e.code == "ArrowRight" && ship.x + shipVelocityX + ship.width <= boardWidth) {
        ship.x += shipVelocityX; //moving right one tile
    }
}

function createAliens() {
    for (let c = 0; c < alienColumns; c++) {
        for (let r = 0; r < alienRows; r++) {
            
            let alien = {
                img: alienImg,
                x: alienX + c*alienWidth,
                y: alienY + r*alienHeight,
                width: alienWidth,
                height: alienHeight,
                alive: true
            }

            alienArray.push(alien);
        }
    }
    alienCount = alienArray.length;
}

function createBullet() {
    let bullet = {
        x: ship.x + shipWidth*15/32,
        y: ship.y,
        width: tileSize/8,
        height: tileSize/2,
        used: false
    }
    bulletArray.push(bullet);
}

function shoot(e) {

    if (gameOver) return;

    if (e.code == "Space") {
        createBullet();
    }
}

function detectCollision(a,b) {
    return a.x < b.x + b.width &&   //a's top left corner doesn't reach b's top right corner
           a.x + a.width > b.x &&   //a's top right corner passes b's top left corner 
           a.y < b.y + b.height &&  //a's top left corner doesn't reach b's bottom left corner
           a.y + a.height > b.y     //a's bottom left corner passes b's top left corner
}
