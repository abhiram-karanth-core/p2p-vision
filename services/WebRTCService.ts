import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices
} from 'react-native-webrtc';

import io from 'socket.io-client';
import { WebRTCCallbacks, ChatMessage, CallEvent, CallEventData } from '../types';
import InCallManager from 'react-native-incall-manager';
class WebRTCService {
  private socket: any | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private dataChannel: any | null = null;
  private callbacks: WebRTCCallbacks | null = null;
  private roomId: string = '';
  private userId: string = '';
  private socketId: string = '';
  private isInitialized: boolean = false;
  
  // Simplified connection stat
  private remoteUserId: string = '';
  private remoteSocketId: string = '';
  private connectionEstablished: boolean = false;
  private isConnecting: boolean = false;
  private iceCandidateQueue: any[] = [];
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;

  // ICE servers configuration
  private configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all' as RTCIceTransportPolicy,
  };

  async initialize(
    signalingServer: string,
    roomId: string,
    userId: string,
    callbacks: WebRTCCallbacks
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🚀 Initializing WebRTC service...');
      
      this.roomId = roomId;
      this.userId = userId;
      this.callbacks = callbacks;

      // Connect to signaling server
      this.socket = io(signalingServer, {
        transports: ['websocket'],
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        console.log('✅ Connected to signaling server');
        this.socketId = this.socket.id;
        this.isInitialized = true;
        resolve();
      });

      this.socket.on('joined', (data: any) => this.handleJoined(data));
      this.socket.on('room:update', (data: any) => this.handleRoomUpdate(data));
      this.socket.on('offer', (data: any) => this.handleOffer(data));
      this.socket.on('answer', (data: any) => this.handleAnswer(data));
      this.socket.on('ice-candidate', (data: any) => this.handleIceCandidate(data));
      this.socket.on('chat-message', (data: any) => this.handleChatMessage(data));
      this.socket.on('error', (error: any) => {
        console.error('❌ Socket error:', error);
      });

      // Join room
      this.socket.emit('join', { roomId, userId });

      // Connection timeout
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('Socket connection timeout'));
        }
      }, 10000);
    });
  }

  private async handleJoined(data: any): Promise<void> {
    console.log('🏠 Joined room:', data);
    this.callbacks?.onRoomUpdate?.(data.clients || []);
    
    const clients = data.clients || [];
    const otherClients = clients.filter((client: any) => 
      client.socketId !== this.socketId
    );
    
    if (otherClients.length === 0) {
      console.log('⏳ Waiting for other users...');
      return;
    }
    
    // Start connection when other user joins
    const otherUser = otherClients[0];
    this.remoteUserId = otherUser.userId;
    this.remoteSocketId = otherUser.socketId;
    
    console.log('🚀 Starting connection with:', otherUser.userId);
    await this.startConnection();
  }

  private async handleRoomUpdate(data: any): Promise<void> {
    console.log('👥 Room update:', data);
    this.callbacks?.onRoomUpdate?.(data.clients || []);
    
    const clients = data.clients || [];
    const otherClients = clients.filter((client: any) => 
      client.socketId !== this.socketId
    );
    
    if (otherClients.length === 0) {
      console.log('👋 Other user left, cleaning up...');
      this.cleanup();
    }
  }

  private async startConnection(): Promise<void> {
    if (this.isConnecting) {
      console.log('⚠️ Connection already in progress');
      return;
    }

    this.isConnecting = true;
    console.log('🔗 Starting WebRTC connection...');

    try {
      // 1. Setup peer connection
      await this.setupPeerConnection();
      
      // 2. Start local stream
      await this.startLocalStream();
      
      // 3. Create and send offer
      await this.createOffer();
      
    } catch (error) {
      console.error('❌ Error starting connection:', error);
      this.isConnecting = false;
    }
  }

  private async setupPeerConnection(): Promise<void> {
    console.log('🔧 Setting up peer connection...');
    
    this.peerConnection = new RTCPeerConnection(this.configuration);

    // Connection state monitoring
    (this.peerConnection as any).onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'unknown';
      console.log('🔌 Connection state:', state);
      this.callbacks?.onConnectionStateChange?.(state);
      
      if (state === 'connected') {
        this.connectionEstablished = true;
        this.isConnecting = false;
        console.log('✅ Connection established successfully');
      } else if (state === 'failed' || state === 'disconnected') {
        this.connectionEstablished = false;
        this.isConnecting = false;
        console.log('❌ Connection failed or disconnected');
      }
    };

    // ICE connection monitoring
    (this.peerConnection as any).oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState || 'unknown';
      console.log('🧊 ICE connection state:', state);
      
      if (state === 'connected' || state === 'completed') {
        console.log('✅ ICE connection established');
      } else if (state === 'failed') {
        console.log('❌ ICE connection failed - attempting recovery');
        // this.handleConnectionFailure();
      } else if (state === 'disconnected') {
        console.log('⚠️ ICE connection disconnected');
      }
    };

    // ICE candidates
    (this.peerConnection as any).onicecandidate = (event: any) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate');
        
        // Validate required parameters
        if (!this.roomId || !this.userId) {
          console.error('❌ Missing required parameters for ICE candidate:', {
            roomId: this.roomId,
            userId: this.userId
          });
          return;
        }
        
        this.socket?.emit('ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate,
          sender: this.userId
          // Don't include target - let server broadcast to room
        });
      }
    };

    // Remote stream
    (this.peerConnection as any).ontrack = (event: any) => {
      console.log('📹 Remote track received:', event.track.kind);
      this.remoteStream = event.streams[0];
      if (this.remoteStream) {
        this.callbacks?.onRemoteStream?.(this.remoteStream);
      }
    };

    // Data channel
    (this.peerConnection as any).ondatachannel = (event: any) => {
      console.log('📡 Data channel received');
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };
  }

  private async startLocalStream(): Promise<void> {
    console.log('📹 Starting local stream...');
    
    try {
      const stream = await mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      this.localStream = stream;
      this.callbacks?.onLocalStream?.(stream);
      
      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, stream);
      });
      
      console.log('✅ Local stream started');
      InCallManager.start({ media: 'video' }); 
      InCallManager.setForceSpeakerphoneOn(true);
    } catch (error) {
      console.error('❌ Error starting local stream:', error);
      throw error;
    }
  }

  private async createOffer(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection');
    }

    console.log('📤 Creating offer...');
    
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    
    await this.peerConnection.setLocalDescription(offer);
    
    // Validate required parameters
    if (!this.roomId || !offer || !this.userId) {
      console.error('❌ Missing required parameters for offer:', {
        roomId: this.roomId,
        hasOffer: !!offer,
        userId: this.userId
      });
      return;
    }

    this.socket?.emit('offer', {
      roomId: this.roomId,
      sdp: offer,
      sender: this.userId
      // Don't include target - let server broadcast to room
    });
    
    console.log('✅ Offer sent');
  }

  private async handleOffer(data: any): Promise<void> {
    console.log('📥 Received offer from:', data.sender, 'socketId:', data.senderSocketId);
    console.log('📥 Full offer data:', JSON.stringify(data, null, 2));
    
    // Set remote socket ID if we don't have it
    if (data.senderSocketId && !this.remoteSocketId) {
      this.remoteSocketId = data.senderSocketId;
      console.log('🔗 Set remote socket ID:', this.remoteSocketId);
    }
    
    if (!this.peerConnection) {
      await this.setupPeerConnection();
      await this.startLocalStream();
    }

    await this.peerConnection?.setRemoteDescription(new RTCSessionDescription(data.sdp));
    
    // Process any queued ICE candidates
    await this.processQueuedIceCandidates();
    
    const answer = await this.peerConnection?.createAnswer();
    await this.peerConnection?.setLocalDescription(answer);
    
    // Validate required parameters
    if (!this.roomId || !answer || !this.userId) {
      console.error('❌ Missing required parameters for answer:', {
        roomId: this.roomId,
        hasAnswer: !!answer,
        userId: this.userId
      });
      return;
    }

    const answerData = {
      roomId: this.roomId,
      sdp: answer,
      sender: this.userId
      // Don't include target - let server broadcast to room
    };
    
    console.log('📤 Sending answer:', answerData);
    this.socket?.emit('answer', answerData);
    
    console.log('✅ Answer sent');
  }

  private async handleAnswer(data: any): Promise<void> {
    console.log('📥 Received answer');
    
    if (!this.peerConnection) {
      console.log('❌ No peer connection for answer');
      return;
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    
    // Process any queued ICE candidates
    await this.processQueuedIceCandidates();
    
    console.log('✅ Answer processed');
  }

  private async handleIceCandidate(data: any): Promise<void> {
    if (!this.peerConnection) {
      console.log('❌ No peer connection for ICE candidate');
      return;
    }

    // If remote description is not set, queue the candidate
    if (!this.peerConnection.remoteDescription) {
      console.log('⏳ Queuing ICE candidate (no remote description yet)');
      this.iceCandidateQueue.push(data.candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      console.log('✅ ICE candidate added');
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  }

  private async processQueuedIceCandidates(): Promise<void> {
    if (this.iceCandidateQueue.length === 0) return;
    
    console.log(`🧊 Processing ${this.iceCandidateQueue.length} queued ICE candidates`);
    
    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ Queued ICE candidate added');
      } catch (error) {
        console.error('❌ Error adding queued ICE candidate:', error);
      }
    }
    
    this.iceCandidateQueue = [];
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('📡 Data channel opened');
    };

    this.dataChannel.onmessage = (event: any) => {
      try {
        const message = JSON.parse(event.data);
        this.callbacks?.onChatMessage?.(message);
      } catch (error) {
        console.error('❌ Error parsing data channel message:', error);
      }
    };
  }

  private handleChatMessage(data: any): void {
    this.callbacks?.onChatMessage?.(data);
  }

  // private handleConnectionFailure(): void {
  //   console.log('🔄 Handling connection failure...');
  //   this.connectionEstablished = false;
  //   this.isConnecting = false;
    
  //   // Attempt to restart connection
  //   if (this.connectionAttempts < this.maxConnectionAttempts) {
  //     this.connectionAttempts++;
  //     console.log(`🔄 Retrying connection (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
      
  //     setTimeout(() => {
  //       this.restartConnection();
  //     }, 2000);
  //   } else {
  //     console.log('❌ Max connection attempts reached');
  //   }
  // }

  private cleanup(): void {
    console.log('🧹 Cleaning up connection...');
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    this.remoteStream = null;
    this.dataChannel = null;
    this.connectionEstablished = false;
    this.isConnecting = false;
    this.iceCandidateQueue = [];
  }

  // Public methods
  sendChatMessage(message: string): void {
    const chatMessage: ChatMessage = {
      message: message,
      sender: this.userId,
      time: Date.now(),
      senderId: this.userId,
    };

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(chatMessage));
    } else {
      this.socket?.emit('chat-message', {
        roomId: this.roomId,
        message: message,
        sender: this.userId
      });
    }
  }

  toggleCamera(): void {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  }

  toggleMicrophone(): void {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
      }
    }
  }

  disconnect(): void {
    console.log('👋 Disconnecting...');
    this.cleanup();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isInitialized = false;
  }

  // // Debug methods
  // getLocalStreamStatus() {
  //   return {
  //     hasStream: !!this.localStream,
  //     audioTracks: this.localStream?.getAudioTracks().length || 0,
  //     videoTracks: this.localStream?.getVideoTracks().length || 0,
  //     streamActive: this.localStream?.active || false,
  //   };
  // }

  // restartConnection(): void {
  //   console.log('🔄 Restarting connection...');
  //   this.cleanup();
  //   this.isConnecting = false;
    
  //   // Restart connection if we have a remote user
  //   if (this.remoteSocketId) {
  //     this.startConnection();
  //   }
  // }

  // restartLocalStream(): void {
  //   console.log('🔄 Restarting local stream...');
  //   if (this.localStream) {
  //     this.localStream.getTracks().forEach(track => track.stop());
  //     this.localStream = null;
  //   }
  //   this.startLocalStream();
  // }

  // forceRemoteStreamUpdate(): void {
  //   console.log('🔄 Forcing remote stream update...');
  //   if (this.remoteStream) {
  //     console.log('📹 Remote stream details:', {
  //       id: this.remoteStream.id,
  //       active: this.remoteStream.active,
  //       videoTracks: this.remoteStream.getVideoTracks().length,
  //       audioTracks: this.remoteStream.getAudioTracks().length
  //     });
  //     this.callbacks?.onRemoteStream?.(this.remoteStream);
  //   } else {
  //     console.log('❌ No remote stream to update');
  //   }
  // }
