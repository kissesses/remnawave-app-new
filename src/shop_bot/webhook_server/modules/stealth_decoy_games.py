"""Одностраничные inline-игры для decoy (без CDN, без сети, без storage)."""

_GAME_BASE_STYLE = (
    '<style>'
    '*{box-sizing:border-box;margin:0;padding:0}'
    'body{font-family:system-ui,-apple-system,sans-serif;background:#0f1115;color:#e8eaed;'
    'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1rem}'
    'h1{font-size:1.1rem;font-weight:600;margin-bottom:.35rem;letter-spacing:-.02em}'
    '.sub{font-size:.72rem;color:#8b919a;margin-bottom:.85rem}'
    'canvas{background:#1a1d24;border-radius:10px;border:1px solid #2a2f3a;max-width:100%}'
    '.board{display:grid;gap:6px}'
    '.card,.cell{background:#1a1d24;border:1px solid #2a2f3a;border-radius:8px;'
    'display:flex;align-items:center;justify-content:center;font-weight:700;cursor:pointer;user-select:none}'
    '.score{font-size:.8rem;color:#9aa0a9;margin-top:.6rem}'
    '.row{display:flex;gap:.5rem;margin-top:.5rem}'
    'button{font:inherit;font-size:.72rem;padding:.35rem .7rem;border-radius:8px;border:1px solid #2a2f3a;'
    'background:#252a34;color:#e8eaed;cursor:pointer}'
    'button:hover{background:#2f3542}'
    '</style>'
)

_SNAKE = (
    _GAME_BASE_STYLE
    + '<h1>Snake</h1><p class="sub">Стрелки · R — заново</p>'
    + '<canvas id="c" width="320" height="320"></canvas><p class="score" id="s">0</p>'
    + '<script>'
    '(function(){var cv=document.getElementById("c"),x=cv.getContext("2d"),S=16,W=20,H=20,'
    'sn=[{x:10,y:10}],dir={x:1,y:0},food={x:5,y:5},sc=0,alive=1,tid;'
    'function rf(){food={x:Math.floor(Math.random()*W),y:Math.floor(Math.random()*H)};'
    'for(var i=0;i<sn.length;i++)if(sn[i].x===food.x&&sn[i].y===food.y)return rf()}'
    'function draw(){x.fillStyle="#1a1d24";x.fillRect(0,0,cv.width,cv.height);'
    'x.fillStyle="#6ee7a0";x.fillRect(food.x*S,food.y*S,S-1,S-1);'
    'x.fillStyle="#5b9cf5";for(var i=0;i<sn.length;i++)x.fillRect(sn[i].x*S,sn[i].y*S,S-1,S-1)}'
    'function step(){if(!alive)return;var h={x:sn[0].x+dir.x,y:sn[0].y+dir.y};'
    'if(h.x<0||h.y<0||h.x>=W||h.y>=H){alive=0;return}'
    'for(var i=0;i<sn.length;i++)if(sn[i].x===h.x&&sn[i].y===h.y){alive=0;return}'
    'sn.unshift(h);if(h.x===food.x&&h.y===food.y){sc++;document.getElementById("s").textContent=sc;rf()}else sn.pop();draw()}'
    'function reset(){sn=[{x:10,y:10}];dir={x:1,y:0};sc=0;alive=1;document.getElementById("s").textContent="0";rf();draw()}'
    'document.addEventListener("keydown",function(e){'
    'var k=e.key;if(k==="ArrowUp"&&dir.y!==1){dir={x:0,y:-1};e.preventDefault()}'
    'else if(k==="ArrowDown"&&dir.y!==-1){dir={x:0,y:1};e.preventDefault()}'
    'else if(k==="ArrowLeft"&&dir.x!==1){dir={x:-1,y:0};e.preventDefault()}'
    'else if(k==="ArrowRight"&&dir.x!==-1){dir={x:1,y:0};e.preventDefault()}'
    'else if(k==="r"||k==="R")reset()});'
    'rf();draw();tid=setInterval(step,110)})();'
    '</script>'
)

