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

_2048 = (
    _GAME_BASE_STYLE
    + '<h1>2048</h1><p class="sub">Стрелки · R — заново</p>'
    + '<div class="board" id="b"></div><p class="score" id="s">Очки: 0</p>'
    + '<script>'
    '(function(){var N=4,g=[],sc=0;'
    'function init(){g=[];for(var i=0;i<N*N;i++)g.push(0);sc=0;add();add();render()}'
    'function add(){var e=[];for(var i=0;i<g.length;i++)if(!g[i])e.push(i);if(!e.length)return;'
    'g[e[Math.floor(Math.random()*e.length)]]=Math.random()<.9?2:4}'
    'function idx(r,c){return r*N+c}'
    'function line(get,set,rev){var moved=0;for(var i=0;i<N;i++){var a=[];for(var j=0;j<N;j++)a.push(get(i,j,rev));'
    'var f=a.filter(function(v){return v}),m=[],k=0;while(k<f.length){if(k+1<f.length&&f[k]===f[k+1]){m.push(f[k]*2);sc+=f[k]*2;k+=2;moved=1}'
    'else{m.push(f[k]);k++}}while(m.length<N)m.push(0);if(m.join()!=a.join())moved=1;for(var j=0;j<N;j++)set(i,j,m[j],rev)}return moved}'
    'function move(dir){var mv=0;if(dir==="left")mv=line(function(r,c){return g[idx(r,c)},function(r,c,v){g[idx(r,c)]=v});'
    'if(dir==="right")mv=line(function(r,c,rev){return g[idx(r,rev?N-1-c:c)]},function(r,c,v,rev){g[idx(r,rev?N-1-c:c)]=v},1);'
    'if(dir==="up")mv=line(function(c,r){return g[idx(r,c)]},function(c,r,v){g[idx(r,c)]=v});'
    'if(dir==="down")mv=line(function(c,r,rev){return g[idx(rev?N-1-r:r,c)]},function(c,r,v,rev){g[idx(rev?N-1-r:r,c)]=v},1);'
    'if(!mv)return;add();render();if(!can())document.getElementById("s").textContent="Конец · Очки: "+sc}'
    'function can(){for(var i=0;i<g.length;i++){if(!g[i])return 1;var r=Math.floor(i/N),c=i%N;'
    'if(c<N-1&&g[i]===g[idx(r,c+1)])return 1;if(r<N-1&&g[i]===g[idx(r+1,c)])return 1}return 0}'
    'function render(){var b=document.getElementById("b");b.style.gridTemplateColumns="repeat(4,64px)";b.innerHTML="";'
    'g.forEach(function(v){var d=document.createElement("div");d.className="cell";d.style.width="64px";d.style.height="64px";'
    'if(v){d.textContent=v;d.style.background="#2a3548"}b.appendChild(d)});document.getElementById("s").textContent="Очки: "+sc}'
    'document.addEventListener("keydown",function(e){if(e.key==="ArrowLeft")move("left");else if(e.key==="ArrowRight")move("right");'
    'else if(e.key==="ArrowUp")move("up");else if(e.key==="ArrowDown")move("down");else if(e.key==="r"||e.key==="R")init();'
    'if(/^Arrow/.test(e.key))e.preventDefault()});init()})();'
    '</script>'
)

