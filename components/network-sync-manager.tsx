import { useEffect } from "react";
import { useNetworkSync } from "@/hooks/use-network-sync";

/**
 * Component that manages network-based auto-sync
 * Place this in the app layout to enable automatic syncing
 */
export function NetworkSyncManager() {
  const { syncNow } = useNetworkSync();

  // The hook handles all the network monitoring and syncing
  // This component just needs to be mounted to activate it

  return null;
}