_MEMORY = (
    _GAME_BASE_STYLE
    + '<h1>Memory</h1><p class="sub">Найди все пары</p>'
    + '<div class="board" id="b" style="grid-template-columns:repeat(4,52px)"></div>'
    + '<p class="score" id="s">Ходы: 0</p>'
    + '<script>'
    '(function(){var icons=["A","B","C","D","E","F","G","H"],deck=icons.concat(icons),'
    'open=[],lock=0,moves=0,b=document.getElementById("b");'
    'for(var i=deck.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=deck[i];deck[i]=deck[j];deck[j]=t}'
    'deck.forEach(function(v,i){var d=document.createElement("div");d.className="card";'
    'd.style.width="52px";d.style.height="52px";d.textContent="?";d.dataset.v=v;'
    'd.onclick=function(){if(lock||d.classList.contains("ok")||d===open[0])return;'
    'd.textContent=v;open.push(d);if(open.length===2){moves++;document.getElementById("s").textContent="Ходы: "+moves;'
    'lock=1;if(open[0].dataset.v===open[1].dataset.v){open.forEach(function(c){c.classList.add("ok");c.style.background="#1e3a2f"});'
    'open=[];lock=0;if(document.querySelectorAll(".ok").length===deck.length)document.getElementById("s").textContent="Готово за "+moves+" ходов"}'
    'else setTimeout(function(){open.forEach(function(c){c.textContent="?"});open=[];lock=0},500)}};b.appendChild(d)})})();'
    '</script>'
)

_PONG = (
    _GAME_BASE_STYLE
    + '<h1>Pong</h1><p class="sub">Мышь или стрелки · R — заново</p>'
    + '<canvas id="c" width="360" height="240"></canvas><p class="score" id="s">0 : 0</p>'
    + '<script>'
    '(function(){var cv=document.getElementById("c"),x=cv.getContext("2d"),py=100,vy=0,'
    'bx=180,by=120,bdx=3,bdy=2.2,ps=0,bs=0,aw=8;'
    'function draw(){x.fillStyle="#1a1d24";x.fillRect(0,0,cv.width,cv.height);'
    'x.fillStyle="#5b9cf5";x.fillRect(8,py,aw,44);x.fillStyle="#e8eaed";x.beginPath();'
    'x.arc(bx,by,7,0,Math.PI*2);x.fill()}'
    'function tick(){by+=bdy;bx+=bdx;if(by<8||by>cv.height-8)bdy*=-1;'
    'if(bx<20&&by>py&&by<py+44){bdx=Math.abs(bdx);bs++}else if(bx>cv.width-8){ps++;resetBall(-1)}'
    'else if(bx<0){bs++;resetBall(1)}document.getElementById("s").textContent=ps+" : "+bs;draw()}'
    'function resetBall(dir){bx=cv.width/2;by=cv.height/2;bdx=3*dir;bdy=(Math.random()>.5?1:-1)*2.2}'
    'cv.addEventListener("mousemove",function(e){var r=cv.getBoundingClientRect();py=e.clientY-r.top-22;'
    'if(py<0)py=0;if(py>cv.height-44)py=cv.height-44});'
    'document.addEventListener("keydown",function(e){if(e.key==="ArrowUp")py-=14;'
    'if(e.key==="ArrowDown")py+=14;if(py<0)py=0;if(py>cv.height-44)py=cv.height-44;'
    'if(e.key==="r"||e.key==="R"){ps=bs=0;resetBall(1);document.getElementById("s").textContent="0 : 0"}});'
    'resetBall(1);draw();setInterval(tick,16)})();'
    '</script>'
)

_TICTACTOE = (
    _GAME_BASE_STYLE
    + '<h1>Tic Tac Toe</h1><p class="sub">Клик по клетке · R — заново</p>'
    + '<div class="board" id="b" style="grid-template-columns:repeat(3,64px)"></div>'
    + '<p class="score" id="s">Ваш ход (X)</p>'
    + '<script>'
    '(function(){var b=document.getElementById("b"),s=document.getElementById("s"),'
    'board=Array(9).fill(""),you=1,lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];'
    'function render(){b.innerHTML="";board.forEach(function(v,i){var d=document.createElement("div");'
    'd.className="cell";d.style.width="64px";d.style.height="64px";d.style.fontSize="1.4rem";'
    'd.textContent=v;d.onclick=function(){move(i)};b.appendChild(d)})}'
    'function win(p){for(var i=0;i<lines.length;i++){var L=lines[i],a=L[0],c=L[1],d=L[2];'
    'if(board[a]&&board[a]===board[c]&&board[a]===board[d])return board[a]}return board.indexOf("")<0?"=":""}'
    'function ai(){var empty=[];board.forEach(function(v,i){if(!v)empty.push(i)});if(!empty.length)return;'
    'for(var t=0;t<empty.length;t++){var i=empty[t],v=board[i];board[i]="O";if(win("O")==="O"){board[i]=v;return i}'
    'board[i]=v}for(var t=0;t<empty.length;t++){var i=empty[t],v=board[i];board[i]="X";if(win("X")==="X"){board[i]=v;return i}'
    'board[i]=v}if(board[4]==="")return 4;return empty[Math.floor(Math.random()*empty.length)]}'
    'function move(i){if(!you||board[i]||win())return;board[i]="X";var w=win();if(w){s.textContent=w==="="?"Ничья":"Вы выиграли";you=0;render();return}'
    'var j=ai();board[j]="O";w=win();s.textContent=w?(w==="="?"Ничья":"Компьютер выиграл"):"Ваш ход (X)";if(w)you=0;render()}'
    'document.addEventListener("keydown",function(e){if(e.key==="r"||e.key==="R"){board=Array(9).fill("");you=1;s.textContent="Ваш ход (X)";render()}});render()})();'
    '</script>'
)

