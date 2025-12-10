// // server.js - Improved WebRTC Signaling Server
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST']
//   },
//   transports: ['websocket', 'polling']
// });

// const PORT = process.env.PORT || 3000;

// // Store room and user information
// const rooms = new Map();
// const userSockets = new Map();

// // Middleware for JSON parsing
// app.use(express.json());

// // Simple health-check with more info
// app.get('/', (req, res) => {
//   const roomsCount = rooms.size;
//   const socketsCount = io.sockets.sockets.size;
  
//   res.json({
//     message: 'WebRTC Signaling Server',
//     status: 'healthy',
//     timestamp: new Date().toISOString(),
//     connectedSockets: socketsCount,
//     activeRooms: roomsCount,
//     uptime: Math.floor(process.uptime()) + ' seconds'
//   });
// });

// // ICE servers endpoint for WebRTC configuration
// app.get('/api/ice-servers', (req, res) => {
//   const iceServers = [
//     {
//       urls: 'stun:stun.l.google.com:19302'
//     },
//     {
//       urls: 'stun:stun1.l.google.com:19302'
//     },
//     {
//       urls: 'stun:stun2.l.google.com:19302'
//     },
//     {
//       urls: 'stun:stun3.l.google.com:19302'
//     },
//     {
//       urls: 'turn:openrelay.metered.ca:80',
//       username: 'openrelayproject',
//       credential: 'openrelayproject'
//     }
//   ];
  
//   res.json({ iceServers });
// });

// // Socket.IO connection handling
// io.on('connection', (socket) => {
//   console.log(`🔌 New connection: ${socket.id}`);
  
//   // Store socket info
//   userSockets.set(socket.id, {
//     socketId: socket.id,
//     connectedAt: Date.now(),
//     currentRoom: null
//   });

//   // Join room handler
//   socket.on('join', (data) => {
//     try {
//       const roomId = typeof data === 'string' ? data : data.roomId;
//       const userInfo = typeof data === 'object' ? data.userInfo : {};
      
//       if (!roomId) {
//         socket.emit('error', { message: 'Room ID is required' });
//         return;
//       }

//       // Leave previous room if any
//       const userInfo_current = userSockets.get(socket.id);
//       if (userInfo_current?.currentRoom) {
//         socket.leave(userInfo_current.currentRoom);
//       }

//       // Join new room
//       socket.join(roomId);
      
//       // Update user info
//       const userData = {
//         socketId: socket.id,
//         userId: data.userId || `user_${socket.id}`,
//         userInfo: userInfo,
//         joinedAt: Date.now()
//       };
      
//       userSockets.set(socket.id, {
//         ...userData,
//         currentRoom: roomId
//       });

//       // Get or create room
//       if (!rooms.has(roomId)) {
//         rooms.set(roomId, {
//           id: roomId,
//           clients: [],
//           createdAt: Date.now()
//         });
//       }
      
//       const room = rooms.get(roomId);
      
//       // Add user to room (replace if already exists)
//       const existingUserIndex = room.clients.findIndex(client => client.socketId === socket.id);
//       if (existingUserIndex >= 0) {
//         room.clients[existingUserIndex] = userData;
//       } else {
//         room.clients.push(userData);
//       }
      
//       console.log(`👤 User ${userData.userId} joined room ${roomId}`);
      
//       // Notify user they joined successfully
//       socket.emit('joined', {
//         roomId: roomId,
//         socketId: socket.id,
//         clients: room.clients
//       });
      
//       // Notify other users in the room
//       socket.to(roomId).emit('room:update', {
//         roomId: roomId,
//         clients: room.clients
//       });
      
//     } catch (error) {
//       console.error('Error in join event:', error);
//       socket.emit('error', { message: 'Failed to join room' });
//     }
//   });

//   // Leave room handler
//   socket.on('leave', (roomId) => {
//     try {
//       if (!roomId) {
//         socket.emit('error', { message: 'Room ID is required' });
//         return;
//       }

//       socket.leave(roomId);
      
//       // Remove user from room
//       const room = rooms.get(roomId);
//       if (room) {
//         room.clients = room.clients.filter(client => client.socketId !== socket.id);
        
