'use client'

import React from 'react'

import type { SyncStatus } from '../../types.js'

const statusStyles: Record<SyncStatus, { background: string; color: string }> = {
  failed: { background: '#fee2e2', color: '#dc2626' },
  pending: { background: '#fef3c7', color: '#d97706' },
  skipped: { background: '#e5e7eb', color: '#6b7280' },
  synced: { background: '#dcfce7', color: '#16a34a' },
}

const statusLabels: Record<SyncStatus, string> = {
  failed: 'Failed',
  pending: 'Pending',
  skipped: 'Skipped',
  synced: 'Synced',
}

export type SyncStatusBadgeProps = {
  status: SyncStatus
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ status }) => {
  const style = statusStyles[status] || statusStyles.pending

  return (
    <span
      style={{
        backgroundColor: style.background,
        borderRadius: '4px',
        color: style.color,
        display: 'inline-block',
        fontSize: '12px',
        fontWeight: 500,
        padding: '2px 8px',
      }}
    >
      {statusLabels[status] || status}
    </span>
  )
}