_MINESWEEPER = (
    _GAME_BASE_STYLE
    + '<h1>Minesweeper</h1><p class="sub">ЛКМ — открыть · R — заново</p>'
    + '<div class="board" id="b" style="grid-template-columns:repeat(8,32px)"></div>'
    + '<p class="score" id="s">Флаги: 10 · Открыто: 0</p>'
    + '<script>'
    '(function(){var W=8,H=8,M=10,mines=[],rev=[],open=0,done=0;'
    'function reset(){mines=Array(W*H).fill(0);rev=Array(W*H).fill(0);open=0;done=0;'
    'var placed=0;while(placed<M){var i=Math.floor(Math.random()*W*H);if(!mines[i]){mines[i]=1;placed++}}render()}'
    'function nbr(i){var r=Math.floor(i/W),c=i%W,n=0;for(var dr=-1;dr<=1;dr++)for(var dc=-1;dc<=1;dc++){'
    'if(!dr&&!dc)continue;var nr=r+dr,nc=c+dc;if(nr>=0&&nr<H&&nc>=0&&nc<W&&mines[nr*W+nc])n++}return n}'
    'function reveal(i){if(done||rev[i])return;if(mines[i]){done=1;document.getElementById("s").textContent="Мина! R — заново";'
    'for(var j=0;j<mines.length;j++)if(mines[j])rev[j]=1;render();return}'
    'function flood(i){if(rev[i]||mines[i])return;rev[i]=1;open++;if(nbr(i)===0){var r=Math.floor(i/W),c=i%W;'
    'for(var dr=-1;dr<=1;dr++)for(var dc=-1;dc<=1;dc++){var nr=r+dr,nc=c+dc;if(nr>=0&&nr<H&&nc>=0&&nc<W)flood(nr*W+nc)}}}'
    'function render(){var b=document.getElementById("b");b.innerHTML="";'
    'for(var i=0;i<W*H;i++){var d=document.createElement("div");d.className="cell";d.style.width="32px";d.style.height="32px";'
    'd.style.fontSize="0.75rem";if(rev[i]){if(mines[i]){d.textContent="*";d.style.background="#4a2020"}'
    'else{var n=nbr(i);d.textContent=n||"";if(n)d.style.background="#1e3a2f"}}'
    'd.onclick=function(){reveal(i);flood(i);render();'
    'document.getElementById("s").textContent="Флаги: 10 · Открыто: "+open;'
    'if(open===W*H-M&&!done){done=1;document.getElementById("s").textContent="Победа!"}};b.appendChild(d)}}'
    'document.addEventListener("keydown",function(e){if(e.key==="r"||e.key==="R")reset()});reset()})();'
    '</script>'
)

_SIMON = (
    _GAME_BASE_STYLE
    + '<h1>Simon</h1><p class="sub">Повтори последовательность · R — заново</p>'
    + '<div class="board" id="b" style="grid-template-columns:repeat(2,88px)"></div>'
    + '<p class="score" id="s">Уровень: 0</p>'
    + '<script>'
    '(function(){var cols=["#e05252","#5b9cf5","#6ee7a0","#e8c547"],seq=[],step=0,lock=1,lv=0;'
    'var pads=[];function init(){seq=[];lv=0;next();build()}'
    'function build(){var b=document.getElementById("b");b.innerHTML="";pads=[];'
    'cols.forEach(function(col,i){var d=document.createElement("div");d.className="cell";d.style.width="88px";d.style.height="88px";'
    'd.style.background=col;d.style.opacity="0.45";d.onclick=function(){if(lock)return;flash(i);if(i!==seq[step]){'
    'document.getElementById("s").textContent="Ошибка · R";lock=1;return}step++;if(step===seq.length){lv++;setTimeout(next,500)}};'
    'pads.push(d);b.appendChild(d)})}'
    'function flash(i){pads[i].style.opacity="1";setTimeout(function(){pads[i].style.opacity="0.45"},280)}'
    'function play(){lock=1;step=0;var i=0;function tick(){if(i>=seq.length){lock=0;return}flash(seq[i++]);setTimeout(tick,520)}tick()}'
    'function next(){seq.push(Math.floor(Math.random()*4));document.getElementById("s").textContent="Уровень: "+lv;setTimeout(play,400)}'
    'document.addEventListener("keydown",function(e){if(e.key==="r"||e.key==="R")init()});init()})();'
    '</script>'
)

