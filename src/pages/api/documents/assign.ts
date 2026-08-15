// ABOUTME: Executive document assignment — creates DocuSeal submissions and the system task that chases them.
// ABOUTME: The system task is written on the secret key, because RLS refuses is_system to anyone holding a JWT.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';
import { createAdminClient } from '../../../lib/server/supabase';
import { createSubmissions, isDocusealConfigured } from '../../../lib/server/docuseal';

export const prerender = false;

type Body = {
  templateId?: string;
  userIds?: string[];
  dueAt?: string | null;
};

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  if (!isDocusealConfigured) {
    return json({ error: 'docuseal_not_configured' }, 503);
  }

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body?.templateId || !body.userIds?.length) {
    return json({ error: 'templateId and userIds are required' }, 400);
  }

  /* Checked here rather than left to RLS alone, because this endpoint calls out
     to DocuSeal before it writes anything. Without the check, a delegate could
     make us create real submissions on a real signing server and only fail at
     the last step — the rows would be refused, the submissions would exist. */
  const { data: roles } = await caller.supabase.rpc('my_roles');
  const isExec = ((roles as string[] | null) ?? []).some(
    (role) => role === 'executive' || role === 'superuser',
  );
  if (!isExec) return json({ error: 'forbidden' }, 403);

  const admin = createAdminClient();

  const { data: template, error: templateError } = await caller.supabase
    .from('document_templates')
    .select('id, name_en, docuseal_template_id')
    .eq('id', body.templateId)
    .single();
  if (templateError || !template) return json({ error: 'unknown template' }, 404);

  // Emails come from the database, never from the request. A recipient list a
  // client supplies is a way to send a JMCC-branded signing request anywhere.
  const { data: people, error: peopleError } = await admin
    .from('profiles')
    .select('id, email, full_name, preferred_name')
    .in('id', body.userIds);
  if (peopleError) return json({ error: peopleError.message }, 500);

  const recipients = (people as { id: string; email: string; full_name: string; preferred_name: string | null }[] | null) ?? [];
  if (recipients.length === 0) return json({ error: 'no recipients' }, 400);

  let created;
  try {
    created = await createSubmissions(
      (template as { docuseal_template_id: string }).docuseal_template_id,
      recipients.map((p) => ({ email: p.email, name: p.preferred_name ?? p.full_name })),
    );
  } catch (cause) {
    return json({ error: `docuseal: ${(cause as Error).message}` }, 502);
  }

  const byEmail = new Map(created.map((s) => [s.email.toLowerCase(), s]));
  const assigned: string[] = [];

  for (const person of recipients) {
    const submission = byEmail.get(person.email.toLowerCase());
    if (!submission) continue;

    // upsert on (template_id, user_id): re-assigning someone who already has
    // this document should update where it points, not create a second row that
    // makes "3 of 5" wrong.
    const { data: row, error } = await admin
      .from('document_assignments')
      .upsert(
        {
          template_id: template.id,
          user_id: person.id,
          docuseal_submission_id: submission.submissionId,
          docuseal_slug: submission.slug,
          status: 'not_started',
          due_at: body.dueAt ?? null,
          assigned_by: caller.user.id,
        },
        { onConflict: 'template_id,user_id' },
      )
      .select('id')
      .single();

    if (error || !row) continue;

    /* The signing task, locked. DESIGN_BRIEF §5.4 wants system tasks that can be
       completed but not deleted, and tasks_insert refuses is_system to every
       JWT — so this is one of the few places the secret key is the right tool
       rather than a shortcut. */
    await admin.from('tasks').upsert(
      {
        owner_id: person.id,
        title: (template as { name_en: string }).name_en,
        source: 'auto',
        is_system: true,
        linked_type: 'document',
        linked_id: (row as { id: string }).id,
        due_at: body.dueAt ?? null,
        created_by: caller.user.id,
      },
      { onConflict: 'owner_id,linked_type,linked_id' },
    );

    assigned.push(person.id);
  }

  await audit({
    actorId: caller.user.id,
    action: 'document.assign',
    entityType: 'document_template',
    entityId: template.id,
    metadata: { count: assigned.length, dueAt: body.dueAt ?? null },
  });

  return json({ assigned: assigned.length }, 201);
};
