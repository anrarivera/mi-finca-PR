import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '@/i18n'
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

const ROLE_META: Record<FarmRole, { labelKey: string; icon: React.ReactNode }> = {
  owner: { labelKey: 'roles.owner', icon: <Crown size={11} className="text-amber-500" /> },
  admin: { labelKey: 'roles.admin', icon: <Shield size={11} className="text-[#4d7a1b]" /> },
  operator: { labelKey: 'roles.operator', icon: <Wrench size={11} className="text-[#5a6a4a]" /> },
}

export default function TeamModal({ farm, onClose }: {
  farm: Farm
  onClose: () => void
}) {
  const { t } = useTranslation('farm')
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
      .then(() => toast.success(t('team.codeCopied')))
      .catch(() => { /* clipboard unavailable — the code is visible anyway */ })
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    addMember.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          toast.success(t('team.memberAdded'))
          setEmail('')
        },
      }
    )
  }

  return createPortal(
    <>
      <div aria-hidden="true" className="fixed inset-0 z-[2200] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[2300] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div className="bg-white shadow-xl overflow-hidden pointer-events-auto w-full rounded-t-2xl max-h-[85dvh] overflow-y-auto sm:max-w-md sm:rounded-2xl">

          {/* Header */}
          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#2d4a1e] flex items-center gap-1.5">
                <Users size={14} className="text-[#4d7a1b]" /> {t('team.title', { name: farm.name })}
              </p>
              <p className="text-[10px] text-[#66755a] mt-0.5">
                {canManage ? t('team.subtitleManage') : t('team.subtitleView')}
              </p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-lg text-[#66755a] hover:bg-[#e8f0e0] transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* Roster */}
          <div className="px-5 py-3 flex flex-col divide-y divide-[#f0f5e8]">
            {isLoading && (
              <p className="py-4 text-xs text-[#66755a] text-center">{t('team.loading')}</p>
            )}
            {(members ?? []).map(m => {
              const meta = ROLE_META[m.role]
              const isSelf = m.userId === currentUserId
              return (
                <div key={m.userId} className="flex items-center gap-2 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#2d4a1e] truncate">
                      {m.fullName}{isSelf ? ` ${t('team.you')}` : ''}
                    </p>
                    <p className="text-[10px] text-[#66755a] truncate">{m.email}</p>
                  </div>

                  {/* Role — editable for members when the viewer can manage */}
                  {canManage && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={e => updateRole.mutate(
                        { userId: m.userId, role: e.target.value as 'admin' | 'operator' },
                        { onSuccess: () => toast.success(t('team.roleUpdated')) }
                      )}
                      className="text-[10px] text-[#5a6a4a] bg-white border border-[#d0dcc0] rounded-lg px-1.5 py-1 focus:outline-none focus:border-[#639922]"
                    >
                      <option value="admin">{t('roles.admin')}</option>
                      <option value="operator">{t('roles.operator')}</option>
                    </select>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-[#5a6a4a] shrink-0">
                      {meta.icon} {t(meta.labelKey)}
                    </span>
                  )}

                  {/* Remove — admins remove others; anyone can leave */}
                  {m.role !== 'owner' && (canManage || isSelf) && (
                    <button
                      onClick={() => removeMember.mutate(m.userId, {
                        onSuccess: () => toast.success(isSelf ? t('team.youLeft') : t('team.memberRemoved')),
                      })}
                      title={isSelf ? t('team.leaveTitle') : t('team.removeTitle')}
                      className="p-1 pointer-coarse:p-2 rounded text-[#66755a] hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
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
                  placeholder={t('team.emailPlaceholder')}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[#d0dcc0] text-xs text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                />
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as 'admin' | 'operator')}
                  className="text-xs text-[#5a6a4a] bg-white border border-[#d0dcc0] rounded-lg px-2 focus:outline-none focus:border-[#639922]"
                >
                  <option value="operator">{t('roles.operator')}</option>
                  <option value="admin">{t('roles.admin')}</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!email.trim() || addMember.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={13} /> {t('team.addButton')}
              </button>
              <p className="text-[10px] text-[#66755a] leading-relaxed">
                {t('team.roleHelp')}
              </p>
            </form>
          )}

          {/* Join codes — for people you can't add by email */}
          {canManage && (
            <div className="px-5 py-4 border-t border-[#e0e8d8] flex flex-col gap-2">
              <p className="text-xs font-semibold text-[#2d4a1e] flex items-center gap-1.5">
                <Ticket size={13} className="text-[#4d7a1b]" /> {t('team.inviteCode')}
              </p>
              <p className="text-[10px] text-[#66755a] leading-relaxed">
                {t('team.inviteHelp')}
              </p>

              {freshCode ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#eaf3de] border border-[#c8dca8] rounded-lg">
                  <span className="flex-1 text-base font-bold tracking-widest text-[#2d4a1e] font-mono">
                    {freshCode}
                  </span>
                  <button onClick={handleCopyCode} title={t('team.copyCode')}
                    className="p-1.5 pointer-coarse:p-2.5 rounded text-[#4d7a1b] hover:bg-white transition-colors"
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
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-40"
                  >
                    <Ticket size={13} /> {t('team.generateCode')}
                  </button>
                </div>
              )}

              {/* Active codes (the codes themselves are unrecoverable) */}
              {(invites ?? []).length > 0 && (
                <div className="flex flex-col divide-y divide-[#f0f5e8]">
                  {(invites ?? []).map(inv => (
                    <div key={inv.id} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 text-[10px] text-[#5a6a4a]">
                        {t(
                          inv.role === 'admin' ? 'team.inviteRowAdmin' : 'team.inviteRowOperator',
                          { date: new Date(inv.expiresAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) }
                        )}
                      </span>
                      <button
                        onClick={() => revokeInvite.mutate(inv.id, {
                          onSuccess: () => {
                            setFreshCode(null)
                            toast.success(t('team.codeRevoked'))
                          },
                        })}
                        className="text-[10px] pointer-coarse:p-2 text-[#66755a] hover:text-red-600 transition-colors"
                      >
                        {t('team.revoke')}
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
