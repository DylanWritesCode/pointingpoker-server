import { createServer } from "http";
import { Server } from "socket.io";
import * as Guid from "./util/Guid";
import { SocketSession } from "./types/SocketSession";
import {store } from './store'
import { PeerUser } from "./types/PeerUser";
import winston from "winston";
import dotenv from "dotenv";

dotenv.config({ path: `.env.${process.env["NODE_ENV"]}`});
console.log(`Environment ${process.env["NODE_ENV"]}`)
console.log(`CORS ${process.env.ORIGIN_URL}`)

const logger = winston.createLogger({
    level:'debug',
    format: winston.format.json(),
    transports:[ new winston.transports.Console(),
        new winston.transports.File({
            filename: "logs/serverLog.log"
        }),
    ]
});

const httpServer = createServer();

const io = new Server(httpServer, {
    cors: {
        origin: true
    },
    allowEIO3: true
});

io.on('connection', (socket) => {
    logger.info(`Incoming connection from ${socket.handshake.address}`);

    socket.on('disconnect', () => {
        logger.info(`${socket.handshake.address} disconnected.`);
        const user = store.ActiveUsers.find(x=> x.SocketId == socket.id);
        if(user != undefined) {
            logger.info(`Removing User<${socket.handshake.address}> from poker session ${user.SharedUser.PokerId}`);
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
        logger.info(`User<${socket.handshake.address} created a new poker session<${newUser.SharedUser.PokerId}> with the name ${sessionName}`);
      });

      socket.on('ServerVote', (pokerId:string, vote:string | undefined) => {
        logger.debug(`Poker Session<${pokerId}> recieved vote<${vote}> from User<${socket.handshake.address}>`);

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
        logger.info(`User<${socket.handshake.address}> joined Poker Session<${pokerId}>`);
      });

      socket.on('LeaveSession', (pokerId:string) => {
        const user = store.ActiveUsers.find(x=> x.SharedUser.PokerId == pokerId && x.SocketId == socket.id);

        if(user != undefined) {
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
        logger.info(`User<${socket.handshake.address}> left Poker Session<${pokerId}>`);
      });

      socket.on('RevealCardsForPlayers', (pokerId:string) => {
            socket.emit("RevealVotes");
            const peers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId);
            peers.forEach(x=> socket.broadcast.to(x.SocketId).emit('RevealVotes'));

            logger.debug(`User<${socket.handshake.address}> revealed cards in Poker Session<${pokerId}>`);
      });

      socket.on('ResetVoteForPlayers', (pokerId:string) => {
        const peers = store.ActiveUsers.filter(x=> x.SharedUser.PokerId == pokerId);
        peers.forEach(x=> x.SharedUser.Vote = undefined);

        peers.forEach((x)=> {
            socket.broadcast.to(x.SocketId).emit('ResetVotes', peers.flatMap(x=> x.SharedUser))
        });

        socket.emit('ResetVotes', peers.flatMap(x=> x.SharedUser))
        logger.debug(`User<${socket.handshake.address}> reset cards in Poker Session<${pokerId}>`);
  });
});


httpServer.listen(process.env.SERVER_PORT, () => {
    logger.info(`Server started on *:${process.env.SERVER_PORT}`);
})