//         // Notify other users
//         socket.to(roomId).emit('room:update', {
//           roomId: roomId,
//           clients: room.clients
//         });
        
//         // Clean up empty rooms
//         if (room.clients.length === 0) {
//           rooms.delete(roomId);
//         }
//       }
      
//       // Update user info
//       const userInfo = userSockets.get(socket.id);
//       if (userInfo) {
//         userInfo.currentRoom = null;
//       }
      
//     } catch (error) {
//       console.error('Error in leave event:', error);
//       socket.emit('error', { message: 'Failed to leave room' });
//     }
//   });

//   // WebRTC signaling handlers
//   socket.on('offer', ({ roomId, sdp, sender, target }) => {
//     try {
//       if (!roomId || !sdp || !sender) {
//         socket.emit('error', { message: 'Missing required offer parameters' });
//         return;
//       }

//       console.log(`📤 Offer from ${sender} in room ${roomId} ${target ? `to ${target}` : '(broadcast)'}`);
      
//       if (target) {
//         socket.to(target).emit('offer', { sdp, sender, senderSocketId: socket.id, roomId });
//       } else {
//         socket.to(roomId).emit('offer', { sdp, sender, senderSocketId: socket.id, roomId });
//       }
//     } catch (error) {
//       console.error('Error in offer event:', error);
//       socket.emit('error', { message: 'Failed to send offer' });
//     }
//   });

//   socket.on('answer', ({ roomId, sdp, sender, target }) => {
//     try {
//       if (!roomId || !sdp || !sender) {
//         socket.emit('error', { message: 'Missing required answer parameters' });
//         return;
//       }

//       console.log(`📥 Answer from ${sender} in room ${roomId} ${target ? `to ${target}` : '(broadcast)'}`);
      
//       if (target) {
//         socket.to(target).emit('answer', { sdp, sender, senderSocketId: socket.id, roomId });
//       } else {
//         socket.to(roomId).emit('answer', { sdp, sender, senderSocketId: socket.id, roomId });
//     }
//   });

//   socket.on('ice-candidate', ({ roomId, candidate, sender, target }) => {
//     try {
//       if (!roomId || !candidate || !sender) {
//         socket.emit('error', { message: 'Missing required ICE candidate parameters' });
//         return;
//       }

//       console.log(`🧊 ICE candidate from ${sender} in room ${roomId} ${target ? `to ${target}` : '(broadcast)'}`);
      
//       if (target) {
//         socket.to(target).emit('ice-candidate', { candidate, sender, senderSocketId: socket.id, roomId });
//       } else {
//         socket.to(roomId).emit('ice-candidate', { candidate, sender, senderSocketId: socket.id, roomId });
//       }
//     } catch (error) {
//       console.error('Error in ice-candidate event:', error);
//       socket.emit('error', { message: 'Failed to send ICE candidate' });
//     }
//   });

//   // Chat messaging with validation
//   socket.on('chat-message', ({ roomId, message, sender }) => {
//     try {
//       if (!roomId || !message || !sender) {
//         socket.emit('error', { message: 'Missing required message parameters' });
//         return;
//       }

//       console.log(`💬 Chat message from ${sender} in room ${roomId}`);
      
//       socket.to(roomId).emit('chat-message', {
//         message,
//         sender,
//         senderSocketId: socket.id,
//         roomId,
//         timestamp: Date.now()
//       });
//     } catch (error) {
//       console.error('Error in chat-message event:', error);
//       socket.emit('error', { message: 'Failed to send chat message' });
//     }
//   });

//   // Call management handlers
//   socket.on('call-user', ({ roomId, targetSocketId, sender }) => {
//     try {
//       if (!roomId || !targetSocketId || !sender) {
//         socket.emit('error', { message: 'Missing required call parameters' });
//         return;
//       }

//       console.log(`📞 Call from ${sender} to ${targetSocketId} in room ${roomId}`);
      
//       socket.to(targetSocketId).emit('incoming-call', {
//         caller: sender,
//         callerSocketId: socket.id,
//         roomId
//       });
//     } catch (error) {
//       console.error('Error in call-user event:', error);
//       socket.emit('error', { message: 'Failed to initiate call' });
//     }
//   });

