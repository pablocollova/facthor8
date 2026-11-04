const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const rules=require('../dist/task/attachment-rules.js');
function setup(failUpload=false){
 const nodes=new Map(),rows=[],objects=new Map();let sends=0,saves=0;
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'value',textContent:'',innerHTML:'',disabled:false,querySelectorAll:()=>[],addEventListener(){},close(){}});return nodes.get(id)};
 const owner=randomUUID(),email={id:randomUUID(),created_by:owner,send_status:'draft'},task={id:randomUUID(),task_emails:[email]};
 const sb={from(table){
  let operation='select',payload,field,value;
  const q={select(){return q},eq(f,v){field=f;value=v;return q},order(){return q},not(){return q},
   insert(p){operation='insert';payload=p;return q},update(p){operation='update';payload=p;return q},delete(){operation='delete';return q},
   then(resolve){
    if(table==='task_email_attachments'){
     if(operation==='insert')rows.push({...payload});
     if(operation==='update')rows.filter(r=>r[field]===value).forEach(r=>Object.assign(r,payload));
     if(operation==='delete'){const i=rows.findIndex(r=>r[field]===value);if(i>=0)rows.splice(i,1)}
    }
    return Promise.resolve({data:rows.filter(r=>!field||r[field]===value).map(r=>({...r})),error:null}).then(resolve);
   }
  };return q;
 },storage:{from:()=>({
  async upload(path,file){if(failUpload)return {error:Error('Subida interrumpida')};objects.set(path,await file.text());return {error:null}},
  async remove(paths){paths.forEach(p=>objects.delete(p));return {error:null}}
 })}};
 const context=vm.createContext({AttachmentRules:rules,$,sb,user:{id:owner},editing:task,tasks:[task],esc:s=>s,init(){},crypto:{randomUUID},URL,setTimeout,document:{},confirm:()=>true,
  async save(){saves++;return task},async loadTasks(){},async fetch(){sends++;throw Error('No real sends')}
 });
 vm.runInContext(fs.readFileSync('dist/task/attachments.js','utf8')+'\nglobalThis.api={loadAttachments,removeAttachment,mailAction,getAttachments:()=>attachments,isBusy:()=>mailBusy};',context);
 return {context,$,rows,objects,task,get sends(){return sends},get saves(){return saves}};
}
const select=async(s,files)=>s.$('mailFiles').onchange({target:{files,value:'selected'}});
test('six selected files persist across reopening and can be deleted',async()=>{
 const s=setup();
 const files=Array.from({length:6},(_,i)=>new File(['hola'],'imagen-'+i+'.txt',{type:'text/plain'}));
 await select(s,files);
 assert.equal(s.rows.length,6);assert.equal(s.objects.size,6);assert(s.rows.every(r=>r.upload_status==='ready'));
 await s.context.api.loadAttachments();assert.equal(s.context.api.getAttachments().length,6);
 assert.match(s.$('attachmentList').innerHTML,/imagen-5.txt/);
 await s.context.api.removeAttachment(s.rows[0]);await s.context.api.loadAttachments();
 assert.equal(s.rows.length,5);assert.equal(s.objects.size,5);assert.equal(s.sends,0);assert.equal(s.context.api.isBusy(),false);
});
test('interrupted upload remains visible after reopening and blocks sending',async()=>{
 const s=setup(true);await select(s,[new File(['hola'],'test.txt',{type:'text/plain'})]);
 assert.equal(s.rows.length,1);assert.equal(s.rows[0].upload_status,'pending');
 await s.context.api.loadAttachments();await s.context.api.mailAction('send');
 assert.match(s.$('taskMsg').textContent,/adjuntos pendientes/);assert.equal(s.sends,0);assert.equal(s.context.api.isBusy(),false);
 await s.context.api.removeAttachment(s.rows[0]);assert.equal(s.rows.length,0);
});
test('empty and seventh file are rejected before saving or uploading',async()=>{
 const s=setup();await select(s,[new File([],'empty.txt',{type:'text/plain'})]);assert.equal(s.saves,0);assert.equal(s.rows.length,0);
 await select(s,Array.from({length:7},()=>new File(['a'],'test.txt',{type:'text/plain'})));
 assert.equal(s.saves,0);assert.equal(s.objects.size,0);
});
