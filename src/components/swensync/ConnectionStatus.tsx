'use client';

import React from 'react';
import { Loader2, AlertCircle, WifiOff } from 'lucide-react';
import type { SwensyncConnectionState } from '@/types/swensync';

interface ConnectionStatusProps {
  state: SwensyncConnectionState;
  error: Error | null;
}

/**
 * ConnectionStatus - Displays the current connection state
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  state,
  error,
}) => {
  switch (state) {
    case 'connecting':
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Connecting...</span>
        </div>
      );
    case 'connected':
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-300 rounded-full text-sm">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Connected - Speak to start</span>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-300 rounded-full text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error?.message || 'Connection error'}</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-500/20 text-gray-300 rounded-full text-sm">
          <WifiOff className="w-4 h-4" />
          <span>Disconnected</span>
        </div>
      );
  }
};

export default ConnectionStatus;