public switchCamera(): void {
  if (!this.localStream) {
    console.warn('No local stream available');
    return;
  }

  const videoTrack = this.localStream.getVideoTracks()[0];
  if (videoTrack && '_switchCamera' in videoTrack) {
    // @ts-ignore
    videoTrack._switchCamera();
    console.log('🔄 Camera switched');
  } else {
    console.warn('No video track found or switchCamera not available');
  }
}


  acceptCall(callerSocketId: string): void {
    console.log('✅ Accepting call from:', callerSocketId);
    // Call acceptance is handled automatically in the simplified flow
  } 

  rejectCall(callerSocketId: string): void {
    console.log('❌ Rejecting call from:', callerSocketId);
    this.cleanup();
  }

  endCall(): void {
    console.log('📞 Ending call...');
    this.cleanup();
  }

  getRemoteStreamStatus() {
    return {
      hasStream: !!this.remoteStream,
      streamActive: this.remoteStream?.active || false,
      videoTracks: this.remoteStream?.getVideoTracks().length || 0,
      audioTracks: this.remoteStream?.getAudioTracks().length || 0,
      peerConnectionState: this.peerConnection?.connectionState || 'unknown',
      iceConnectionState: this.peerConnection?.iceConnectionState || 'unknown',
      signalingState: this.peerConnection?.signalingState || 'unknown',
      streamId: this.remoteStream?.id || 'none',
      streamURL: this.remoteStream?.toURL ? this.remoteStream.toURL() : 'none'
    };
  }
}

export default WebRTCService;