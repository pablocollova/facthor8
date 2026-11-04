
-- Tasks and membership fields are editable in the legacy team workspace; they
-- must not grant access to private email files. Use the immutable email creator.
create or replace function public.task_email_can_access(email_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.task_emails e where e.id=email_id and e.created_by=(select auth.uid()));
$$;
drop policy task_emails_update on public.task_emails;
create policy task_emails_update on public.task_emails for update to authenticated
 using(created_by=(select auth.uid())) with check(created_by=(select auth.uid()));
drop policy task_emails_delete on public.task_emails;
create policy task_emails_delete on public.task_emails for delete to authenticated using(created_by=(select auth.uid()));

create function public.guard_task_email_delete() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null and old.created_by<>auth.uid() then raise exception 'Sin autorización para eliminar este correo'; end if;
 if exists(select 1 from public.task_email_attachments where task_email_id=old.id) then
  raise exception 'Eliminá primero los adjuntos del correo';
 end if;
 if old.send_status in ('sent','sending') then raise exception 'Conservamos los correos enviados o en envío'; end if;
 return old;
end $$;
create trigger guard_task_email_delete before delete on public.task_emails for each row execute function public.guard_task_email_delete();
revoke all on function public.guard_task_email_delete() from public,anon,authenticated;