//   socket.on('call-accepted', ({ roomId, targetSocketId, sender }) => {
//     try {
//       console.log(`Call accepted by ${sender} in room ${roomId}`);
//       socket.to(targetSocketId).emit('call-accepted', { 
//         accepter: sender,
//         accepterSocketId: socket.id,
//         roomId
//       });
//     } catch (error) {
//       console.error('Error in call-accepted event:', error);
//       socket.emit('error', { message: 'Failed to accept call' });
//     }
//   });

//   socket.on('call-rejected', ({ roomId, targetSocketId, sender }) => {
//     try {
//       console.log(`Call rejected by ${sender} in room ${roomId}`);
//       socket.to(targetSocketId).emit('call-rejected', { 
//         rejecter: sender,
//         rejecterSocketId: socket.id,
//         roomId
//       });
//     } catch (error) {
//       console.error('Error in call-rejected event:', error);
//       socket.emit('error', { message: 'Failed to reject call' });
//     }
//   });

//   socket.on('end-call', ({ roomId, sender }) => {
//     try {
//       console.log(`Call ended by ${sender} in room ${roomId}`);
//       socket.to(roomId).emit('call-ended', { 
//         ender: sender,
//         enderSocketId: socket.id,
//         roomId
//       });
//     } catch (error) {
//       console.error('Error in end-call event:', error);
//       socket.emit('error', { message: 'Failed to end call' });
//     }
//   });

//   // Ping/pong for connection health
//   socket.on('ping', () => {
//     socket.emit('pong', { timestamp: Date.now() });
//   });

//   // Handle disconnect with proper cleanup
//   socket.on('disconnect', (reason) => {
//     console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
    
//     try {
//       const userInfo = userSockets.get(socket.id);
      
//       if (userInfo?.currentRoom) {
//         const room = rooms.get(userInfo.currentRoom);
//         if (room) {
//           // Remove user from room
//           room.clients = room.clients.filter(client => client.socketId !== socket.id);
          
//           // Notify other users
//           socket.to(userInfo.currentRoom).emit('room:update', {
//             roomId: userInfo.currentRoom,
//             clients: room.clients
//           });
          
//           // Notify about user leaving
//           socket.to(userInfo.currentRoom).emit('user-disconnected', {
//             userId: userInfo.userId,
//             socketId: socket.id,
//             roomId: userInfo.currentRoom
//           });
          
//           // Clean up empty rooms
//           if (room.clients.length === 0) {
//             rooms.delete(userInfo.currentRoom);
//           }
//         }
//       }
      
//       // Remove from user tracking
//       userSockets.delete(socket.id);
      
//     } catch (error) {
//       console.error('Error during disconnect cleanup:', error);
//     }
//   });

//   // Handle connection errors
//   socket.on('error', (error) => {
//     console.error('Socket error for', socket.id, ':', error);
//   });
// });

// // Server event handlers
// io.engine.on('connection_error', (error) => {
//   console.error('Connection error:', error);
// });

// // Periodic cleanup of stale rooms (every 5 minutes)
// setInterval(() => {
//   const now = Date.now();
//   const staleTimeout = 30 * 60 * 1000; // 30 minutes
  
//   for (const [roomId, room] of rooms.entries()) {
//     if (now - room.createdAt > staleTimeout && room.clients.length === 0) {
//       console.log(`Cleaning up stale room: ${roomId}`);
//       rooms.delete(roomId);
//     }
//   }
// }, 5 * 60 * 1000);

// // Error handling
// process.on('uncaughtException', (error) => {
//   console.error('Uncaught Exception:', error);
// });

// process.on('unhandledRejection', (error) => {
//   console.error('Unhandled Rejection:', error);
// });

// // Graceful shutdown
// process.on('SIGTERM', () => {
//   console.log('SIGTERM received, shutting down gracefully');
//   server.close(() => {
//     console.log('Server closed');
//     process.exit(0);
//   });
// });

// // Start server
// server.listen(PORT, () => {
//   console.log('🚀 Signaling server running on port', PORT);
//   console.log(`📡 WebSocket server ready for connections`);
//   console.log(`🌐 Health check available at http://localhost:${PORT}`);
//   console.log(`🧊 ICE servers available at http://localhost:${PORT}/api/ice-servers`);
// });