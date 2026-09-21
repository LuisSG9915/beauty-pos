"use client";

import { ShieldCheck, Store, UserRound } from "lucide-react";
import { useActionState } from "react";

import {
  cancelInvitation,
  setMemberBranches,
  setMemberRoles,
  toggleMember,
} from "@/app/admin/usuarios/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";

export type MemberRow = {
  miembroId: string;
  usuarioId: string;
  estado: string;
  nombre: string;
  correo: string;
  rolIds: string[];
  sucursalIds: string[];
};

function CheckboxList({
  items,
  name,
  checked,
  disabled,
}: {
  items: Array<{ id: string; label: string }>;
  name: string;
  checked: Set<string>;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <label
          className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
            disabled
              ? "cursor-not-allowed border-border bg-muted/60 text-muted-foreground"
              : "border-border bg-card text-muted-foreground hover:border-accent-foreground/30 has-checked:border-primary has-checked:bg-accent/70 has-checked:text-primary"
          }`}
          key={item.id}
        >
          <input
            className="sr-only"
            defaultChecked={checked.has(item.id)}
            disabled={disabled}
            name={name}
            type="checkbox"
            value={item.id}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}

export function MemberCard({
  member,
  roles,
  assignableBranches,
  allBranchNames,
  organizationId,
  canEdit,
  isSelf,
}: {
  member: MemberRow;
  roles: Array<{ id: string; nombre: string; esSistema: boolean }>;
  assignableBranches: Array<{ id: string; nombre: string; clave: string }>;
  allBranchNames: Record<string, string>;
  organizationId: string;
  canEdit: boolean;
  isSelf: boolean;
}) {
  const [rolesState, rolesAction, rolesPending] = useActionState(setMemberRoles, {});
  const [branchesState, branchesAction, branchesPending] = useActionState(setMemberBranches, {});
  const [toggleState, toggleAction, togglePending] = useActionState(toggleMember, {});
  const suspendido = member.estado !== "activo";

  // Sucursales fuera del alcance del editor se muestran como etiquetas fijas.
  const fueraDeAlcance = member.sucursalIds.filter(
    (id) => !assignableBranches.some((branch) => branch.id === id),
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-primary">
            <UserRound aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {member.nombre}
              {isSelf ? <span className="ml-2 text-xs font-normal text-muted-foreground">(tú)</span> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{member.correo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={suspendido ? "destructive" : "success"}>
            {suspendido ? "Suspendido" : "Activo"}
          </StatusBadge>
          {canEdit ? (
            <form action={toggleAction}>
              <input name="organizacionId" type="hidden" value={organizationId} />
              <input name="miembroId" type="hidden" value={member.miembroId} />
              <input name="estado" type="hidden" value={suspendido ? "activo" : "suspendido"} />
              <Button
                className="rounded-lg"
                disabled={togglePending}
                size="sm"
                type="submit"
                variant={suspendido ? "default" : "outline"}
              >
                {suspendido ? "Reactivar" : "Suspender"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <form action={rolesAction} className="space-y-2">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="miembroId" type="hidden" value={member.miembroId} />
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <ShieldCheck aria-hidden="true" className="size-3.5" /> Roles
          </p>
          <CheckboxList
            checked={new Set(member.rolIds)}
            disabled={!canEdit}
            items={roles.map((role) => ({ id: role.id, label: role.nombre }))}
            name="rolIds"
          />
          {canEdit ? (
            <div className="flex items-center gap-3">
              <Button disabled={rolesPending} size="sm" type="submit" variant="outline">
                {rolesPending ? "Guardando…" : "Guardar roles"}
              </Button>
              <ActionFeedback state={rolesState} />
            </div>
          ) : null}
        </form>

        <form action={branchesAction} className="space-y-2">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="miembroId" type="hidden" value={member.miembroId} />
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Store aria-hidden="true" className="size-3.5" /> Sucursales
          </p>
          <CheckboxList
            checked={new Set(member.sucursalIds.filter((id) => assignableBranches.some((b) => b.id === id)))}
            disabled={!canEdit}
            items={assignableBranches.map((branch) => ({
              id: branch.id,
              label: `${branch.nombre} (${branch.clave})`,
            }))}
            name="sucursalIds"
          />
          {fueraDeAlcance.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Fuera de tu alcance: {fueraDeAlcance.map((id) => allBranchNames[id] ?? "—").join(", ")}
            </p>
          ) : null}
          {canEdit ? (
            <div className="flex items-center gap-3">
              <Button disabled={branchesPending} size="sm" type="submit" variant="outline">
                {branchesPending ? "Guardando…" : "Guardar sucursales"}
              </Button>
              <ActionFeedback state={branchesState} />
            </div>
          ) : null}
        </form>
        <ActionFeedback state={toggleState} />
      </div>
    </section>
  );
}

export function PendingInvitations({
  invitations,
  organizationId,
  canCancel,
}: {
  invitations: Array<{
    id: string;
    correo: string;
    nombre: string;
    expiraAt: Date;
    rolNombre: string;
    sucursalNombre: string;
  }>;
  organizationId: string;
  canCancel: boolean;
}) {
  const [state, formAction, isPending] = useActionState(cancelInvitation, {});
  if (invitations.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-semibold">Invitaciones pendientes</h3>
      <ul className="mt-3 space-y-3">
        {invitations.map((inv) => (
          <li className="rounded-xl border border-border p-3 text-sm" key={inv.id}>
            <p className="font-medium text-foreground">{inv.nombre}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{inv.correo}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {inv.rolNombre} · {inv.sucursalNombre} · expira {formatDate(inv.expiraAt)}
            </p>
            {canCancel ? (
              <form action={formAction} className="mt-2">
                <input name="organizacionId" type="hidden" value={organizationId} />
                <input name="invitacionId" type="hidden" value={inv.id} />
                <button
                  className="min-h-8 rounded-lg border border-border px-2.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  disabled={isPending}
                  type="submit"
                >
                  Cancelar invitación
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <ActionFeedback state={state} />
      </div>
    </section>
  );
}
