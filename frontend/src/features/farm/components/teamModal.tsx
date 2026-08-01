import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Users, X, Crown, Shield, Wrench, Trash2, Plus } from 'lucide-react'
import {
  useMembers, useAddMember, useUpdateMemberRole, useRemoveMember,
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
        </div>
      </div>
    </>,
    document.body
  )
}