_BREAKOUT = (
    _GAME_BASE_STYLE
    + '<h1>Breakout</h1><p class="sub">Стрелки · R — заново</p>'
    + '<canvas id="c" width="360" height="300"></canvas><p class="score" id="s">Очки: 0</p>'
    + '<script>'
    '(function(){var cv=document.getElementById("c"),x=cv.getContext("2d"),px=150,bricks=[],sc=0,alive=1,'
    'bx=180,by=250,bdx=2.4,bdy=-2.4;'
    'function init(){bricks=[];for(var r=0;r<5;r++)for(var c=0;c<8;c++)bricks.push({x:8+c*42,y:20+r*18,w:38,h:14,on:1})}'
    'function draw(){x.fillStyle="#1a1d24";x.fillRect(0,0,cv.width,cv.height);'
    'x.fillStyle="#5b9cf5";x.fillRect(px,cv.height-14,56,8);x.fillStyle="#e8eaed";x.beginPath();x.arc(bx,by,6,0,6.28);x.fill();'
    'bricks.forEach(function(b){if(!b.on)return;x.fillStyle="#6ee7a0";x.fillRect(b.x,b.y,b.w,b.h)})}'
    'function tick(){if(!alive)return;bx+=bdx;by+=bdy;if(bx<6||bx>cv.width-6)bdx*=-1;if(by<6)bdy*=-1;'
    'if(by>cv.height-22&&bx>px&&bx<px+56)bdy=-Math.abs(bdy);'
    'if(by>cv.height){alive=0;s.textContent="Конец · Очки: "+sc;return}'
    'bricks.forEach(function(b){if(!b.on)return;if(bx>b.x&&bx<b.x+b.w&&by>b.y&&by<b.y+b.h){b.on=0;bdy*=-1;sc+=10;'
    'document.getElementById("s").textContent="Очки: "+sc;if(!bricks.some(function(z){return z.on}))alive=0}});draw()}'
    'document.addEventListener("keydown",function(e){if(e.key==="ArrowLeft")px-=16;if(e.key==="ArrowRight")px+=16;'
    'if(px<0)px=0;if(px>cv.width-56)px=cv.width-56;if(e.key==="r"||e.key==="R"){init();sc=0;alive=1;'
    'bx=180;by=250;document.getElementById("s").textContent="Очки: 0";draw()}});'
    'init();draw();setInterval(tick,16)})();'
    '</script>'
)

GAME_DECOY_PRESETS: dict[str, dict[str, str]] = {
    'game_snake': {
        'label': 'Игра — Змейка',
        'group': 'games',
        'status': '200',
        'title': 'Snake',
        'body': _SNAKE,
    },
    'game_memory': {
        'label': 'Игра — Найди пару',
        'group': 'games',
        'status': '200',
        'title': 'Memory',
        'body': _MEMORY,
    },
    'game_pong': {
        'label': 'Игра — Понг',
        'group': 'games',
        'status': '200',
        'title': 'Pong',
        'body': _PONG,
    },
    'game_tictactoe': {
        'label': 'Игра — Крестики-нолики',
        'group': 'games',
        'status': '200',
        'title': 'Tic Tac Toe',
        'body': _TICTACTOE,
    },
    'game_breakout': {
        'label': 'Игра — Breakout',
        'group': 'games',
        'status': '200',
        'title': 'Breakout',
        'body': _BREAKOUT,
    },
}
