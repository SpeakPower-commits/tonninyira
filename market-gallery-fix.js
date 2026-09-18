/* Tonninyira market hero gallery fix + fast loading.
 * Uses only known-good image files; no probing/HEAD/fetch checks for many
 * numbered files. The performance layer may replace this gallery again, but
 * this file is also safe to run by itself.
 */
(function(){
  'use strict';
  const images=[1,2,3,4,5,6];
  const base='assets/market/';
  function addStyles(){
    if(document.getElementById('tn-market-gallery-fix-style')) return;
    const s=document.createElement('style');s.id='tn-market-gallery-fix-style';s.textContent=`
      #marketBanner .hero-gallery{background:#2a1f19;position:relative;overflow:hidden}
      #marketBanner .hero-track{height:100%;display:flex;will-change:transform}
      #marketBanner .tn-market-slide{min-width:100%;height:100%;position:relative;display:block}
      #marketBanner .tn-market-slide img{width:100%;height:100%;display:block;object-fit:cover;background:#33261c}
      #marketBanner .tn-market-caption{position:absolute;left:12px;bottom:12px;right:12px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.58);color:#fff;font-size:.78rem;font-weight:700}
      #marketBanner .tn-market-dots{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);display:flex;gap:5px;z-index:5}
      #marketBanner .tn-market-dots span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.45)}
      #marketBanner .tn-market-dots span.active{background:#f5b400;transform:scale(1.25)}
    `;document.head.appendChild(s);
  }
  function build(){
    const gallery=document.querySelector('#marketBanner .hero-gallery');
    const track=gallery&&gallery.querySelector('.hero-track');
    if(!gallery||!track) return false;
    addStyles();
    track.innerHTML=images.map((n,i)=>`<div class="tn-market-slide"><img src="${base}${n}.jpg" alt="Tonninyira market view ${n}" ${i===0?'loading="eager" fetchpriority="high"':'loading="lazy"'} decoding="async"><div class="tn-market-caption">Real market view · Kampala</div></div>`).join('');
    let dots=gallery.querySelector('.tn-market-dots'); if(dots)dots.remove();
    dots=document.createElement('div');dots.className='tn-market-dots';dots.innerHTML=images.map((_,i)=>`<span class="${i===0?'active':''}"></span>`).join('');gallery.appendChild(dots);
    let index=0;const render=()=>{track.style.transform=`translateX(-${index*100}%)`;[...dots.children].forEach((d,i)=>d.classList.toggle('active',i===index))};
    render();
    const timer=setInterval(()=>{index=(index+1)%images.length;render()},5000);
    gallery.addEventListener('mouseenter',()=>clearInterval(timer),{once:false});
    return true;
  }
  function start(){let tries=0;const t=setInterval(()=>{tries++;if(build()||tries>25)clearInterval(t)},200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
