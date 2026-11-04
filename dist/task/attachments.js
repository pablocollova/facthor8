const ar=AttachmentRules;
let attachments=[],mailBusy=false,attachmentLoad=0;
$('mailFiles').accept=ar.accept;
function setMailBusy(b){
 mailBusy=b;
 const email=editing?.task_emails?.[0];const locked=!!email&&(email.created_by!==user.id||['sent','sending'].includes(email.send_status));
 $('taskDialog').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=b);
 for(const id of ['mailTo','mailCc','mailSubject','mailBody','mailSchedule','mailFiles','sendMail','scheduleMail','deleteTask'])$(id).disabled=b||locked;
 renderAttachments();
}
$('taskDialog').addEventListener('cancel',ev=>{if(mailBusy)ev.preventDefault()});
function showAttachmentError(err){$('attachmentMsg').textContent=err.message||'No se pudieron cargar los adjuntos.'}
async function loadAttachments(){
 const version=++attachmentLoad,email=editing?.task_emails?.[0];
 attachments=[];renderAttachments();
 if(!email){$('attachmentMsg').textContent='Al adjuntar se guardará el borrador automáticamente.';setMailBusy(mailBusy);return}
 if(email.created_by!==user.id){$('attachmentMsg').textContent='Los adjuntos privados solo están disponibles para el autor del correo.';setMailBusy(mailBusy);return}
 $('attachmentMsg').textContent='Cargando adjuntos...';
 const {data,error}=await sb.from('task_email_attachments').select('*').eq('task_email_id',email.id).order('created_at');
 if(version!==attachmentLoad)return;
 if(error){$('sendMail').disabled=true;throw error}
 attachments=data||[];$('attachmentMsg').textContent='';setMailBusy(mailBusy);
}
function renderAttachments(){
 const email=editing?.task_emails?.[0];const locked=mailBusy||!!email&&(email.created_by!==user.id||['sent','sending'].includes(email.send_status));
 $('attachmentList').innerHTML=attachments.map(a=>`<li><span><b>${esc(a.filename)}</b> · ${(a.byte_size/1048576).toFixed(2)} MB · ${a.upload_status==='ready'?'Guardado':'Subida pendiente: eliminá y volvé a adjuntar'}</span><button type="button" data-file-open="${a.id}" ${mailBusy||a.upload_status!=='ready'?'disabled':''}>Ver / descargar</button><button type="button" data-file-remove="${a.id}" ${locked?'disabled':''}>Eliminar</button></li>`).join('')||'<li>Sin adjuntos.</li>';
 $('attachmentList').querySelectorAll('[data-file-remove]').forEach(b=>b.onclick=async()=>{
  if(mailBusy)return;setMailBusy(true);
  try{await removeAttachment(attachments.find(a=>a.id===b.dataset.fileRemove));await loadAttachments()}
  catch(err){showAttachmentError(err)}finally{setMailBusy(false)}
 });
 $('attachmentList').querySelectorAll('[data-file-open]').forEach(b=>b.onclick=async()=>{
  if(mailBusy)return;
  const a=attachments.find(a=>a.id===b.dataset.fileOpen);setMailBusy(true);
  try{
   const {data,error}=await sb.storage.from(ar.bucket).download(a.object_path);if(error)throw error;
   if(data.size!==a.byte_size)throw Error('Archivo incompleto. Volvé a adjuntarlo.');
   const url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download=a.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(err){showAttachmentError(err)}finally{setMailBusy(false)}
 });
}
async function removeAttachment(a){
 const {error:storageError}=await sb.storage.from(ar.bucket).remove([a.object_path]);if(storageError)throw storageError;
 const {error}=await sb.from('task_email_attachments').delete().eq('id',a.id);if(error)throw error;
}
$('mailFiles').onchange=async ev=>{
 const selected=[...ev.target.files];ev.target.value='';
 if(!selected.length||mailBusy)return;
 setMailBusy(true);
 try{
  ar.validateList([...attachments,...selected]);
  const t=await save(false);if(!t)throw Error('Guardá el borrador antes de adjuntar.');
  await loadAttachments();ar.validateList([...attachments,...selected]);
  const email=editing.task_emails?.[0];if(!email)throw Error('No se pudo guardar el correo.');
  for(const file of selected){
   const id=crypto.randomUUID(),path=email.id+'/'+id,type=ar.validate(file);
   const row={id,task_email_id:email.id,filename:file.name,content_type:type,byte_size:file.size,object_path:path,created_by:user.id,upload_status:'pending'};
   const {error:reservationError}=await sb.from('task_email_attachments').insert(row);if(reservationError)throw reservationError;
   $('attachmentMsg').textContent='Subiendo '+file.name+'...';
   const {error:uploadError}=await sb.storage.from(ar.bucket).upload(path,file,{contentType:type,upsert:false});if(uploadError)throw uploadError;
   const {error:finalizeError}=await sb.from('task_email_attachments').update({upload_status:'ready'}).eq('id',id);if(finalizeError)throw finalizeError;
  }
  await loadAttachments();$('attachmentMsg').textContent='Adjuntos guardados en el borrador.';
 }catch(err){
  try{await loadAttachments()}catch{}
  showAttachmentError(err);
 }finally{setMailBusy(false)}
};

async function mailAction(mode){
 if(mailBusy)return;
 setMailBusy(true);
 try{
  const t=await save(false);if(!t)return;
  await loadAttachments();
  if(attachments.some(a=>a.upload_status!=='ready'))throw Error('Completá o eliminá los adjuntos pendientes antes de enviar.');
  const e=editing.task_emails?.[0];
  if(!e||['sent','sending'].includes(e.send_status))throw Error('El correo ya fue enviado o está pendiente de verificar.');
  if(!$('mailTo').value.trim()||!$('mailSubject').value.trim()||!$('mailBody').value.trim())throw Error('Completá Para, Asunto y Mensaje.');
  if(mode==='schedule'){
   if(!$('mailSchedule').value||new Date($('mailSchedule').value)<=new Date())throw Error('Elegí una fecha y hora futura.');
   const {error}=await sb.from('task_emails').update({send_status:'scheduled',scheduled_at:new Date($('mailSchedule').value).toISOString(),last_error:null}).eq('id',e.id).not('send_status','in','(sent,sending)');
   if(error)throw error;
   $('mailStatus').textContent='🕒 Programado (pendiente de activar el despachador seguro).';
  }else{
   const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Iniciá sesión nuevamente.');
   $('mailStatus').textContent='Enviando...';
   const r=await fetch('/api/task-email-send',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({taskId:t.id})});
   const out=await r.json();
   if(!r.ok)throw Error(out.error||'No se pudo enviar');
   $('mailStatus').textContent=out.warning||'✓ Enviado correctamente';
   $('taskStatus').value='waiting';
  }
 }catch(err){$('taskMsg').textContent=err.message;}
 finally{
  try{if(editing){const id=editing.id;await loadTasks();editing=tasks.find(t=>t.id===id)||editing;}}catch{}
  setMailBusy(false);
 }
}
$('sendMail').onclick=()=>mailAction('send');$('scheduleMail').onclick=()=>mailAction('schedule');
$('saveTask').onclick=async()=>{if(mailBusy)return;setMailBusy(true);try{await save(true)}catch(err){$('taskMsg').textContent=err.message}finally{setMailBusy(false)}};
$('deleteTask').onclick=async()=>{
 if(mailBusy||!editing||!confirm('¿Eliminar esta tarea y sus adjuntos?'))return;
 setMailBusy(true);
 try{
  await loadAttachments();
  const e=editing.task_emails?.[0];
  if(e&&['sent','sending'].includes(e.send_status))throw Error('Conservamos los correos enviados o pendientes de verificar y sus adjuntos.');
  for(const a of [...attachments])await removeAttachment(a);
  const {error}=await sb.from('tasks').delete().eq('id',editing.id);if(error)throw error;
  $('taskDialog').close();await loadTasks();
 }catch(err){$('taskMsg').textContent=err.message;}
 finally{setMailBusy(false);}
};
init();
