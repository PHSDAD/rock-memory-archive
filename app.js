(() => {
  'use strict';
  const events=window.ROCK_EVENTS.map(e=>({...e,...(window.ROCK_PHOTOS?.[e.id]||{})}));
  const $=id=>document.getElementById(id);
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const external='target="_blank" rel="noopener noreferrer"';
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const mobile=matchMedia('(max-width: 760px)');
  const track=$('track'),base=$('curve-base'),progress=$('curve-progress'),head=$('playhead');
  const starts=[...document.querySelectorAll('[data-start-tour]')];
  const HOLD_MS=5000,READ_PX_PER_SECOND=20;
  const tour={state:'idle',phase:'idle',index:0,frame:0,last:0,remaining:HOLD_MS,position:0,dirty:false,manualIndex:null};
  let rows=[],nodes=[],active=0,lastOpened=-1,pathLength=0,trackTop=0,geometryFrame=0,scrollFrame=0;
  let credits={},imageCloseTimer=0,lastPaint=0,arrivalReady=false;
  const reached=new Set();
  const noteKey=id=>`rock-memory:v1:${id}`;

  $('events').innerHTML=events.map((e,i)=>`<article class="event" id="${e.id}" aria-labelledby="title-${e.id}">
    <button class="event-node" data-toggle="${i}" aria-label="${e.year}：${escape(e.title.replace('\n',''))}" aria-expanded="false" aria-controls="detail-${e.id}"><span class="node-year">${e.year}</span></button>
    <div class="event-card"><div class="event-meta"><time>${e.date}</time><span class="place">${escape(e.place)}</span><span class="event-counter">${String(i+1).padStart(2,'0')} / 33</span></div>
      <figure class="event-image" style="--photo-url:url('assets/${e.image||'ramones'}.jpg')"><div class="photo-reveal"><button class="photo-button" data-photo="${i}" aria-label="放大 ${escape(e.work[0])} 的歷史照片"><img src="assets/${e.image||'ramones'}.jpg" alt="${escape(e.alt||e.work[0]+' 資料照')}" loading="lazy" decoding="async" width="1200" height="800"></button></div><figcaption class="image-date">${escape(e.photo||'藝術家資料照')} <span aria-hidden="true">↗</span></figcaption></figure>
      <p class="event-artist">${escape(e.work[0])}</p><h3 id="title-${e.id}">${escape(e.title).replace('\n','<br>')}</h3><p class="event-teaser">${escape(e.teaser)}</p>
      <button class="event-summary-button" data-toggle="${i}" aria-expanded="false" aria-controls="detail-${e.id}"><span class="toggle-label">把故事打開</span><span class="plus" aria-hidden="true">＋</span></button>
      <div class="event-detail" id="detail-${e.id}" inert aria-hidden="true"><div class="detail-inner"><div class="story-content"><p class="detail-label">當時，發生了什麼</p><p>${escape(e.story)}</p><p class="detail-label">留下來的回聲</p><p>${escape(e.significance)}</p></div>
        ${e.listen===false?'':`<div class="work-box"><small>DROP THE NEEDLE</small><b>${escape(e.work.join(' — '))}</b><a class="listen-link" href="https://music.apple.com/tw/search?term=${encodeURIComponent(e.work.join(' '))}" ${external}>在 Apple Music 尋找這首歌 ↗</a>${e.video?`<button class="video-button" data-video="${i}">載入官方音樂影片 <span aria-hidden="true">▷</span></button><div class="video-wrap" id="video-${e.id}" hidden></div>`:''}</div>`}
        <details class="sources"><summary>史料來源 / 照片署名</summary><ul>${e.sources.map(s=>`<li><a href="${escape(s[1])}" ${external}>${escape(s[0])} ↗</a></li>`).join('')}</ul><div class="credit-text" data-credit="${e.image||'ramones'}">照片署名載入中；<a href="assets/credits.json" ${external}>完整照片出處</a>。</div></details>
        <div class="notes"><label for="note-${e.id}">這段聲音，讓你想起什麼？</label><textarea id="note-${e.id}" data-note="${i}" maxlength="3000" placeholder="留下你第一次聽見它的地方。" aria-describedby="privacy-${e.id} status-${e.id}"></textarea><small id="privacy-${e.id}">只留在這部裝置的此瀏覽器，不公開、不同步。清除瀏覽器資料將刪除記憶。</small><output id="status-${e.id}" class="note-status" aria-live="polite"></output></div>
      </div></div>
    </div></article>`).join('');
  rows=[...document.querySelectorAll('.event')];

  function markReached(index){
    if(index<0||reached.has(index))return;
    reached.add(index);rows[index].classList.add('reached');
  }

  function stopVideo(index){
    const box=$(`video-${events[index].id}`),button=document.querySelector(`[data-video="${index}"]`);
    if(box){box.replaceChildren();box.hidden=true;}if(button)button.hidden=false;
  }
  function setOpen(index,value){
    const row=rows[index],detail=$(`detail-${events[index].id}`);
    row.classList.toggle('open',value);detail.inert=!value;detail.setAttribute('aria-hidden',String(!value));
    row.querySelectorAll('[data-toggle]').forEach(b=>b.setAttribute('aria-expanded',String(value)));
    row.querySelector('.toggle-label').textContent=value?'收起這段故事':'把故事打開';
    if(value){lastOpened=index;row.classList.add('in-view');}else stopVideo(index);
    scheduleGeometry();
  }
  document.querySelectorAll('[data-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const i=Number(button.dataset.toggle);tour.dirty=true;tour.manualIndex=i;
    const value=!rows[i].classList.contains('open');setOpen(i,value);if(value)markReached(i);
    history.replaceState(null,'',`#${events[i].id}`);
    $('announcement').textContent=`${value?'已展開':'已收起'} ${events[i].date}，${events[i].title.replace('\n','')}`;
  }));

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in-view');observer.unobserve(entry.target);}});
  },{rootMargin:'40px 0px',threshold:.06});
  rows.forEach(row=>observer.observe(row));
  document.querySelectorAll('.event-detail').forEach(detail=>detail.addEventListener('transitionend',e=>{if(e.target===detail)draw();}));

  document.querySelectorAll('[data-note]').forEach(field=>{
    const event=events[Number(field.dataset.note)],status=$(`status-${event.id}`);let timer;
    try{field.value=localStorage.getItem(noteKey(event.id))||'';if(field.value)status.textContent='已讀取這部裝置的記憶';}catch{status.textContent='這個瀏覽器目前無法儲存文字。';}
    function save(){try{if(field.value)localStorage.setItem(noteKey(event.id),field.value);else localStorage.removeItem(noteKey(event.id));status.textContent=field.value?'已儲存在這部裝置':'文字已清除';}catch{status.textContent='儲存失敗，請先複製保留文字。';}}
    field.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(save,300);});field.addEventListener('blur',()=>{clearTimeout(timer);save();});
    addEventListener('pagehide',()=>{clearTimeout(timer);save();});
  });
  document.querySelectorAll('[data-video]').forEach(button=>button.addEventListener('click',()=>{
    const e=events[Number(button.dataset.video)],box=$(`video-${e.id}`);
    document.querySelectorAll('.video-wrap iframe').forEach(frame=>{const p=frame.parentElement;p.replaceChildren();p.hidden=true;p.previousElementSibling.hidden=false;});
    box.innerHTML=`<iframe src="https://www.youtube-nocookie.com/embed/${e.video}?rel=0" title="${escape(e.work.join(' — '))} 官方影片" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><a href="https://www.youtube.com/watch?v=${e.video}" ${external}>前往官方 YouTube 影片 ↗</a>`;
    box.hidden=false;button.hidden=true;scheduleGeometry();
  }));
  fetch('assets/credits.json').then(r=>{if(!r.ok)throw Error('credits');return r.json();}).then(data=>{
    credits=data;
    document.querySelectorAll('[data-credit]').forEach(box=>{
      const c=data[box.dataset.credit];if(!c)return;
      box.innerHTML=`照片：<a href="${escape(c.url)}" ${external}>${escape(c.title)} ↗</a><br>作者：${escape(c.author)}<br>授權：<a href="${escape(c.licenseUrl)}" ${external}>${escape(c.license)}</a>。${escape(c.changes)} 頁面可能裁切、調整對比與色彩；按照片可查看完整影像。`;
    });
    const c=data.ramones;if(c)$('hero-credit').textContent=`${c.author} / ${c.license} ↗`;
  }).catch(()=>document.querySelectorAll('[data-credit]').forEach(box=>{box.innerHTML='<a href="assets/credits.json" target="_blank" rel="noopener">查看照片署名與授權</a>'; }));

  const viewer=$('photo-viewer');
  function closePhoto(){
    if(!viewer.open||viewer.classList.contains('is-closing'))return;
    viewer.classList.add('is-closing');
    clearTimeout(imageCloseTimer);imageCloseTimer=setTimeout(()=>{viewer.close();viewer.classList.remove('is-closing');},motion.matches?0:350);
  }
  document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{
    const index=Number(button.dataset.photo);markReached(index);
    const e=events[index],c=credits[e.image];
    $('viewer-image').src=`assets/${e.image||'ramones'}.jpg`;$('viewer-image').alt=e.alt||e.work[0];
    $('viewer-caption').textContent=`${e.work[0]} / ${e.photo||'資料照'}${c?` · ${c.author} · ${c.license}`:''}`;
    clearTimeout(imageCloseTimer);viewer.classList.remove('is-closing');viewer.showModal();
  }));
  viewer.querySelector('.photo-close').addEventListener('click',closePhoto);
  viewer.addEventListener('click',e=>{if(e.target===viewer)closePhoto();});
  viewer.addEventListener('cancel',e=>{e.preventDefault();closePhoto();});

  function chooseVisibleIndex(){
    const at=innerHeight*.4;
    const containing=rows.findIndex(r=>{const b=r.getBoundingClientRect();return b.top<=at&&b.bottom>at;});
    return containing>=0?containing:rows.reduce((best,r,i)=>Math.abs(r.getBoundingClientRect().top-100)<Math.abs(rows[best].getBoundingClientRect().top-100)?i:best,0);
  }
  function draw(){
    const width=track.clientWidth,height=track.offsetHeight;if(!width||!height)return;
    nodes=rows.map((row,i)=>{
      const x=width*(mobile.matches ? .058+Math.sin(i*1.5)*.016 : .5+Math.sin(i*1.43)*.045);
      const button=row.querySelector('.event-node');button.style.left=`${x}px`;
      const y=row.offsetTop+button.offsetTop;return{x,y};
    });
    const center=mobile.matches?width*.058:width*.5;
    const points=[{x:center,y:0},...nodes,{x:nodes.at(-1).x,y:height-160},{x:width*.5,y:height}];
    let d=`M ${center} 0`;
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],y=(a.y+b.y)/2;d+=` C ${a.x} ${y}, ${b.x} ${y}, ${b.x} ${b.y}`;}
    $('curve').setAttribute('viewBox',`0 0 ${width} ${height}`);base.setAttribute('d',d);progress.setAttribute('d',d);
    pathLength=base.getTotalLength();progress.style.strokeDasharray=`${pathLength} ${pathLength}`;
    trackTop=track.getBoundingClientRect().top+scrollY;paintScroll();
  }
  function scheduleGeometry(){if(geometryFrame)return;geometryFrame=requestAnimationFrame(()=>{geometryFrame=0;draw();});}
  function pointAtY(y){let lo=0,hi=pathLength;for(let i=0;i<15;i++){const m=(lo+hi)/2;if(base.getPointAtLength(m).y<y)lo=m;else hi=m;}return{point:base.getPointAtLength((lo+hi)/2),length:(lo+hi)/2};}
  function paintScroll(){
    if(!nodes.length||!pathLength)return;
    const y=Math.max(0,Math.min(track.offsetHeight,scrollY+innerHeight*.42-trackTop)),p=pointAtY(y);
    head.style.left=`${p.point.x}px`;head.style.top=`${p.point.y}px`;
    head.style.visibility=y<=0||y>=track.offsetHeight||nodes.some(n=>Math.abs(n.y-y)<32)?'hidden':'visible';
    progress.style.strokeDashoffset=pathLength-p.length;
    active=tour.state==='playing'&&tour.phase!=='travel'?tour.index:chooseVisibleIndex();
    if(arrivalReady&&tour.state!=='playing'&&scrollY+innerHeight*.4>=trackTop&&scrollY<trackTop+track.offsetHeight)markReached(active);
    rows.forEach((row,i)=>{row.classList.toggle('is-active',i===active);row.classList.toggle('passed',nodes[i].y<=y);});
    $('current-year').textContent=events[active].year;$('current-index').textContent=`${String(active+1).padStart(2,'0')} / ${events.length}`;
    $('time-marker').hidden=scrollY+innerHeight*.4<trackTop||scrollY>trackTop+track.offsetHeight+200;
  }
  addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=requestAnimationFrame(now=>{scrollFrame=0;if(now-lastPaint>=24){lastPaint=now;paintScroll();}});},{passive:true});
  new ResizeObserver(scheduleGeometry).observe(track);addEventListener('resize',scheduleGeometry);document.fonts.ready.then(scheduleGeometry);
  document.querySelectorAll('img').forEach(img=>{
    function loaded(){const figure=img.closest('.event-image');if(figure&&img.naturalWidth)figure.classList.toggle('portrait',img.naturalHeight/img.naturalWidth>=.95);scheduleGeometry();}
    img.addEventListener('load',loaded);if(img.complete&&img.naturalWidth)loaded();
  });

  function updateTourUI(){
    const playing=tour.state==='playing';document.body.dataset.tourState=tour.state;document.body.dataset.tourPhase=tour.phase;document.body.dataset.tourIndex=String(tour.index);
    document.body.classList.toggle('tour-running',playing);
    starts.forEach(button=>{button.setAttribute('aria-pressed',String(playing));const label=button.querySelector('.tour-button-label');label.textContent=playing?'播放中 · 點擊停止':tour.state==='paused'?'繼續播放':tour.state==='ended'?'重新播放':button.id==='tour-start'?'自動播放':'播放這段歷史';});
  }
  function stopTour(manual=false){
    if(manual){tour.dirty=true;tour.manualIndex=null;}
    if(tour.state!=='playing')return;
    cancelAnimationFrame(tour.frame);tour.state='paused';tour.position=scrollY;updateTourUI();
    $('tour-status').textContent='已停止 · 點播放繼續';$('announcement').textContent='已停止自動播放。故事保留在原處。';
  }
  function setPhase(phase){tour.phase=phase;document.body.dataset.tourPhase=phase;document.body.dataset.tourIndex=String(tour.index);}
  function maxScroll(){return Math.max(0,document.documentElement.scrollHeight-innerHeight);}
  function stationTarget(index){return Math.max(0,Math.min(maxScroll(),scrollY+rows[index].getBoundingClientRect().top-(mobile.matches?86:106)));}
  function readingTarget(index){return Math.max(scrollY,Math.min(maxScroll(),scrollY+rows[index].querySelector('.story-content').getBoundingClientRect().bottom-innerHeight*.69));}
  function finishTour(){tour.state='ended';setPhase('ended');updateTourUI();$('tour-status').textContent='最後一個音符，仍在回響。';$('announcement').textContent='這趟搖滾旅程已播放完畢。';}
  function travelTo(index,allowBackward=false){
    cancelAnimationFrame(tour.frame);tour.index=index;setOpen(index,true);
    tour.travelBackward=allowBackward;
    rows.forEach((r,i)=>r.classList.toggle('tour-arrival',i===index));
    setPhase('travel');$('tour-status').textContent=`前往 ${events[index].year} · ${String(index+1).padStart(2,'0')}/33`;
    const from=scrollY,target=()=>allowBackward?stationTarget(index):Math.max(from,stationTarget(index));
    const distance=Math.abs(target()-from),duration=motion.matches||distance<1?0:Math.max(900,Math.min(9000,distance/170*1000));
    const start=performance.now();
    function travel(now){
      if(tour.state!=='playing')return;
      const t=duration?Math.min(1,(now-start)/duration):1,eased=t*t*(3-2*t);
      window.scrollTo({top:from+(target()-from)*eased,behavior:'instant'});
      if(t<1)tour.frame=requestAnimationFrame(travel);else{
        history.replaceState(null,'',`#${events[index].id}`);markReached(index);tour.remaining=HOLD_MS;tour.position=scrollY;tour.last=now;setPhase('hold');
        $('announcement').textContent=`${events[index].date}，${events[index].work[0]}。停留 5 秒後，慢慢讀過這段故事。`;
        tour.frame=requestAnimationFrame(readStory);
      }
    }
    tour.frame=requestAnimationFrame(travel);
  }
  function readStory(now){
    if(tour.state!=='playing')return;
    const elapsed=Math.max(0,(now-tour.last)/1000),dt=Math.min(.12,elapsed);tour.last=now;
    if(tour.phase==='hold'){
      tour.remaining=Math.max(0,tour.remaining-elapsed*1000);$('tour-status').textContent=`${events[tour.index].year} · 照片停留 ${Math.ceil(tour.remaining/1000)}s`;
      if(tour.remaining<=0){setPhase('read');tour.position=scrollY;$('tour-status').textContent=`${events[tour.index].year} · 正在慢慢讀過故事`;}
    }else if(tour.phase==='read'){
      const goal=readingTarget(tour.index);
      if(goal-scrollY>.7){tour.position=Math.min(goal,tour.position+READ_PX_PER_SECOND*dt);window.scrollTo({top:tour.position,behavior:'instant'});}
      else{setPhase('tail');tour.remaining=1800;}
    }else if(tour.phase==='tail'){
      tour.remaining-=elapsed*1000;
      if(tour.remaining<=0){if(tour.index===events.length-1)finishTour();else travelTo(tour.index+1);return;}
    }
    tour.frame=requestAnimationFrame(readStory);
  }
  function startTour(fromStart=false){
    if(viewer.open)closePhoto();
    const sameStation=tour.manualIndex===null?chooseVisibleIndex()===tour.index:tour.manualIndex===tour.index;
    const canResume=!fromStart&&tour.state==='paused'&&(!tour.dirty||sameStation);
    const phase=tour.phase;tour.state='playing';updateTourUI();
    if(canResume&&['hold','read','tail'].includes(phase)&&rows[tour.index].classList.contains('open')){
      tour.last=performance.now();tour.position=scrollY;tour.frame=requestAnimationFrame(readStory);
      $('tour-status').textContent=phase==='hold'?`${events[tour.index].year} · 照片停留`:`${events[tour.index].year} · 慢慢讀過故事`;
    }else{
      const restart=fromStart||tour.phase==='ended';
      const index=restart?0:canResume&&phase==='travel'?tour.index:tour.manualIndex??chooseVisibleIndex();
      travelTo(index,restart||(canResume&&phase==='travel'&&!tour.dirty&&tour.travelBackward));
    }
    tour.dirty=false;tour.manualIndex=null;
  }
  starts.forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.consumed){delete button.dataset.consumed;return;}
    if(tour.state==='playing'){stopTour();return;}startTour(button.hasAttribute('data-from-start'));
  }));
  // Input always wins. Stop the animation before the same click opens a story or photograph.
  document.addEventListener('pointerdown',e=>{
    if(tour.state!=='playing')return;
    const starter=e.target.closest('[data-start-tour]');stopTour(!starter);
    if(starter)starter.dataset.consumed='true';
  },true);
  document.addEventListener('click',e=>{
    if(tour.state!=='playing')return;const starter=e.target.closest('[data-start-tour]');stopTour(!starter);
    if(starter){e.preventDefault();e.stopPropagation();}
  },true);
  addEventListener('wheel',()=>stopTour(true),{passive:true});
  addEventListener('touchmove',()=>stopTour(true),{passive:true});
  document.addEventListener('keydown',e=>{if(['Escape',' ','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)&&!e.target.closest('[data-start-tour]'))stopTour(e.key!=='Escape');});
  document.addEventListener('focusin',e=>{if(e.target.matches('textarea,input,select'))stopTour(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTour();});addEventListener('pagehide',()=>stopTour());
  let viewportWidth=innerWidth;addEventListener('resize',()=>{if(Math.abs(innerWidth-viewportWidth)>24){viewportWidth=innerWidth;stopTour();}});

  function goTo(index){
    index=Math.max(0,Math.min(events.length-1,index));stopTour(true);tour.manualIndex=index;
    setOpen(index,true);rows[index].scrollIntoView({block:'start',behavior:motion.matches?'instant':'smooth'});history.replaceState(null,'',`#${events[index].id}`);
  }
  let drag=null;
  head.addEventListener('pointerdown',e=>{if(e.button!==0)return;stopTour(true);drag={clientY:e.clientY,scroll:scrollY};head.setPointerCapture(e.pointerId);head.classList.add('dragging');e.preventDefault();});
  head.addEventListener('pointermove',e=>{if(drag)window.scrollTo({top:Math.max(trackTop-innerHeight*.3,Math.min(maxScroll(),drag.scroll+(e.clientY-drag.clientY)*14)),behavior:'instant'});});
  const endDrag=()=>{drag=null;head.classList.remove('dragging');};head.addEventListener('pointerup',endDrag);head.addEventListener('pointercancel',endDrag);head.addEventListener('lostpointercapture',endDrag);
  head.addEventListener('keydown',e=>{const moves={ArrowUp:active-1,ArrowDown:active+1,Home:0,End:events.length-1};if(e.key in moves){e.preventDefault();goTo(moves[e.key]);}});
  updateTourUI();draw();
  const initial=events.findIndex(e=>`#${e.id}`===location.hash);
  if(initial>=0){tour.manualIndex=initial;setOpen(initial,true);rows[initial].classList.add('in-view');requestAnimationFrame(()=>{draw();window.scrollTo({top:stationTarget(initial),behavior:'instant'});markReached(initial);arrivalReady=true;paintScroll();});}
  else requestAnimationFrame(()=>{arrivalReady=true;paintScroll();});
})();
