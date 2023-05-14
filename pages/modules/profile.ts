import {TransferManagerModule} from "./base"
import {TransferManager, TransferManagerEvents} from "../transfer-manager"

interface UserProfile {
  name: string
}

export interface ClientProfile {
  profile?: UserProfile
  status: 'connected' | 'connecting' | 'disconnected'
  clientId: string
  connectionType: 'unknown' | 'direct' | 'relay'
}
export enum ProfileConnectionManagerModuleEvents {
  PeerClientConnecting = 'PeerClientConnecting',
  PeerClientConnected = 'PeerClientConnected',
  PeerClientDisconnected = 'PeerClientDisconnected',
  PeerClientChanged = 'PeerClientChanged',
}

export class ProfileTransferManagerModule extends TransferManagerModule<ProfileConnectionManagerModuleEvents> {
  public profile = {
    name: 'My name'
  }
  public readonly clients: Record<string, ClientProfile> = {}
  constructor(transferManager: TransferManager) {
    super({
      namespace: 'profile',
      transferManager: transferManager,
    })

    this.setInvokeListener('get-profile', () => this.profile)
    transferManager.on(TransferManagerEvents.PeerIceTypeChange, ({ peerClientId, localCandidate }) => {
      if (this.clients[peerClientId]) {
        this.clients[peerClientId].connectionType = localCandidate.type === 'host' ? 'direct' : 'relay'
        this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientChanged, { client: this.clients[peerClientId] })
      }
    })
    transferManager.on(TransferManagerEvents.PeerConnecting, async ({ peerClientId }) => {
      this.clients[peerClientId] = {
        clientId: peerClientId,
        status: 'connecting',
      }
      this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientConnecting, { client: this.clients[peerClientId] })
    })
    transferManager.on(TransferManagerEvents.PeerConnected, async ({ peerClientId }) => {
      const profile = await this.invoke<UserProfile>({ event: 'get-profile', targetClientId: peerClientId })
      this.clients[peerClientId] = this.clients[peerClientId] || { profile: { name: ''}, status: 'disconnected' }
      this.clients[peerClientId].clientId = peerClientId
      this.clients[peerClientId].profile = profile
      this.clients[peerClientId].status = 'connected'
      this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientConnected, { client: this.clients[peerClientId] })
    })
    transferManager.on(TransferManagerEvents.PeerDisconnected, ({ peerClientId }) => {
      if (this.clients[peerClientId]) {
        this.clients[peerClientId].status = 'disconnected'
        this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientDisconnected, { client: this.clients[peerClientId] })
      }
    })
    this.addBroadcastListener('profile-changed', ({ data, sourceClientId }) => {
      this.clients[sourceClientId].profile = data as UserProfile
      this.dispatch(ProfileConnectionManagerModuleEvents.PeerClientChanged, { client: this.clients[sourceClientId] })
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
