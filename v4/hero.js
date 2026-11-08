/* The live page's hero intro and stack-and-fan motion, moved as-is (the user asked to keep it).
   Only the wrapper changed: it is a module function instead of an inline IIFE. */
export function mountHero() {
  const $ = (id) => document.getElementById(id);
  var stage=$("sfStage"); if(!stage)return;
  var cards=Array.prototype.slice.call(stage.querySelectorAll(".sf-card"));
  var progEl=$("sfProg"), toggleBtn=$("sfToggle"), restartBtn=$("sfRestart");
  var ROTS=[-5,4,-3,6,-4,5];
  var T_STACK=780, T_FAN=1330, T_HOLD=2530, T_TOTAL=2930;
  var EASE_OUT="cubic-bezier(.16,1,.3,1)";
  var reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var anims=[], playing=false, rafId=null, built=false, userPaused=false, inView=false, playedOnce=false;
  var topicEl=$("topicRot"), headEl=$("heroHeadline"), ctlEl=$("sfControls"), ctaEl=$("heroCtas"), prevEl=$("heroPreview");
  var line1El=headEl?headEl.querySelector(".hl-line1"):null, line2El=headEl?headEl.querySelector(".hl-line2"):null;
  var TOPIC_COLORS={"포트폴리오":"#1D4ED8","제품 소개":"#EA580C","아트갤러리":"#9333EA","브랜드 디자이너 포트폴리오":"#0D9488","내가 원하는 사이트":"var(--ink)"};
  var introDone=false, introStarted=false, introTimers=[];
  function later(fn,ms){introTimers.push(setTimeout(fn,ms))}
  function showWord(txt){if(!topicEl)return;topicEl.textContent=txt;topicEl.style.color=TOPIC_COLORS[txt]||"";if(topicEl.animate){try{topicEl.animate([{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"translateY(0px)"}],{duration:320,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"})}catch(e){}}}
  function revealLine1(){if(line1El)line1El.classList.remove("pre")}
  function revealLine2(){if(line2El)line2El.classList.remove("pre")}
  function revealStage(){stage.classList.remove("sf-await");stage.classList.add("sf-reveal")}
  function revealControls(){if(ctlEl){ctlEl.classList.remove("sf-await");ctlEl.classList.add("sf-reveal")}}
  function revealCtas(){if(ctaEl){ctaEl.classList.remove("cta-await");ctaEl.classList.add("cta-reveal")}}
  function hidePreview(){if(!prevEl||reduced)return;
    if(prevEl.classList.contains("hp-collapse"))return;
    prevEl.style.height=prevEl.offsetHeight+"px";
    void prevEl.offsetHeight;
    requestAnimationFrame(function(){prevEl.classList.add("hp-collapse")});
  }
  function headlineMoment(){revealLine1()}
  function headlineSecond(){revealLine2();revealStage();revealControls();hidePreview()}
  function finishIntro(){introTimers.forEach(function(t){clearTimeout(t)});introTimers=[];showWord("내가 원하는 사이트");headlineMoment();headlineSecond();introDone=true;later(revealCtas,T_TOTAL)}
  function runIntro(){
    if(introDone)return;
    if(window.matchMedia("(max-width:919px)").matches)return;
    showWord("포트폴리오");
    later(function(){showWord("제품 소개")},1250);
    later(function(){showWord("아트갤러리")},2500);
    later(function(){showWord("브랜드 디자이너 포트폴리오")},3750);
    later(function(){showWord("내가 원하는 사이트")},5000);
    later(headlineMoment,6250);
    later(headlineSecond,6900);
    later(function(){introDone=true;if(inView&&!userPaused)play()},8400);
    later(revealCtas,8400+T_TOTAL);
  }
  function xf(x,r,s,sc){return "translate(-50%,-50%) translateX("+x+"px) rotate("+r+"deg) skewY("+s+"deg) scale("+sc+")"}
  function build(){
    anims.forEach(function(a){a.cancel()}); anims=[];
    var w=cards[0].offsetWidth||140, sw=stage.clientWidth||600;
    var step=Math.min(0.8,Math.max(0.45,(sw-w-16)/((cards.length-1)*w)));
    cards.forEach(function(card,i){
      var fanX=Math.round((i-(cards.length-1)/2)*step*w);
      var startAt=i===0?0:200+130*(i-1), appearDur=i===0?200:150;
      var hidden=xf(0,ROTS[i],0,0), stacked=xf(0,ROTS[i],0,1), fan=xf(fanX,0,-13,1);
      var kf=[{transform:hidden,offset:0,easing:EASE_OUT}];
      if(startAt>0)kf.push({transform:hidden,offset:startAt/T_TOTAL,easing:EASE_OUT});
      kf.push({transform:stacked,offset:(startAt+appearDur)/T_TOTAL,easing:"linear"});
      kf.push({transform:stacked,offset:Math.max(T_STACK,startAt+appearDur)/T_TOTAL,easing:EASE_OUT});
      kf.push({transform:fan,offset:T_FAN/T_TOTAL,easing:"linear"});
      kf.push({transform:fan,offset:T_HOLD/T_TOTAL,easing:"ease-in-out"});
      kf.push({transform:stacked,offset:1});
      anims.push(card.animate(kf,{duration:T_TOTAL,iterations:Infinity,easing:"linear"}));
    });
    built=true;
  }
  function phase(){
    if(!anims.length)return;
    var t=(anims[0].currentTime||0)%T_TOTAL;
    progEl.style.width=(t/T_TOTAL*100)+"%";
  }
  function loop(){phase(); if(playing)rafId=requestAnimationFrame(loop)}
  function play(){if(playing)return; if(!built)build(); if(!playedOnce){playedOnce=true;anims.forEach(function(a){a.currentTime=0})} anims.forEach(function(a){a.play()}); playing=true; toggleBtn.textContent="일시정지"; cancelAnimationFrame(rafId); loop()}
  function pause(){anims.forEach(function(a){a.pause()}); playing=false; toggleBtn.textContent="재생"; cancelAnimationFrame(rafId); phase()}
  toggleBtn.addEventListener("click",function(){if(playing){userPaused=true;pause()}else{userPaused=false;play()}});
  restartBtn.addEventListener("click",function(){if(!introDone)finishIntro(); userPaused=false; if(!built)build(); anims.forEach(function(a){a.currentTime=0}); if(!playing)play(); else phase()});
  var rzT=null;
  window.addEventListener("resize",function(){clearTimeout(rzT); rzT=setTimeout(function(){
    if(!introDone&&window.matchMedia("(max-width:919px)").matches){finishIntro();revealCtas()}
    if(reduced&&!playing){build(); anims.forEach(function(a){a.pause(); a.currentTime=(T_FAN+T_HOLD)/2}); return}
    var t=anims.length?anims[0].currentTime:0, was=playing; build(); anims.forEach(function(a){a.currentTime=t}); if(was)play(); else pause();
  },200)});
  if(reduced){
    introDone=true;
    if(line1El)line1El.classList.remove("pre");
    if(line2El)line2El.classList.remove("pre");
    if(ctaEl)ctaEl.classList.add("cta-reveal");
    if(topicEl){topicEl.textContent="";["포트폴리오","제품 소개","아트갤러리","브랜드 디자이너 포트폴리오","내가 원하는 사이트"].forEach(function(w,i){if(i)topicEl.append(" · ");var s=document.createElement("span");s.textContent=w;s.style.color=TOPIC_COLORS[w];if(i===4)s.style.fontWeight="900";topicEl.append(s)}); if(topicEl.parentNode)topicEl.parentNode.classList.add("static")}
    build(); anims.forEach(function(a){a.pause(); a.currentTime=(T_FAN+T_HOLD)/2});
    progEl.style.width="50%"; toggleBtn.textContent="재생";
    stage.animate([{opacity:0},{opacity:1}],{duration:600,easing:"ease-out",fill:"both"});
  }else{
    if(window.matchMedia("(max-width:919px)").matches){
      showWord("내가 원하는 사이트");
      if(prevEl)prevEl.classList.add("hp-gone");
      introStarted=true;
      if(line1El)line1El.classList.add("pre");
      if(line2El)line2El.classList.add("pre");
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          revealLine1();
          later(revealLine2,150);
          later(revealCtas,1000);
          later(function(){introDone=true;if(inView&&!userPaused)play()},750);
        });
      });
    }else{
      if(line1El)line1El.classList.add("pre");
      if(line2El)line2El.classList.add("pre");
      stage.classList.add("sf-await");
      if(ctlEl)ctlEl.classList.add("sf-await");
    }
    build(); anims.forEach(function(a){a.pause(); a.currentTime=880}); phase(); progEl.style.width="0%";
    if("IntersectionObserver" in window){
      new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          inView=en.isIntersecting;
          if(inView){if(introDone&&!userPaused)play()}
          else if(playing){pause()}
        });
      },{threshold:0.4}).observe(stage);
      var introEl=$("heroIntro");
      if(introEl){
        var io2=new IntersectionObserver(function(entries){
          entries.forEach(function(en){
            if(en.isIntersecting&&!introStarted){introStarted=true;runIntro();io2.disconnect()}
          });
        },{threshold:0.2});
        io2.observe(introEl);
      }else{introStarted=true;runIntro()}
    }else{inView=true;introStarted=true;runIntro()}
  }
}
