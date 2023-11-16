import type { SocketSession } from "./types/SocketSession"

export const store = {
    ActiveUsers: [] as Array<SocketSession>,

    RemoveUserBySocketId(socketId:String) {
        for(let i = 0; i < store.ActiveUsers.length; i ++){
            const user = store.ActiveUsers[i];
            if(user.SocketId == socketId) {
                store.ActiveUsers.splice(i);
                break;
            }
        }
    },
    RemoveUserFromPokerBySocketId(socketId:String, pokerId:string) {
        for(let i = 0; i < store.ActiveUsers.length; i ++){
            const user = store.ActiveUsers[i];
            if(user.SocketId == socketId && user.SharedUser.PokerId == pokerId) {
                store.ActiveUsers.splice(i);
                break;
            }
        }
    },
    GetNextUserId(){
        const listOfIds = store.ActiveUsers.flatMap(x=> x.SharedUser.UserId);
        let nextId = 0;

        if(store.ActiveUsers.length > 0){
           for(let i = 0; i < listOfIds.length; i++) {
            const id = listOfIds[i];
            if(nextId <= id) {
                nextId = id+1;
            }
           }
        }
        return nextId;
    },
    GetPokerNameById(pokerId:string){
        const activeSession = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId);
        if(activeSession.length > 0) {
            return activeSession[0].SharedUser.PokerName;
        }
        return "";
    }
}