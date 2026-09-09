const state={lang:'es'};
const langButton=document.querySelector('.lang');
const menuButton=document.querySelector('.menu-button');
const header=document.querySelector('.site-header');

function setLanguage(lang){
  state.lang=lang;
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-es][data-en]').forEach(el=>{el.textContent=el.dataset[lang]});
  langButton.querySelectorAll('span').forEach(el=>el.classList.toggle('active',el.textContent.toLowerCase()===lang));
  document.title=lang==='es'?'Facthor8 — La capa humana de la ciberseguridad':'Facthor8 — The human security layer';
}

langButton.addEventListener('click',()=>setLanguage(state.lang==='es'?'en':'es'));
menuButton.addEventListener('click',()=>{
  const open=header.classList.toggle('open');
  menuButton.setAttribute('aria-expanded',String(open));
});
header.querySelectorAll('nav a').forEach(link=>link.addEventListener('click',()=>{header.classList.remove('open');menuButton.setAttribute('aria-expanded','false')}));

document.querySelector('.contact-button').addEventListener('click',()=>{
  const status=document.querySelector('.contact-status');
  status.hidden=false;
  status.scrollIntoView({behavior:'smooth',block:'nearest'});
});

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}
}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
