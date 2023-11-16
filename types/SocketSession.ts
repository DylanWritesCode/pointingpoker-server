import { PeerUser } from "./PeerUser"

export type SocketSession = {
    SocketId: string,
    IPAddress: string,
    SharedUser: PeerUser
}