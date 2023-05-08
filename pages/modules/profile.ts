import {TransferManagerModule} from "./base"
import {TransferManager, TransferManagerEvents} from "../transfer-manager"

interface UserProfile {
  name: string
}
export enum ProfileConnectionManagerModuleEvents {
  PeerClientConnecting = 'PeerClientConnecting',
  PeerClientConnected = 'PeerClientConnected',
  PeerClientDisconnected = 'PeerClientDisconnected',
  PeerClientProfileChanged = 'PeerClientProfileChanged',
}

export class ProfileTransferManagerModule extends TransferManagerModule<ProfileConnectionManagerModuleEvents> {
  public profile = {
    name: 'My name'
  }
  public readonly clients: Record<string, { profile?: UserProfile, status: 'connected' | 'connecting' | 'disconnected', clientId: string }> = {}
  constructor(connectionManager: TransferManager) {
    super({
      namespace: 'profile',
      connectionManager,
    })

    this.setInvokeListener('get-profile', () => this.profile)
    connectionManager.on(TransferManagerEvents.PeerConnecting, async ({ peerClientId }) => {
      this.clients[peerClientId] = {
        clientId: peerClientId,
        status: 'connecting',
      }
      this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientConnecting, { client: this.clients[peerClientId] })
    })
    connectionManager.on(TransferManagerEvents.PeerConnected, async ({ peerClientId }) => {
      const profile = await this.invoke<UserProfile>({ event: 'get-profile', targetClientId: peerClientId })
      this.clients[peerClientId] = this.clients[peerClientId] || { profile: { name: ''}, status: 'disconnected' }
      this.clients[peerClientId].clientId = peerClientId
      this.clients[peerClientId].profile = profile
      this.clients[peerClientId].status = 'connected'
      this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientConnected, { client: this.clients[peerClientId] })
    })
    connectionManager.on(TransferManagerEvents.PeerDisconnected, ({ peerClientId }) => {
      if (this.clients[peerClientId]) {
        this.clients[peerClientId].status = 'disconnected'
        this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientDisconnected, { client: this.clients[peerClientId] })
      }
    })
    this.addBroadcastListener('profile-changed', ({ data, sourceClientId }) => {
      this.clients[sourceClientId].profile = data as UserProfile
      this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientProfileChanged, { client: this.clients[sourceClientId] })
    })
  }

  async setProfile(args: Partial<UserProfile>) {
    this.profile = {
      ...this.profile,
      ...args,
    }
    await this.broadcast({ event: 'profile-changed', data: this.profile })
  }
}