_FLAPPY = (
    _GAME_BASE_STYLE
    + '<h1>Flappy</h1><p class="sub">Пробел / клик · R — заново</p>'
    + '<canvas id="c" width="300" height="400"></canvas><p class="score" id="s">0</p>'
    + '<script>'
    '(function(){var cv=document.getElementById("c"),x=cv.getContext("2d"),by=180,vy=0,pipes=[],sc=0,alive=1,gap=92;'
    'function reset(){by=180;vy=0;pipes=[];sc=0;alive=1;document.getElementById("s").textContent="0"}'
    'function flap(){if(!alive)return;vy=-5.2}'
    'function draw(){x.fillStyle="#1a1d24";x.fillRect(0,0,cv.width,cv.height);x.fillStyle="#6ee7a0";'
    'pipes.forEach(function(p){x.fillRect(p.x,0,44,p.top);x.fillRect(p.x,p.top+gap,44,cv.height-p.top-gap)});'
    'x.fillStyle="#e8c547";x.beginPath();x.arc(56,by,11,0,6.28);x.fill()}'
    'function tick(){if(!alive)return;vy+=0.34;by+=vy;if(by<10||by>cv.height-10){alive=0;return}'
    'if(!pipes.length||pipes[pipes.length-1].x<cv.width-140)pipes.push({x:cv.width,top:50+Math.random()*180});'
    'pipes.forEach(function(p){p.x-=2.2;if(p.x<-50)return;if(p.x<70&&p.x+44>42&&(by< p.top+8||by>p.top+gap-8)){alive=0}'
    'if(p.x+44<42&&!p.sc){p.sc=1;sc++;document.getElementById("s").textContent=sc}});'
    'pipes=pipes.filter(function(p){return p.x>-60});draw()}'
    'cv.addEventListener("click",flap);document.addEventListener("keydown",function(e){'
    'if(e.key===" "){flap();e.preventDefault()}if(e.key==="r"||e.key==="R")reset()});'
    'reset();draw();setInterval(tick,16)})();'
    '</script>'
)

_REACTION = (
    _GAME_BASE_STYLE
    + '<style>.zone{width:min(320px,90vw);height:160px;border-radius:12px;border:1px solid #2a2f3a;'
    'display:flex;align-items:center;justify-content:center;font-size:.85rem;cursor:pointer;user-select:none}</style>'
    + '<h1>Reaction</h1><p class="sub">Кликни, когда станет зелёным</p>'
    + '<div class="zone" id="z" style="background:#252a34">Ждите…</div>'
    + '<p class="score" id="s">Лучший: —</p>'
    + '<script>'
    '(function(){var z=document.getElementById("z"),s=document.getElementById("s"),best=null,state="wait",t0=0,tid;'
    'function arm(){state="wait";z.style.background="#252a34";z.textContent="Ждите…";'
    'tid=setTimeout(function(){state="go";z.style.background="#1e4d32";z.textContent="Жми!";t0=Date.now()},800+Math.random()*2200)}'
    'z.onclick=function(){if(state==="wait"){clearTimeout(tid);z.textContent="Рано!";state="done";setTimeout(arm,900)}'
    'else if(state==="go"){var ms=Date.now()-t0;z.textContent=ms+" мс";state="done";'
    'if(best===null||ms<best){best=ms;s.textContent="Лучший: "+best+" мс"}setTimeout(arm,900)}};arm()})();'
    '</script>'
)

_WHACK = (
    _GAME_BASE_STYLE
    + '<h1>Whack</h1><p class="sub">Кликай по кротам · R — заново</p>'
    + '<div class="board" id="b" style="grid-template-columns:repeat(3,72px)"></div>'
    + '<p class="score" id="s">Очки: 0 · 30 с</p>'
    + '<script>'
    '(function(){var sc=0,left=30,cur=-1,tid,holes=[];'
    'function build(){var b=document.getElementById("b");b.innerHTML="";holes=[];'
    'for(var i=0;i<9;i++){var d=document.createElement("div");d.className="cell";d.style.width="72px";d.style.height="72px";'
    'd.textContent="·";d.dataset.i=i;d.onclick=function(){var n=+this.dataset.i;if(n===cur){sc++;cur=-1;render();'
    'document.getElementById("s").textContent="Очки: "+sc+" · "+left+" с"}};holes.push(d);b.appendChild(d)}}'
    'function render(){holes.forEach(function(h,i){h.textContent=i===cur?"@":"·";h.style.background=i===cur?"#2a3548":"#1a1d24"})}'
    'function pop(){cur=Math.floor(Math.random()*9);render();setTimeout(function(){if(cur>=0){cur=-1;render()}},650)}'
    'function start(){sc=0;left=30;build();render();clearInterval(tid);tid=setInterval(function(){left--;'
    'document.getElementById("s").textContent="Очки: "+sc+" · "+left+" с";if(left<=0){clearInterval(tid);cur=-1;render()}'
    'else if(Math.random()<.55)pop()},700)}'
    'document.addEventListener("keydown",function(e){if(e.key==="r"||e.key==="R")start()});start()})();'
    '</script>'
)

