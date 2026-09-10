const state={lang:'es'};
const langButton=document.querySelector('.lang');
const menuButton=document.querySelector('.menu-button');
const header=document.querySelector('.site-header');

const contactMessages={
  sending:{es:'Enviando…',en:'Sending…'},
  success:{es:'Gracias. Te contactaremos en menos de 24-48h laborables.',en:'Thank you. We will reach out within 24–48 business hours.'},
  error:{es:'No pudimos enviar tu solicitud. Escribinos directamente a info@facthor8.com.',en:'We could not send your request. Please email us directly at info@facthor8.com.'},
  invalid:{es:'Completá nombre, email de trabajo y empresa.',en:'Please fill in name, work email and company.'}
};

function setLanguage(lang){
  state.lang=lang;
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-es][data-en]').forEach(el=>{el.textContent=el.dataset[lang]});
  langButton.querySelectorAll('span').forEach(el=>el.classList.toggle('active',el.textContent.toLowerCase()===lang));
  document.title=lang==='es'?'Facthor8 — La capa humana de la seguridad':'Facthor8 — The Human Security Layer';
  const statusEl=document.querySelector('.contact-status');
  if(statusEl&&statusEl.dataset.state){statusEl.textContent=contactMessages[statusEl.dataset.state][lang]}
}

langButton.addEventListener('click',()=>setLanguage(state.lang==='es'?'en':'es'));
menuButton.addEventListener('click',()=>{
  const open=header.classList.toggle('open');
  menuButton.setAttribute('aria-expanded',String(open));
});
header.querySelectorAll('nav a').forEach(link=>link.addEventListener('click',()=>{header.classList.remove('open');menuButton.setAttribute('aria-expanded','false')}));

const contactForm=document.querySelector('#contact-form');
if(contactForm){
  const statusEl=contactForm.querySelector('.contact-status');
  const submitBtn=contactForm.querySelector('.contact-button');
  const showStatus=(key)=>{statusEl.textContent=contactMessages[key][state.lang];statusEl.dataset.state=key};
  contactForm.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(contactForm).entries());
    if(data.website){return} // honeypot: bots fill hidden fields, humans never see this one
    if(!data.name||!data.email||!data.company){showStatus('invalid');return}
    submitBtn.disabled=true;
    showStatus('sending');
    try{
      const response=await fetch('/api/contact',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(data)
      });
      if(!response.ok)throw new Error('request-failed');
      showStatus('success');
      contactForm.reset();
    }catch(err){
      showStatus('error');
    }finally{
      submitBtn.disabled=false;
    }
  });
}

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}
}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
