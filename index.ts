import { createServer } from "http";
import { Server } from "socket.io";
import * as Guid from "./util/Guid";
import { SocketSession } from "./types/SocketSession";
import {store } from './store'
import { PeerUser } from "./types/PeerUser";

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin:"http://localhost:5173"
    }
});

io.on('connection', (socket) => {
    console.log(`A user is connecting from ${socket.handshake.address}`);

    socket.on('disconnect', () => {
        const user = store.ActiveUsers.find(x=> x.SocketId == socket.id);
        console.log(`Removing user from poker ${user?.SharedUser.PokerId}`)
        if(user != undefined) {
            console.log(`User ${user.SharedUser.UserName} from ${user.IPAddress} has left poker session ${user.SharedUser.PokerId}`);
            var peerUsers = store.ActiveUsers.filter(x => x.SharedUser.PokerId == user.SharedUser.PokerId);
            for(let i = 0; i < peerUsers.length; i++) {
                socket.broadcast.to(peerUsers[i].SocketId).emit("UserLeftSession", user.SharedUser);
            }

            for(let i = 0; i < store.ActiveUsers.length; i++) {
                const activeUser = store.ActiveUsers[i];
                if(activeUser.SocketId == socket.id){
                    store.RemoveUserBySocketId(socket.id);
                }
            }
        }

        console.log(`A user is disconnected from ${socket.handshake.address}`);
      });

      socket.on('RequestNewSession', (sessionName, playerName) => {

        const newUser:SocketSession = {
            SocketId: socket.id,
            IPAddress: socket.handshake.address,
            SharedUser: {
                UserId: store.GetNextUserId(),
                PokerId: Guid.Generate(),
                PokerName: sessionName,
                IsSpectator: false,
                UserName: playerName,
                Vote: undefined
            }
        };

        store.ActiveUsers.push(newUser);

        const userCollection = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == newUser.SharedUser.PokerId).flatMap(x => x.SharedUser);

        socket.emit("EstablishPokerSession", newUser.SharedUser, userCollection);

        console.log(`${playerName} from ${socket.handshake.address} established a new pokwer session ${newUser.SharedUser.PokerId} called ${sessionName}`);
      });

      socket.on('ServerVote', (pokerId:string, vote:string | undefined) => {
        console.log(`Send vote to ${pokerId}`);
        const user = store.ActiveUsers.find(x=> x.SocketId == socket.id && x.SharedUser.PokerId == pokerId);

        if(user != undefined) {
            user.SharedUser.Vote = vote;
            socket.emit("UserVoted", user.SharedUser);

            const peersNotVoted = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId && !x.SharedUser.IsSpectator && (x.SharedUser.Vote == undefined || x.SharedUser.Vote == ""));
            const peerUsers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId);

            if(peersNotVoted.length == 0){
                socket.emit("RevealVotes");
            }

            peerUsers.forEach((peer) => {
                console.log(`Notifying peer of vote ${peer.SharedUser.UserName}`);
                socket.broadcast.to(peer.SocketId).emit("UserVoted", user.SharedUser);

                if(peersNotVoted.length == 0){
                    socket.broadcast.to(peer.SocketId).emit("RevealVotes");
                }
            });
        }
      });

      socket.on('JoinSession',(pokerId:string, userName:string, spectate:boolean) =>{
        const newUser:SocketSession = {
            SocketId: socket.id,
            IPAddress: socket.handshake.address,
            SharedUser: {
                UserId: store.GetNextUserId(),
                PokerId: pokerId,
                PokerName: store.GetPokerNameById(pokerId),
                IsSpectator: spectate,
                UserName: userName,
                Vote: undefined
            }
        };

        store.ActiveUsers.push(newUser);

        const allUsers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == newUser.SharedUser.PokerId);
        const peerCollection = allUsers.flatMap(x => x.SharedUser);

        allUsers.forEach(u => {
            socket.broadcast.to(u.SocketId).emit("UserJoinedSession", newUser.SharedUser);
        });

        socket.emit("EstablishPokerSession", newUser.SharedUser, peerCollection);
      });

      socket.on('LeaveSession', (pokerId:string) => {
        const user = store.ActiveUsers.find(x=> x.SharedUser.PokerId == pokerId && x.SocketId == socket.id);
        console.log(`user left ${pokerId}`)
        if(user != undefined) {
            console.log(`User ${user.SharedUser.UserName} from ${user.IPAddress} has left poker session ${user.SharedUser.PokerId}`);
            var peerUsers = store.ActiveUsers.filter(x => x.SharedUser.PokerId == pokerId);
            for(let i = 0; i < peerUsers.length; i++) {
                socket.broadcast.to(peerUsers[i].SocketId).emit("UserLeftSession", user.SharedUser);
            }

            for(let i = 0; i < store.ActiveUsers.length; i++) {
                const activeUser = store.ActiveUsers[i];
                if(activeUser.SocketId == socket.id && activeUser.SharedUser.PokerId == pokerId){
                    store.RemoveUserFromPokerBySocketId(socket.id, pokerId);
                }
            }
        }
      });

      socket.on('RevealCardsForPlayers', (pokerId:string) => {
            
            socket.emit("RevealVotes");
            const peers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId);
            peers.forEach(x=> socket.broadcast.to(x.SocketId).emit('RevealVotes'));
      });

      socket.on('ResetVoteForPlayers', (pokerId:string) => {
        const peers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId);
        peers.forEach(x=> x.SharedUser.Vote = undefined);

        peers.forEach((x)=> {
            socket.broadcast.to(x.SocketId).emit('ResetVotes', peers.flatMap(x=> x.SharedUser))
        });

        socket.emit('ResetVotes', peers.flatMap(x=> x.SharedUser))
  });
});


httpServer.listen(3000, () => {
    console.log('listening on *:30000');
})