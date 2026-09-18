/* Tonninyira performance layer.
 * Keeps every real market photo in the hero while making only the first
 * photo critical. Images 2+ are lazy-loaded and the next slide is warmed
 * just before rotation so the slideshow remains complete and smooth.
 */
(function(){
  'use strict';

  const FALLBACK_IMAGES = [1,2,3,4,5,6,11,12,13];
  const MANIFEST_URL = 'assets/market/manifest.json';
  const BASE_JPG = 'assets/market/';
  const BASE_WEBP = 'assets/market/optimized/';

  function addStyle(){
    if(document.getElementById('tn-performance-style')) return;
    const s=document.createElement('style');
    s.id='tn-performance-style';
    s.textContent=`
      .stall-card{content-visibility:auto;contain-intrinsic-size:420px}
      .gallery-item img,.gallery-item video{contain:layout paint style}
      .hero-slide img,.tn-market-slide img{background:#33261c}
    `;
    document.head.appendChild(s);
  }

  function preload(url){
    if(!url || [...document.querySelectorAll('link[data-tn-preload]')].some(l=>l.dataset.tnPreload===url)) return;
    const l=document.createElement('link');
    l.rel='preload';
    l.as='image';
    l.href=url;
    l.fetchPriority='low';
    l.dataset.tnPreload=url;
    document.head.appendChild(l);
  }

  function pictureMarkup(item,index){
    const id=String(item.id);
    const jpg=item.src || `${BASE_JPG}${id}.jpg`;
    const webp=item.webp || `${BASE_WEBP}${id}.webp`;
    const critical=index===0;
    return `<picture><source srcset="${webp}" type="image/webp"><img src="${jpg}" alt="Tonninyira market view ${id}" width="1600" height="1000" ${critical?'loading="eager" fetchpriority="high"':'loading="lazy" fetchpriority="low"'} decoding="async"></picture>`;
  }

  function normalizeItems(data){
    if(Array.isArray(data?.images) && data.images.length) return data.images;
    return FALLBACK_IMAGES.map(id=>({id,src:`${BASE_JPG}${id}.jpg`,webp:`${BASE_WEBP}${id}.webp`}));
  }

  async function getItems(){
    try{
      const res=await fetch(MANIFEST_URL,{cache:'force-cache'});
      if(res.ok) return normalizeItems(await res.json());
    }catch(_){/* fallback keeps the gallery working offline */}
    return normalizeItems(null);
  }

  async function optimizeHero(){
    const banner=document.getElementById('marketBanner');
    const gallery=banner && banner.querySelector('.hero-gallery');
    const track=gallery && gallery.querySelector('.hero-track');
    if(!gallery || !track || gallery.dataset.tnOptimized==='1') return false;

    gallery.dataset.tnOptimized='1';
    addStyle();

    const items=await getItems();
    if(!items.length) return false;
    preload(items[0].webp || items[0].src);

    track.innerHTML=items.map((item,i)=>`<div class="tn-market-slide hero-slide">${pictureMarkup(item,i)}<div class="tn-market-caption hero-caption">Real market view · Kampala</div></div>`).join('');

    const oldDots=gallery.querySelector('.tn-market-dots');
    if(oldDots) oldDots.remove();
    const dots=document.createElement('div');
    dots.className='tn-market-dots hero-dots';
    dots.innerHTML=items.map((_,i)=>`<span class="${i===0?'active':''}" aria-hidden="true"></span>`).join('');
    gallery.appendChild(dots);

    let index=0;
    const warmNext=()=>{
      const next=items[(index+1)%items.length];
      preload(next.webp || next.src);
    };
    const render=()=>{
      track.style.transform=`translateX(-${index*100}%)`;
      [...dots.children].forEach((d,i)=>d.classList.toggle('active',i===index));
      warmNext();
    };
    render();

    let timer=0;
    const advance=()=>{index=(index+1)%items.length;render();};
    const start=()=>{if(timer)clearInterval(timer);timer=setInterval(advance,5000)};
    const stop=()=>{if(timer){clearInterval(timer);timer=0}};
    gallery.addEventListener('mouseenter',stop);
    gallery.addEventListener('mouseleave',start);
    gallery.addEventListener('touchstart',stop,{passive:true});
    gallery.addEventListener('touchend',start,{passive:true});
    start();
    return true;
  }

  function lazyVendorMedia(){
    document.querySelectorAll('.gallery-item img').forEach(img=>{img.loading='lazy';img.decoding='async';});
    document.querySelectorAll('.gallery-item video').forEach(v=>v.preload='none');
    document.querySelectorAll('.stall-card .avatar').forEach(img=>{
      if(img.tagName==='IMG'){img.loading='lazy';img.decoding='async';}
    });
  }

  function start(){
    addStyle();
    lazyVendorMedia();
    optimizeHero().catch(()=>{});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
