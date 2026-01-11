'use client'

import { Button, toast, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

export type SyncButtonProps = {
  apiRoute?: string
}

export const SyncButton: React.FC<SyncButtonProps> = ({
  apiRoute = '/api/salesforce/sync',
}) => {
  const [isSyncing, setIsSyncing] = useState(false)
  const { id } = useDocumentInfo()

  const handleSync = useCallback(async () => {
    if (!id) {
      toast.error('No document ID available')
      return
    }

    setIsSyncing(true)

    try {
      const response = await fetch(`${apiRoute}/${id}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(data.message || 'Lead synced to Salesforce successfully')
      } else {
        toast.error(data.message || 'Failed to sync lead to Salesforce')
      }
    } catch (_err) {
      toast.error('Network error while syncing')
    } finally {
      setIsSyncing(false)
    }
  }, [apiRoute, id])

  return (
    <Button buttonStyle="secondary" disabled={isSyncing} onClick={handleSync} size="small">
      {isSyncing ? 'Syncing...' : 'Sync to Salesforce'}
    </Button>
  )
}
