//board
let tileSize = 32;
let rows = 16;
let columns = 16;

let board;
let boardWidth = tileSize * columns;
let boardHeight = tileSize * rows;
let context;

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


//when the page loads we will call this functoin
window.onload = function() {
    board = document.getElementById("board");
    board.width = boardWidth;
    board.height = boardHeight;
    context = board.getContext("2d") //used for drawing on the board


    //load initial ship image
    shipImg = new Image();
    shipImg.src = "./images/ship.png";
    shipImg.onload = function() {
        context.drawImage(shipImg, ship.x, ship.y, ship.width, ship.height);
    }

    //load alien ship image
    alienImg = new Image();
    alienImg.src = "./images/alien.png";
    createAliens();


    //tells the browser u want to perform an animation and asks it to call a
    //specific function right before the next screen refresh(repaint).
    requestAnimationFrame(update);

    document.addEventListener("keydown", moveShip);
    document.addEventListener("keyup", shoot);
}


function update() {
    requestAnimationFrame(update);

    if (gameOver) return;

    //ship
    context.clearRect(0,0, board.width, board.height);
    context.drawImage(shipImg, ship.x, ship.y, ship.width, ship.height);

    //alien
    for (let i = 0; i < alienArray.length; i++) {
        let alien = alienArray[i];

        if (alien.alive) {
            alien.x += alienVelocityX;

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
        bullet.y += bulletVelocityY;
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


function shoot(e) {

    if (gameOver) return;

    if (e.code == "Space") {
        
        let bullet = {
            x: ship.x + shipWidth*15/32,
            y: ship.y,
            width: tileSize/8,
            height: tileSize/2,
            used: false
        }

        bulletArray.push(bullet);
    }
}


function detectCollision(a,b) {
    return a.x < b.x + b.width &&   //a's top left corner doesn't reach b's top right corner
           a.x + a.width > b.x &&   //a's top right corner passes b's top left corner 
           a.y < b.y + b.height &&  //a's top left corner doesn't reach b's bottom left corner
           a.y + a.height > b.y     //a's bottom left corner passes b's top left corner
}