_DINO = (
    _GAME_BASE_STYLE
    + '<h1>Dino Run</h1><p class="sub">Пробел / ↑ · R — заново</p>'
    + '<canvas id="c" width="360" height="160"></canvas><p class="score" id="s">0</p>'
    + '<script>'
    '(function(){var cv=document.getElementById("c"),x=cv.getContext("2d"),gy=120,vy=0,jump=0,obs=[],sc=0,alive=1,sp=4;'
    'function reset(){gy=120;vy=0;jump=0;obs=[];sc=0;alive=1;sp=4;document.getElementById("s").textContent="0"}'
    'function hop(){if(!alive)return;if(gy>=118){vy=-7.5;jump=1}}'
    'function draw(){x.fillStyle="#1a1d24";x.fillRect(0,0,cv.width,cv.height);x.strokeStyle="#2a2f3a";'
    'x.beginPath();x.moveTo(0,132);x.lineTo(cv.width,132);x.stroke();x.fillStyle="#e8eaed";'
    'x.fillRect(36,gy-18,16,18);obs.forEach(function(o){x.fillStyle="#6ee7a0";x.fillRect(o.x,112,o.w,20)})}'
    'function tick(){if(!alive)return;vy+=0.42;gy+=vy;if(gy>120){gy=120;vy=0}'
    'if(!obs.length||obs[obs.length-1].x<cv.width-90)obs.push({x:cv.width,w:12+Math.random()*10});'
    'obs.forEach(function(o){o.x-=sp;if(o.x<-20)return;if(o.x<52&&o.x+o.w>28&&gy>104){alive=0;return}'
    'if(o.x+o.w<28&&!o.ok){o.ok=1;sc++;if(sc%5===0)sp+=0.3;document.getElementById("s").textContent=sc}});'
    'obs=obs.filter(function(o){return o.x>-30});draw()}'
    'document.addEventListener("keydown",function(e){if(e.key===" "||e.key==="ArrowUp"){hop();e.preventDefault()}'
    'if(e.key==="r"||e.key==="R")reset()});cv.addEventListener("click",hop);reset();draw();setInterval(tick,16)})();'
    '</script>'
)

_GUESS = (
    _GAME_BASE_STYLE
    + '<style>input.hst-inp{font:inherit;font-size:.85rem;padding:.45rem .6rem;border-radius:8px;border:1px solid #2a2f3a;'
    'background:#1a1d24;color:#e8eaed;width:5rem;text-align:center}</style>'
    + '<h1>Угадай число</h1><p class="sub">От 1 до 100 · R — заново</p>'
    + '<p class="score" id="h">Загадано число. Ваш ход!</p>'
    + '<div class="row"><input type="number" id="n" class="hst-inp" min="1" max="100" />'
    + '<button type="button" id="go">Проверить</button></div>'
    + '<p class="score" id="s">Попыток: 0</p>'
    + '<script>'
    '(function(){var secret=0,tries=0,h=document.getElementById("h"),s=document.getElementById("s"),inp=document.getElementById("n");'
    'function reset(){secret=1+Math.floor(Math.random()*100);tries=0;h.textContent="Загадано число. Ваш ход!";s.textContent="Попыток: 0";inp.value=""}'
    'document.getElementById("go").onclick=function(){var v=parseInt(inp.value,10);if(!v||v<1||v>100)return;'
    'tries++;if(v===secret){h.textContent="Верно! Это "+secret;s.textContent="Попыток: "+tries;return}'
    'h.textContent=v<secret?"Больше ↗":"Меньше ↘";s.textContent="Попыток: "+tries};'
    'inp.addEventListener("keydown",function(e){if(e.key==="Enter")document.getElementById("go").click()});'
    'document.addEventListener("keydown",function(e){if(e.key==="r"||e.key==="R")reset()});reset()})();'
    '</script>'
)

