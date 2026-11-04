const rules = require('../dist/task/attachment-rules.js');
module.exports = async function handler(req,res){
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'Sesion requerida'});
 if(!process.env.HOSTINGER_MAILBOX_ID || !process.env.HOSTINGER_MAIL_TOKEN) return res.status(503).json({error:'Mail token missing'});
 const base='https://opqbgwzmbkzkfpldrjlx.supabase.co';
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!key) return res.status(503).json({error:'Supabase key missing'});
 const headers={apikey:key,Authorization:auth,'Content-Type':'application/json'};
 let locked=null, providerStarted=false, accepted=false;
 const request=async(path,options={})=>{
  const r=await fetch(base+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw Error('No se pudo completar la operación en Supabase ('+r.status+').');
  return r.status===204?null:r.json();
 };
 const fail=async(message)=>{if(locked)await request('/rest/v1/task_emails?id=eq.'+locked,{method:'PATCH',body:JSON.stringify({send_status:'failed',last_error:message})});};
 try{
  const ur=await fetch(base+'/auth/v1/user',{headers}); if(!ur.ok)return res.status(401).json({error:'Sesion invalida'});
  const usr=await ur.json();
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body)}catch{return res.status(400).json({error:'JSON inválido'})}}
  const id=body?.taskId;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'taskId inválido'});
  const rows=await request('/rest/v1/task_emails?task_id=eq.'+id+'&select=*'), e=rows[0];
  if(!e)return res.status(404).json({error:'Email no encontrado o sin autorización'});
  const allowed=await request('/rest/v1/rpc/task_email_can_access',{method:'POST',body:JSON.stringify({email_id:e.id})});
  if(!allowed)return res.status(403).json({error:'Sin autorización para este correo'});
  if(['sent','sending'].includes(e.send_status))return res.status(409).json({error:e.send_status==='sent'?'Ya enviado':'Envío en curso o pendiente de verificar. No reintentes para evitar duplicados.'});
  const split=v=>String(v||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean);
  if(!split(e.to_email).length||[...split(e.to_email),...split(e.cc_email)].some(x=>! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))||!e.subject?.trim()||!e.body?.trim())return res.status(400).json({error:'Completá destinatarios válidos, asunto y mensaje.'});
  const claimed=await request('/rest/v1/task_emails?id=eq.'+e.id+'&send_status=eq.'+e.send_status+'&updated_at=eq.'+encodeURIComponent(e.updated_at),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({send_status:'sending',last_error:null})});
  if(!claimed?.length)return res.status(409).json({error:'El borrador cambió o ya se está enviando. Volvé a abrirlo.'});
  locked=e.id;
  const files=await request('/rest/v1/task_email_attachments?task_email_id=eq.'+e.id+'&select=*&order=created_at.asc');
  try{rules.validateList(files);if(files.some(f=>f.upload_status!=='ready'))throw Error('Hay adjuntos pendientes. Completá la subida o eliminálos antes de enviar.');}
  catch(err){await fail(err.message);return res.status(400).json({error:err.message});}
  const attachments=[];
  for(const f of files){
   if(!f.object_path.startsWith(e.id+'/'))throw Error('Ruta de adjunto inválida.');
   const r=await fetch(base+'/storage/v1/object/authenticated/'+rules.bucket+'/'+f.object_path.split('/').map(encodeURIComponent).join('/'),{headers,signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error('No se pudo leer el adjunto '+f.filename+'. Volvé a subirlo.');
   const bytes=Buffer.from(await r.arrayBuffer());
   if(!bytes.length||bytes.length!==f.byte_size||bytes.length>rules.maxFile)throw Error('Adjunto vacío o incompleto: '+f.filename);
   attachments.push({filename:f.filename,content:bytes.toString('base64'),contentType:f.content_type,encoding:'base64'});
  }
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const bodyHtml=esc(e.body).replace(/\r?\n/g,'<br>');
  const isMelina=usr.email==='meliqinta1@gmail.com';
  const senderName=isMelina?'Melina Quintana':'Pablo Collova';
  const senderEmail=isMelina?'melina.quintana@facthor8.com':'pablo.collova@facthor8.com';
  const signature='<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;border-collapse:collapse;font-family:Arial,sans-serif;color:#0b315a"><tr><td style="padding-right:16px;vertical-align:middle"><a href="https://facthor8.com" style="text-decoration:none;font-size:18px;font-weight:800;color:#0b315a">Facthor8</a></td><td style="padding-left:16px;border-left:3px solid #00cfa6;vertical-align:middle"><div style="font-size:16px;font-weight:700">'+senderName+'</div><div style="font-size:13px;color:#52606d;margin-top:2px">Co-Founder · Facthor8</div><div style="font-size:12px;color:#52606d;margin:3px 0 8px">Human Risk Management &amp; Cybersecurity</div><div style="font-size:13px"><a href="mailto:'+senderEmail+'" style="color:#0b5e75;text-decoration:none">'+senderEmail+'</a></div></td></tr></table>';
  const html='<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#17202a">'+bodyHtml+'</div>'+signature;
  providerStarted=true;
  const mr=await fetch('https://api.mail.hostinger.com/api/v1/mailboxes/'+process.env.HOSTINGER_MAILBOX_ID+'/send',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+process.env.HOSTINGER_MAIL_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({to:split(e.to_email),cc:split(e.cc_email),subject:e.subject,text:e.body+'\n\n'+senderName+'\nCo-Founder · Facthor8\nHuman Risk Management & Cybersecurity\n'+senderEmail,html,displayName:'Facthor8',...(attachments.length?{attachments}:{})})});
  if(mr.status!==204){
   // Explicit client rejection is safe to retry; 5xx responses may be ambiguous.
   if(mr.status>=400&&mr.status<500)await fail('Hostinger rechazó el envío ('+mr.status+').');
   return res.status(502).json({error:mr.status>=500?'Hostinger no confirmó el resultado. Revisá Enviados antes de reintentar.':'Hostinger rechazó el envío ('+mr.status+'). Los archivos y el borrador se conservaron.'});
  }
  accepted=true;
  const now=new Date().toISOString();
  await request('/rest/v1/task_emails?id=eq.'+e.id,{method:'PATCH',body:JSON.stringify({send_status:'sent',sent_at:now,scheduled_at:null,last_error:null})});
  let warning=null;
  try{
   await request('/rest/v1/tasks?id=eq.'+id,{method:'PATCH',body:JSON.stringify({status:'waiting',next_step:'Esperar respuesta y hacer seguimiento'})});
   await request('/rest/v1/task_updates',{method:'POST',body:JSON.stringify({task_id:id,author_id:usr.id,body:'Email enviado desde info@facthor8.com con '+attachments.length+' adjuntos',update_type:'note'})});
  }catch{warning='El correo se envió, pero no se pudo actualizar el seguimiento.'}
  return res.status(200).json({ok:true,sentAt:now,warning});
 }catch(err){
  if(locked&&!providerStarted){try{await fail(err.message)}catch{}}
  return res.status(accepted?200:500).json(accepted?{ok:true,warning:'Hostinger aceptó el correo, pero no se pudo guardar el estado. No lo reenvíes; revisá Enviados.'}:{error:providerStarted?'No se confirmó el resultado del envío. Revisá Enviados antes de reintentar.':err.message||'Error interno'});
 }
};
