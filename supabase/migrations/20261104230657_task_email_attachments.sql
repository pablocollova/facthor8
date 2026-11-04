
-- Private email attachments. Pending reservations count toward quotas.
create function public.task_email_can_access(email_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.task_emails e join public.tasks t on t.id=e.task_id
 where e.id=email_id and auth.uid() is not null and
 (e.created_by=auth.uid() or t.created_by=auth.uid() or t.owner_id=auth.uid()
 or exists(select 1 from public.task_members m where m.task_id=t.id and m.user_id=auth.uid())));
$$;
revoke all on function public.task_email_can_access(uuid) from public,anon;
grant execute on function public.task_email_can_access(uuid) to authenticated;

create table public.task_email_attachments (
 id uuid primary key default gen_random_uuid(),
 task_email_id uuid not null references public.task_emails(id) on delete cascade,
 filename text not null check(length(filename) between 1 and 180 and filename !~ '[[:cntrl:]/]' and position(chr(92) in filename)=0),
 content_type text not null,
 byte_size bigint not null check(byte_size between 1 and 5242880),
 object_path text not null unique,
 upload_status text not null default 'pending' check(upload_status in ('pending','ready')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check(object_path=task_email_id::text||'/'||id::text)
);
create index on public.task_email_attachments(task_email_id);
alter table public.task_email_attachments enable row level security;
grant select,insert,update,delete on public.task_email_attachments to authenticated;
revoke all on public.task_email_attachments from anon;

create policy email_attachments_read on public.task_email_attachments for select to authenticated
 using(public.task_email_can_access(task_email_id));
create policy email_attachments_insert on public.task_email_attachments for insert to authenticated
 with check(public.task_email_can_access(task_email_id) and created_by=(select auth.uid()));
create policy email_attachments_update on public.task_email_attachments for update to authenticated
 using(public.task_email_can_access(task_email_id))
 with check(public.task_email_can_access(task_email_id));
create policy email_attachments_delete on public.task_email_attachments for delete to authenticated
 using(public.task_email_can_access(task_email_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('task-email-attachments','task-email-attachments',false,5242880,
 array['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);

create policy email_files_read on storage.objects for select to authenticated using (
 bucket_id='task-email-attachments' and exists (
 select 1 from public.task_email_attachments a where a.object_path=name and public.task_email_can_access(a.task_email_id)));
create policy email_files_insert on storage.objects for insert to authenticated with check (
 bucket_id='task-email-attachments' and exists (
 select 1 from public.task_email_attachments a join public.task_emails e on e.id=a.task_email_id
 where a.object_path=name and a.upload_status='pending' and public.task_email_can_access(e.id)
 and e.send_status not in ('sending','sent')));
create policy email_files_delete on storage.objects for delete to authenticated using (
 bucket_id='task-email-attachments' and exists (
 select 1 from public.task_email_attachments a join public.task_emails e on e.id=a.task_email_id
 where a.object_path=name and public.task_email_can_access(e.id) and e.send_status not in ('sending','sent')));

create function public.check_task_email_attachment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare parent_id uuid; state text; n bigint; total bigint; expected text; object_size bigint; object_type text;
begin
 parent_id := case when TG_OP='DELETE' then old.task_email_id else new.task_email_id end;
 select send_status into state from public.task_emails where id=parent_id for update;
 -- Parent deletion cascade is allowed; Storage cleanup is handled before task deletion.
 if TG_OP='DELETE' and state is null then return old; end if;
 if state is null or not public.task_email_can_access(parent_id) then raise exception 'Sin autorización'; end if;
 if state in ('sent','sending') then raise exception 'No se pueden cambiar adjuntos de un correo enviado o en envío'; end if;
 if TG_OP='DELETE' then
  if exists(select 1 from storage.objects where bucket_id='task-email-attachments' and name=old.object_path)
  then raise exception 'Eliminá primero el archivo privado'; end if;
  return old;
 end if;
 if TG_OP='UPDATE' and (new.id,new.task_email_id,new.filename,new.content_type,new.byte_size,new.object_path,new.created_by,new.created_at)
 is distinct from (old.id,old.task_email_id,old.filename,old.content_type,old.byte_size,old.object_path,old.created_by,old.created_at)
 then raise exception 'Los metadatos del adjunto son inmutables'; end if;
 if TG_OP='INSERT' and (new.created_by<>auth.uid() or new.upload_status<>'pending') then raise exception 'Reserva inválida'; end if;
 expected:=case lower(regexp_replace(new.filename,'^.*\.',''))
 when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png'
 when 'gif' then 'image/gif' when 'webp' then 'image/webp' when 'pdf' then 'application/pdf'
 when 'txt' then 'text/plain' when 'csv' then 'text/csv'
 when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation' end;
 if expected is null or expected<>new.content_type then raise exception 'Tipo de archivo no permitido'; end if;
 select count(*),coalesce(sum(byte_size),0) into n,total from public.task_email_attachments where task_email_id=parent_id and id<>new.id;
 if n>=6 or total+new.byte_size>15728640 then raise exception 'Máximo 6 adjuntos y 15 MB por correo'; end if;
 if new.upload_status='ready' then
  select (metadata->>'size')::bigint,metadata->>'mimetype' into object_size,object_type
   from storage.objects where bucket_id='task-email-attachments' and name=new.object_path;
  if object_size is distinct from new.byte_size or object_type is distinct from new.content_type then
   raise exception 'Archivo vacío, incompleto o de tipo incorrecto';
  end if;
 end if;
 return new;
end $$;
create trigger check_task_email_attachment before insert or update or delete on public.task_email_attachments
 for each row execute function public.check_task_email_attachment();
revoke all on function public.check_task_email_attachment() from public,anon,authenticated;

-- Freeze message content while sending; preserve original creator on updates.
create function public.guard_task_email_content() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (new.created_by,new.task_id,new.id) is distinct from (old.created_by,old.task_id,old.id)
 then raise exception 'No se puede cambiar el propietario del correo'; end if;
 if old.send_status in ('sending','sent') and
 (new.to_email,new.cc_email,new.subject,new.body) is distinct from (old.to_email,old.cc_email,old.subject,old.body)
 then raise exception 'No se puede editar un correo enviado o en envío'; end if;
 if old.send_status='sent' and new.send_status<>'sent' then raise exception 'El correo ya fue enviado'; end if;
 return new;
end $$;
create trigger guard_task_email_content before update on public.task_emails
 for each row execute function public.guard_task_email_content();
revoke all on function public.guard_task_email_content() from public,anon,authenticated;
