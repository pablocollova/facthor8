const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../dist/task/attachment-rules.js');
const handler=require('../api/task-email-send.js');
const taskId='11111111-1111-4111-8111-111111111111';
const emailId='22222222-2222-4222-8222-222222222222';
const file={id:'33333333-3333-4333-8333-333333333333',task_email_id:emailId,filename:'documento.txt',content_type:'text/plain',byte_size:4,object_path:emailId+'/33333333-3333-4333-8333-333333333333',upload_status:'ready'};
async function run(options={}){
 const calls=[];let providerBody;
 const original=global.fetch;
 process.env.HOSTINGER_MAIL_TOKEN='test';process.env.HOSTINGER_MAILBOX_ID='test';process.env.SUPABASE_PUBLISHABLE_KEY='test';
 global.fetch=async(url,init={})=>{
  calls.push({url,init});
  if(url.includes('/auth/v1/user'))return Response.json({id:'user',email:'test@example.com'},{status:options.authStatus||200});
  if(url.includes('/rpc/'))return Response.json(options.allowed!==false);
  if(url.includes('/storage/'))return new Response(options.empty?'':'hola',{status:options.downloadStatus||200});
  if(url.includes('api.mail.hostinger.com')){
   providerBody=JSON.parse(init.body);
   if(options.timeout)throw Error('timeout');
   return new Response(null,{status:options.providerStatus||204});
  }
  if(url.includes('task_email_attachments'))return Response.json(options.files||[file]);
  if(url.includes('task_emails')&&!init.method)return Response.json([{id:emailId,task_id:taskId,send_status:options.state||'draft',to_email:'user@example.com',subject:'Prueba',body:'Mensaje',updated_at:'2026-11-05T00:00:00Z'}]);
  if(init.method==='PATCH'&&init.headers.Prefer)return Response.json(options.conflict?[]:[{id:emailId}]);
  if(options.persistFailure&&url.includes('task_emails')&&JSON.parse(init.body||'{}').send_status==='sent')return new Response(null,{status:500});
  return new Response(null,{status:204});
 };
 const res={code:0,status(n){this.code=n;return this},json(value){this.body=value;return this}};
 try{await handler({method:'POST',headers:{authorization:'Bearer test'},body:{taskId}},res)}finally{global.fetch=original}
 return {res,calls,providerBody};
}
test('rejects empty files, forbidden MIME, excessive counts and totals',()=>{
 assert.throws(()=>rules.validate({...file,byte_size:0}),/vacío/);
 assert.throws(()=>rules.validate({...file,filename:'x.exe'}),/Formato/);
 assert.throws(()=>rules.validate({...file,content_type:'image/png'}),/Formato/);
 assert.throws(()=>rules.validateList(Array(7).fill(file)),/6 adjuntos/);
 assert.throws(()=>rules.validateList(Array(4).fill({...file,byte_size:rules.maxFile})),/15 MB/);
 assert.throws(()=>rules.validate({...file,filename:'../x.txt'}),/Nombre/);
});
test('sends six actual attachments encoded as base64 and saves sent status',async()=>{
 const {res,providerBody,calls}=await run({files:Array.from({length:6},()=>({...file}))});
 assert.equal(res.code,200);assert.equal(providerBody.attachments.length,6);
 assert.deepEqual(providerBody.attachments[0],{filename:'documento.txt',content:'aG9sYQ==',contentType:'text/plain',encoding:'base64'});
 assert(calls.some(c=>c.init.body?.includes('"send_status":"sent"')));
});
test('omits attachments property for a plain email',async()=>{
 const {res,providerBody}=await run({files:[]});assert.equal(res.code,200);assert(!('attachments' in providerBody));
});
for(const [name,options,status] of [
 ['invalid session',{authStatus:401},401],['unauthorized email',{allowed:false},403],
 ['sent email',{state:'sent'},409],['concurrent send',{conflict:true},409],
 ['pending upload',{files:[{...file,upload_status:'pending'}]},400],
 ['zero metadata bytes',{files:[{...file,byte_size:0}]},400],
 ['empty stored object',{empty:true},500],['missing stored object',{downloadStatus:404},500]
])test(name+' never reaches Hostinger',async()=>{
 const {res,providerBody}=await run(options);assert.equal(res.code,status);assert.equal(providerBody,undefined);
});
test('provider rejection preserves draft data and records failure',async()=>{
 const {res,calls}=await run({providerStatus:422});assert.equal(res.code,502);
 assert(calls.some(c=>c.init.body?.includes('"send_status":"failed"')));
 assert(!calls.some(c=>c.init.method==='DELETE'));
});
test('ambiguous timeout keeps sending state to avoid duplicate retries',async()=>{
 const {res,calls}=await run({timeout:true});assert.equal(res.code,500);
 assert(!calls.some(c=>c.init.body?.includes('"send_status":"failed"')));
});
test('accepted email with persistence failure returns warning and never retries provider',async()=>{
 const {res,calls}=await run({persistFailure:true});assert.equal(res.code,200);assert(res.body.warning);
 assert.equal(calls.filter(c=>c.url.includes('api.mail.hostinger.com')).length,1);
});
