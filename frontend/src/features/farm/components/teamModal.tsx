import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Users, X, Crown, Shield, Wrench, Trash2, Plus, Ticket, Copy } from 'lucide-react'
import {
  useMembers, useAddMember, useUpdateMemberRole, useRemoveMember,
  useInvites, useCreateInvite, useRevokeInvite,
} from '../hooks/useMembersApi'
import { useAuthStore } from '@/store/useAuthStore'
import { canManageStructure, type Farm, type FarmRole } from '@/store/useFarmStore'
import { toast } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// "Equipo" — the farm's team roster (roles phase 3). Everyone on the farm
// can see who works it; admins and the owner can add members (by the email
// of an existing account), change roles, and remove people. Portaled to
// <body>: it opens from inside the farm drawer, whose slide transform
// would otherwise hijack position:fixed.
// ──────────────────────────────────────────────────────────────────────────

const ROLE_META: Record<FarmRole, { label: string; icon: React.ReactNode }> = {
  owner: { label: 'Dueño', icon: <Crown size={11} className="text-amber-500" /> },
  admin: { label: 'Administrador', icon: <Shield size={11} className="text-[#639922]" /> },
  operator: { label: 'Operador', icon: <Wrench size={11} className="text-[#7a8a6a]" /> },
}

export default function TeamModal({ farm, onClose }: {
  farm: Farm
  onClose: () => void
}) {
  const currentUserId = useAuthStore(s => s.user?.id)
  const canManage = canManageStructure(farm)
  const { data: members, isLoading } = useMembers(farm.id)
  const addMember = useAddMember(farm.id)
  const updateRole = useUpdateMemberRole(farm.id)
  const removeMember = useRemoveMember(farm.id)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'operator'>('operator')

  // Join codes — generated here, redeemed at registration or via
  // "Unirme a una finca". The plain code exists only in this state.
  const { data: invites } = useInvites(farm.id, canManage)
  const createInvite = useCreateInvite(farm.id)
  const revokeInvite = useRevokeInvite(farm.id)
  const [inviteRole, setInviteRole] = useState<'admin' | 'operator'>('operator')
  const [freshCode, setFreshCode] = useState<string | null>(null)

  function handleGenerateCode() {
    createInvite.mutate({ role: inviteRole }, {
      onSuccess: (data) => setFreshCode(data.code),
    })
  }

  function handleCopyCode() {
    if (!freshCode) return
    navigator.clipboard?.writeText(freshCode)
      .then(() => toast.success('Código copiado'))
      .catch(() => { /* clipboard unavailable — the code is visible anyway */ })
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    addMember.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          toast.success('Miembro añadido al equipo')
          setEmail('')
        },
      }
    )
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2200] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[2300] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div className="bg-white shadow-xl overflow-hidden pointer-events-auto w-full rounded-t-2xl max-h-[85dvh] overflow-y-auto sm:max-w-md sm:rounded-2xl">

          {/* Header */}
          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#2d4a1e] flex items-center gap-1.5">
                <Users size={14} className="text-[#639922]" /> Equipo — {farm.name}
              </p>
              <p className="text-[10px] text-[#9aab8a] mt-0.5">
                {canManage
                  ? 'Añade personas por el correo de su cuenta de Mi Finca PR.'
                  : 'Las personas que trabajan esta finca.'}
              </p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-lg text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* Roster */}
          <div className="px-5 py-3 flex flex-col divide-y divide-[#f0f5e8]">
            {isLoading && (
              <p className="py-4 text-xs text-[#9aab8a] text-center">Cargando…</p>
            )}
            {(members ?? []).map(m => {
              const meta = ROLE_META[m.role]
              const isSelf = m.userId === currentUserId
              return (
                <div key={m.userId} className="flex items-center gap-2 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#2d4a1e] truncate">
                      {m.fullName}{isSelf ? ' (tú)' : ''}
                    </p>
                    <p className="text-[10px] text-[#9aab8a] truncate">{m.email}</p>
                  </div>

                  {/* Role — editable for members when the viewer can manage */}
                  {canManage && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={e => updateRole.mutate(
                        { userId: m.userId, role: e.target.value as 'admin' | 'operator' },
                        { onSuccess: () => toast.success('Rol actualizado') }
                      )}
                      className="text-[10px] text-[#5a6a4a] bg-white border border-[#d0dcc0] rounded-lg px-1.5 py-1 focus:outline-none focus:border-[#639922]"
                    >
                      <option value="admin">Administrador</option>
                      <option value="operator">Operador</option>
                    </select>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-[#5a6a4a] shrink-0">
                      {meta.icon} {meta.label}
                    </span>
                  )}

                  {/* Remove — admins remove others; anyone can leave */}
                  {m.role !== 'owner' && (canManage || isSelf) && (
                    <button
                      onClick={() => removeMember.mutate(m.userId, {
                        onSuccess: () => toast.success(isSelf ? 'Saliste de la finca' : 'Miembro eliminado'),
                      })}
                      title={isSelf ? 'Salir de la finca' : 'Quitar del equipo'}
                      className="p-1 pointer-coarse:p-2 rounded text-[#c0d0b0] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Invite form — admin+ */}
          {canManage && (
            <form onSubmit={handleAdd} className="px-5 py-4 border-t border-[#e0e8d8] bg-[#fafcf8] flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[#d0dcc0] text-xs text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                />
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as 'admin' | 'operator')}
                  className="text-xs text-[#5a6a4a] bg-white border border-[#d0dcc0] rounded-lg px-2 focus:outline-none focus:border-[#639922]"
                >
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!email.trim() || addMember.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={13} /> Añadir al equipo
              </button>
              <p className="text-[10px] text-[#9aab8a] leading-relaxed">
                Operador: registra labores, hallazgos y cosechas. Administrador:
                además gestiona campos, límites y el equipo.
              </p>
            </form>
          )}

          {/* Join codes — for people you can't add by email */}
          {canManage && (
            <div className="px-5 py-4 border-t border-[#e0e8d8] flex flex-col gap-2">
              <p className="text-xs font-semibold text-[#2d4a1e] flex items-center gap-1.5">
                <Ticket size={13} className="text-[#639922]" /> Código de invitación
              </p>
              <p className="text-[10px] text-[#9aab8a] leading-relaxed">
                Comparte un código y la persona se une sola — al registrarse o
                desde "Unirme a una finca". Sirve para varias personas y vence
                en 7 días.
              </p>

              {freshCode ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#eaf3de] border border-[#c8dca8] rounded-lg">
                  <span className="flex-1 text-base font-bold tracking-widest text-[#2d4a1e] font-mono">
                    {freshCode}
                  </span>
                  <button onClick={handleCopyCode} title="Copiar código"
                    className="p-1.5 pointer-coarse:p-2.5 rounded text-[#639922] hover:bg-white transition-colors"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as 'admin' | 'operator')}
                    className="text-xs text-[#5a6a4a] bg-white border border-[#d0dcc0] rounded-lg px-2 py-2 focus:outline-none focus:border-[#639922]"
                  >
                    <option value="operator">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <button
                    onClick={handleGenerateCode}
                    disabled={createInvite.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-40"
                  >
                    <Ticket size={13} /> Generar código
                  </button>
                </div>
              )}

              {/* Active codes (the codes themselves are unrecoverable) */}
              {(invites ?? []).length > 0 && (
                <div className="flex flex-col divide-y divide-[#f0f5e8]">
                  {(invites ?? []).map(inv => (
                    <div key={inv.id} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 text-[10px] text-[#5a6a4a]">
                        Código de {inv.role === 'admin' ? 'administrador' : 'operador'} · vence{' '}
                        {new Date(inv.expiresAt).toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })}
                      </span>
                      <button
                        onClick={() => revokeInvite.mutate(inv.id, {
                          onSuccess: () => {
                            setFreshCode(null)
                            toast.success('Código revocado')
                          },
                        })}
                        className="text-[10px] pointer-coarse:p-2 text-[#c0d0b0] hover:text-red-500 transition-colors"
                      >
                        Revocar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
