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
  const mr=await fetch('https://api.mail.hostinger.com/api/v1/mailboxes/'+process.env.HOSTINGER_MAILBOX_ID+'/send',{method:'POST',headers:{Authorization:'Bearer '+process.env.HOSTINGER_MAIL_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({to:split(e.to_email),cc:split(e.cc_email),subject:e.subject,text:e.body,displayName:'Facthor8'})});
  if(mr.status!==204)return res.status(502).json({error:'Hostinger rechazo el envio',detail:await mr.text()});
  const now=new Date().toISOString();
  await fetch(base+'/rest/v1/task_emails?task_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers,body:JSON.stringify({send_status:'sent',sent_at:now,scheduled_at:null,last_error:null})});
  await fetch(base+'/rest/v1/tasks?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers,body:JSON.stringify({status:'waiting',next_step:'Esperar respuesta y hacer seguimiento'})});
  await fetch(base+'/rest/v1/task_updates',{method:'POST',headers,body:JSON.stringify({task_id:id,author_id:usr.id,body:'Email enviado desde info@facthor8.com',update_type:'note'})});
  return res.status(200).json({ok:true,sentAt:now});
 }catch(e){return res.status(500).json({error:e.message||'Error interno'})}
}