_TETRIS = (
    _GAME_BASE_STYLE
    + '<h1>Tetris</h1><p class="sub">← → ↓ · ↑ поворот · R — заново</p>'
    + '<canvas id="c" width="200" height="360"></canvas><p class="score" id="s">Очки: 0</p>'
    + '<script>'
    '(function(){var cv=document.getElementById("c"),x=cv.getContext("2d"),C=10,R=18,S=18,grid=[],sc=0,alive=1,'
    'shapes=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]]],'
    'cur,px=3,py=0;'
    'function empty(){grid=[];for(var i=0;i<R*C;i++)grid.push(0)}'
    'function newP(){cur=shapes[Math.floor(Math.random()*shapes.length)];px=3;py=0;'
    'if(hit(cur,px,py)){alive=0;document.getElementById("s").textContent="Конец · Очки: "+sc}}'
    'function hit(p,ox,oy){for(var r=0;r<p.length;r++)for(var c=0;c<p[r].length;c++){if(!p[r][c])continue;'
    'var y=oy+r,x=ox+c;if(x<0||x>=C||y>=R||(y>=0&&grid[y*C+x]))return 1}return 0}'
    'function merge(){for(var r=0;r<cur.length;r++)for(var c=0;c<cur[r].length;c++){if(!cur[r][c])continue;'
    'var y=py+r,x=px+c;if(y>=0)grid[y*C+x]=1}var full=[];for(var row=0;row<R;row++){var ok=1;'
    'for(var col=0;col<C;col++)if(!grid[row*C+col])ok=0;if(ok)full.push(row)}'
    'full.sort(function(a,b){return b-a}).forEach(function(row){grid.splice(row*C,C);for(var i=0;i<C;i++)grid.unshift(0);sc+=100;'
    'document.getElementById("s").textContent="Очки: "+sc});newP()}'
    'function draw(){x.fillStyle="#1a1d24";x.fillRect(0,0,cv.width,cv.height);x.fillStyle="#5b9cf5";'
    'for(var i=0;i<grid.length;i++)if(grid[i]){var gy=Math.floor(i/C),gx=i%C;x.fillRect(gx*S,gy*S,S-1,S-1)}'
    'x.fillStyle="#6ee7a0";for(var r=0;r<cur.length;r++)for(var c=0;c<cur[r].length;c++)'
    'if(cur[r][c])x.fillRect((px+c)*S,(py+r)*S,S-1,S-1)}'
    'function step(dy){if(!alive)return;if(!hit(cur,px,py+dy)){py+=dy;draw();return}'
    'if(dy>0){merge();draw()}else alive=0}'
    'function rot(){var n=cur[0].map(function(_,i){return cur.map(function(row){return row[i]}).reverse()});'
    'if(!hit(n,px,py)){cur=n;draw()}}'
    'document.addEventListener("keydown",function(e){if(!alive)return;'
    'if(e.key==="ArrowLeft"&&!hit(cur,px-1,py)){px--;draw()}'
    'else if(e.key==="ArrowRight"&&!hit(cur,px+1,py)){px++;draw()}'
    'else if(e.key==="ArrowDown")step(1)'
    'else if(e.key==="ArrowUp")rot()'
    'else if(e.key==="r"||e.key==="R"){empty();sc=0;alive=1;document.getElementById("s").textContent="Очки: 0";newP();draw()}'
    'if(/^Arrow/.test(e.key))e.preventDefault()});'
    'empty();newP();draw();setInterval(function(){step(1)},520)})();'
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
    'game_2048': {
        'label': 'Игра — 2048',
        'group': 'games',
        'status': '200',
        'title': '2048',
        'body': _2048,
    },
    'game_minesweeper': {
        'label': 'Игра — Сапёр',
        'group': 'games',
        'status': '200',
        'title': 'Minesweeper',
        'body': _MINESWEEPER,
    },
    'game_simon': {
        'label': 'Игра — Simon',
        'group': 'games',
        'status': '200',
        'title': 'Simon',
        'body': _SIMON,
    },
    'game_flappy': {
        'label': 'Игра — Flappy',
        'group': 'games',
        'status': '200',
        'title': 'Flappy',
        'body': _FLAPPY,
    },
    'game_reaction': {
        'label': 'Игра — Реакция',
        'group': 'games',
        'status': '200',
        'title': 'Reaction',
        'body': _REACTION,
    },
    'game_whack': {
        'label': 'Игра — Кроты',
        'group': 'games',
        'status': '200',
        'title': 'Whack',
        'body': _WHACK,
    },
    'game_dino': {
        'label': 'Игра — Dino Run',
        'group': 'games',
        'status': '200',
        'title': 'Dino Run',
        'body': _DINO,
    },
    'game_guess': {
        'label': 'Игра — Угадай число',
        'group': 'games',
        'status': '200',
        'title': 'Guess',
        'body': _GUESS,
    },
    'game_tetris': {
        'label': 'Игра — Тетрис',
        'group': 'games',
        'status': '200',
        'title': 'Tetris',
        'body': _TETRIS,
    },
}
