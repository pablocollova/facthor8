
begin;
select set_config('test.owner',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.task',gen_random_uuid()::text,true);
select set_config('test.email',gen_random_uuid()::text,true);
insert into public.tasks(id,title,created_by,owner_id,task_type)
values(current_setting('test.task')::uuid,'TEST rollback attachments',current_setting('test.owner')::uuid,current_setting('test.owner')::uuid,'email');
insert into public.task_emails(id,task_id,created_by)
values(current_setting('test.email')::uuid,current_setting('test.task')::uuid,current_setting('test.owner')::uuid);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare a uuid; i int; did_fail boolean;
begin
 if not public.task_email_can_access(current_setting('test.email')::uuid) then raise exception 'Owner denied'; end if;
 for i in 1..6 loop
  a:=gen_random_uuid();
  insert into public.task_email_attachments(id,task_email_id,filename,content_type,byte_size,object_path,created_by)
  values(a,current_setting('test.email')::uuid,'test.txt','text/plain',4,current_setting('test.email')||'/'||a::text,auth.uid());
 end loop;
 did_fail:=false;
 begin
  a:=gen_random_uuid();
  insert into public.task_email_attachments(id,task_email_id,filename,content_type,byte_size,object_path,created_by)
  values(a,current_setting('test.email')::uuid,'extra.txt','text/plain',4,current_setting('test.email')||'/'||a::text,auth.uid());
 exception when others then
  if sqlerrm not like '%Máximo 6%' then raise; end if;
  did_fail:=true;
 end;
 if not did_fail then raise exception 'Seventh attachment accepted'; end if;
 did_fail:=false;
 begin
  update public.task_email_attachments set upload_status='ready' where task_email_id=current_setting('test.email')::uuid;
 exception when others then
  if sqlerrm not like '%Archivo vacío%' then raise; end if;
  did_fail:=true;
 end;
 if not did_fail then raise exception 'Missing object marked ready'; end if;
 update public.task_emails set send_status='sending' where id=current_setting('test.email')::uuid;
 did_fail:=false;
 begin
  delete from public.task_email_attachments where task_email_id=current_setting('test.email')::uuid;
 exception when others then
  if sqlerrm not like '%No se pueden cambiar%' then raise; end if;
  did_fail:=true;
 end;
 if not did_fail then raise exception 'Sending attachments deleted'; end if;
end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$
begin
 if public.task_email_can_access(current_setting('test.email')::uuid) then raise exception 'Unrelated user allowed'; end if;
 if exists(select 1 from public.task_email_attachments where task_email_id=current_setting('test.email')::uuid) then raise exception 'RLS leaked attachments'; end if;
end $$;
reset role;
rollback;
