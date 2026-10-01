export default async function handler(req,res){
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'Sesion requerida'});
 if(!process.env.HOSTINGER_MAIL_TOKEN) return res.status(503).json({error:'Mail token missing'});
 const base='https://opqbgwzmbkzkfpldrjlx.supabase.co';
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!key) return res.status(503).json({error:'Supabase key missing'});
 const headers={apikey:key,Authorization:auth,'Content-Type':'application/json'};
 try{
  const ur=await fetch(base+'/auth/v1/user',{headers}); if(!ur.ok)return res.status(401).json({error:'Sesion invalida'});
  const usr=await ur.json(), id=req.body?.taskId; if(!id)return res.status(400).json({error:'Falta taskId'});
  const qr=await fetch(base+'/rest/v1/task_emails?task_id=eq.'+encodeURIComponent(id)+'&select=*',{headers});
  const rows=await qr.json(), e=rows[0]; if(!e)return res.status(404).json({error:'Email no encontrado'});
  if(e.send_status==='sent')return res.status(409).json({error:'Ya enviado'});
  const split=v=>String(v||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean);
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const bodyHtml=esc(e.body).replace(/\r?\n/g,'<br>');
  const isMelina=usr.email==='meliqinta1@gmail.com';
  const senderName=isMelina?'Melina Quintana':'Pablo Collova';
  const senderEmail=isMelina?'melina.quintana@facthor8.com':'pablo.collova@facthor8.com';
  const signature='<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;border-collapse:collapse;font-family:Arial,sans-serif;color:#0b315a"><tr><td style="padding-right:16px;vertical-align:middle"><a href="https://facthor8.com" style="text-decoration:none"><img src="cid:facthor8-logo" width="74" alt="Facthor8" style="display:block;border:0;width:74px;height:auto"></a></td><td style="padding-left:16px;border-left:3px solid #00cfa6;vertical-align:middle"><div style="font-size:16px;font-weight:700">'+senderName+'</div><div style="font-size:13px;color:#52606d;margin-top:2px">Co-Founder · Facthor8</div><div style="font-size:12px;color:#52606d;margin:3px 0 8px">Human Risk Management &amp; Cybersecurity</div><div style="font-size:13px"><a href="mailto:'+senderEmail+'" style="color:#0b5e75;text-decoration:none">'+senderEmail+'</a></div></td></tr></table>';
  const html='<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#17202a">'+bodyHtml+'</div>'+signature;
  const mr=await fetch('https://api.mail.hostinger.com/api/v1/mailboxes/'+process.env.HOSTINGER_MAILBOX_ID+'/send',{method:'POST',headers:{Authorization:'Bearer '+process.env.HOSTINGER_MAIL_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({to:split(e.to_email),cc:split(e.cc_email),subject:e.subject,text:e.body+'\n\n'+senderName+'\nCo-Founder · Facthor8\nHuman Risk Management & Cybersecurity\n'+senderEmail,html,displayName:'Facthor8',attachments:[{filename:'facthor8-logo.png',content:process.env.FACTHOR8_LOGO_BASE64||'',contentType:'image/png',encoding:'base64',cid:'facthor8-logo'}]})});
  if(mr.status!==204)return res.status(502).json({error:'Hostinger rechazo el envio',detail:await mr.text()});
  const now=new Date().toISOString();
  await fetch(base+'/rest/v1/task_emails?task_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers,body:JSON.stringify({send_status:'sent',sent_at:now,scheduled_at:null,last_error:null})});
  await fetch(base+'/rest/v1/tasks?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers,body:JSON.stringify({status:'waiting',next_step:'Esperar respuesta y hacer seguimiento'})});
  await fetch(base+'/rest/v1/task_updates',{method:'POST',headers,body:JSON.stringify({task_id:id,author_id:usr.id,body:'Email enviado desde info@facthor8.com',update_type:'note'})});
  return res.status(200).json({ok:true,sentAt:now});
 }catch(e){return res.status(500).json({error:e.message||'Error interno'})}
}