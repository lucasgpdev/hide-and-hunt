import { useSyncExternalStore } from 'react';
import { network, type NetworkState } from '../multiplayer/NetworkClient';

/** Estado da conexão com o servidor, atualizado em tempo real. */
export function useNetwork(): NetworkState {
  return useSyncExternalStore(network.subscribe, network.getState, network.getState);
}
