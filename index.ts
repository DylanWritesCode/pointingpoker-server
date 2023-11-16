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
        store.RemoveUserBySocketId(socket.id);

        const activeUser = store.ActiveUsers.find(x=> x.SocketId == socket.id);
        if(activeUser != undefined 
            && activeUser?.SharedUser != undefined) {
                

            var peerUsers = store.ActiveUsers.filter(x => x.SharedUser.PokerId == activeUser.SharedUser.PokerId);
            for(let i = 0; i < peerUsers.length; i++) {
                socket.broadcast.to(peerUsers[i].SocketId).emit("UserLeftSession", activeUser.SharedUser);
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
                UserName: playerName,
                Vote: undefined
            }
        };

        store.ActiveUsers.push(newUser);

        const userCollection = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == newUser.SharedUser.PokerId).flatMap(x => x.SharedUser);

        socket.emit("EstablishPokerSession", userCollection);

        console.log(`${playerName} from ${socket.handshake.address} established a new pokwer session ${newUser.SharedUser.PokerId} called ${sessionName}`);
      });

      socket.on('UserVoted', (pokerId:string, vote:string | undefined) => {
        const user = store.ActiveUsers.find(x=> x.SocketId == socket.id && x.SharedUser.PokerId == pokerId);

        if(user != undefined) {
            user.SharedUser.Vote = vote;
            socket.emit("UserVoted", user.SharedUser);

            const peerUsers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId);
            peerUsers.forEach((user) => {
                socket.broadcast.to(user.SocketId).emit("UserVoted", user);
            });
        }
      });

      socket.on('JoinSession',(pokerId:string, userName:string) =>{
        const newUser:SocketSession = {
            SocketId: socket.id,
            IPAddress: socket.handshake.address,
            SharedUser: {
                UserId: store.GetNextUserId(),
                PokerId: pokerId,
                PokerName: store.GetPokerNameById(pokerId),
                UserName: userName,
                Vote: undefined
            }
        };

        const allUsers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == newUser.SharedUser.PokerId);
        const peerCollection = allUsers.flatMap(x => x.SharedUser);

        allUsers.forEach(u => {
            socket.broadcast.to(u.SocketId).emit("UserJoinedSession", newUser);
        });

        socket.emit("EstablishPokerSession", peerCollection);
      });

      socket.on('LeaveSession', (pokerId:string) => {
        const user = store.ActiveUsers.find(x=> x.SharedUser.PokerId == pokerId && x.SocketId == socket.id);

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
});


httpServer.listen(3000, () => {
    console.log('listening on *:30000');
})