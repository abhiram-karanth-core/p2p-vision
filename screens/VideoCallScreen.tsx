// screens/VideoCallScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { MediaStream } from 'react-native-webrtc';
import WebRTCService from '../services/WebRTCService';
import { VideoCallScreenProps, ChatMessage, CallEvent, CallEventData } from '../types';

const { width, height } = Dimensions.get('window');

const SIGNALING_SERVER = 'https://webrtc-signaling-server-kxvr.onrender.com';

const VideoCallScreen: React.FC<VideoCallScreenProps> = ({ route, navigation }) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [isCameraOn, setIsCameraOn] = useState<boolean>(true);
  const [isMicOn, setIsMicOn] = useState<boolean>(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [showChat, setShowChat] = useState<boolean>(false);
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
  
  // Enhanced state management
  const [isWaitingForRemote, setIsWaitingForRemote] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  const webRTCService = useRef<WebRTCService | null>(null);
  
  const roomId = route?.params?.roomId || 'test-room';
  const userId = route?.params?.userId || `user-${Date.now()}`;

  useEffect(() => {
    initializeWebRTC();
    
    return () => {
      cleanup();
    };
  }, []);

  const initializeWebRTC = async (): Promise<void> => {
    try {
      console.log('Initializing WebRTC...');
      
      webRTCService.current = new WebRTCService();
      
      const callbacks = {
        onLocalStream: (stream: MediaStream) => {
          console.log('Local stream callback received');
          setLocalStream(stream);
        },
        
        onRemoteStream: (stream: MediaStream) => {
          console.log('Remote stream callback received:', {
            id: stream.id,
            active: stream.active,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length
          });
          setRemoteStream(stream);
          setIsConnected(true);
          setIsWaitingForRemote(false);
          setConnectionError(null);
        },
        
        onConnectionStateChange: (state: string) => {
          console.log('Connection state changed:', state);
          setConnectionState(state);
          
          if (state === 'connected' || state === 'completed') {
            setIsConnected(true);
            setIsReconnecting(false);
            setConnectionError(null);
          } else if (state === 'failed') {
            setIsConnected(false);
            setConnectionError('Connection failed');
            setIsReconnecting(true);
          } else if (state === 'disconnected') {
            setIsConnected(false);
            setConnectionError('Disconnected');
          } else if (state === 'checking') {
            setConnectionError(null);
          }
        },
        
        onChatMessage: (data: ChatMessage) => {
          setChatMessages(prev => [...prev, data]);
        },
        
        onRoomUpdate: (clients: string[]) => {
          console.log('Room update received:', clients);
          setConnectedUsers(clients);
          
          if (clients.length <= 1) {
            setIsWaitingForRemote(true);
            setRemoteStream(null);
            setIsConnected(false);
          }
        },
        
        onCallEvents: (event: CallEvent, data: CallEventData) => {
          handleCallEvents(event, data);
        },
      };

      await webRTCService.current.initialize(
        SIGNALING_SERVER,
        roomId,
        userId,
        callbacks
      );

      console.log('WebRTC initialization completed');
      
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error);
      setConnectionError('Failed to initialize: ' + (error as Error).message);
      Alert.alert('Error', 'Failed to initialize video call: ' + (error as Error).message);
    }
  };

  const handleCallEvents = (event: CallEvent, data: CallEventData): void => {
    switch (event) {
      case 'incoming-call':
        Alert.alert(
          'Incoming Call',
          `${data.caller} is calling you`,
          [
            { text: 'Reject', onPress: () => webRTCService.current?.rejectCall(data.callerSocketId || '') },
            { text: 'Accept', onPress: () => webRTCService.current?.acceptCall(data.callerSocketId || '') },
          ]
        );
        break;
      case 'call-accepted':
        Alert.alert('Call Accepted', `${data.accepter} accepted your call`);
        break;
      case 'call-rejected':
        Alert.alert('Call Rejected', `${data.rejecter} rejected your call`);
        break;
      case 'call-ended':
        Alert.alert('Call Ended', `${data.ender} ended the call`);
        break;
      case 'user-left':
        Alert.alert('User Left', 'The other user has left the call');
        setIsWaitingForRemote(true);
        setRemoteStream(null);
        setIsConnected(false);
        break;
    }
  };

  const toggleCamera = (): void => {
    const enabled = webRTCService.current?.toggleCamera();
    setIsCameraOn(prev => !prev);
  };

  const toggleMicrophone = (): void => {
    const enabled = webRTCService.current?.toggleMicrophone();
    setIsMicOn(prev => !prev);
  };

  const switchCamera = (): void => {
    webRTCService.current?.switchCamera();
  };

  const endCall = (): void => {
    Alert.alert(
      'End Call',
      'Are you sure you want to end the call?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Call', 
          style: 'destructive', 
          onPress: () => {
            webRTCService.current?.endCall();
            cleanup();
            navigation?.goBack();
          }
        },
      ]
    );
  };

  const sendChatMessage = (): void => {
    if (chatInput.trim()) {
      webRTCService.current?.sendChatMessage(chatInput.trim());
      setChatInput('');
    }
  };

  // const retryConnection = async (): Promise<void> => {
  //   try {
  //     setIsReconnecting(true);
  //     setConnectionError(null);
  //     console.log('Retrying connection...');
  //     await webRTCService.current?.restartConnection();
  //   } catch (error) {
  //     console.error('Retry failed:', error);
  //     setConnectionError('Retry failed: ' + (error as Error).message);
  //     setIsReconnecting(false);
  //   }
  // };

  const cleanup = (): void => {
    webRTCService.current?.disconnect();
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
    setIsWaitingForRemote(true);
    setConnectionError(null);
  };

//   const showDebugInfo = (): void => {
//     const localStatus = webRTCService.current?.getLocalStreamStatus();
//     const remoteStatus = webRTCService.current?.getRemoteStreamStatus();
    
//     const debugInfo = `LOCAL STREAM:
// Has Stream: ${localStatus?.hasStream ? 'Yes' : 'No'}
// Audio Tracks: ${localStatus?.audioTracks || 0}
// Video Tracks: ${localStatus?.videoTracks || 0}
// Stream Active: ${localStatus?.streamActive ? 'Yes' : 'No'}

// REMOTE STREAM:
// Has Stream: ${remoteStatus?.hasStream ? 'Yes' : 'No'}
// Audio Tracks: ${remoteStatus?.audioTracks || 0}
// Video Tracks: ${remoteStatus?.videoTracks || 0}
// Stream Active: ${remoteStatus?.streamActive ? 'Yes' : 'No'}
// Stream ID: ${remoteStatus?.streamId || 'None'}
// Stream URL: ${remoteStatus?.streamURL ? 'Available' : 'None'}

// PEER CONNECTION:
// Connection State: ${remoteStatus?.peerConnectionState || 'Unknown'}
// ICE State: ${remoteStatus?.iceConnectionState || 'Unknown'}
// Signaling State: ${remoteStatus?.signalingState || 'Unknown'}

// ROOM:
// Connected Users: ${connectedUsers.length}
// Waiting for Remote: ${isWaitingForRemote ? 'Yes' : 'No'}
// Is Connected: ${isConnected ? 'Yes' : 'No'}

// UI STATE:
// Remote Stream in UI: ${remoteStream ? 'Yes' : 'No'}`;

//     Alert.alert('Debug Information', debugInfo, [
//       { text: 'OK', style: 'cancel' },
//       { 
//         text: 'Restart Local Stream', 
//         onPress: () => webRTCService.current?.restartLocalStream()
//       },
//       {
//         text: 'Force Remote Update',
//         onPress: () => webRTCService.current?.forceRemoteStreamUpdate()
//       },
//       {
//         text: 'Restart Connection',
//         onPress: () => webRTCService.current?.restartConnection()
//       }
//     ]);
//   };

  const renderChatMessages = () => (
    <ScrollView style={styles.chatContainer}>
      {chatMessages.map((msg, index) => (
        <View key={index} style={styles.chatMessage}>
          <Text style={styles.chatSender}>{msg.sender}:</Text>
          <Text style={styles.chatText}>{msg.message}</Text>
          <Text style={styles.chatTime}>
            {new Date(msg.time).toLocaleTimeString()}
          </Text>
        </View>
      ))}
    </ScrollView>
  );

  const renderWaitingContainer = () => (
    <View style={styles.waitingContainer}>
      <Text style={styles.waitingText}>
        {isWaitingForRemote ? 'Waiting for other user...' : 'Connecting...'}
      </Text>
      
      <Text style={styles.debugText}>
        Room: {roomId}
      </Text>
      
      <Text style={styles.debugText}>
        ICE: {connectionState} | Users: {connectedUsers.length}
      </Text>
      
      {connectionError && (
        <Text style={styles.errorText}>{connectionError}</Text>
      )}
      
      {isReconnecting && (
        <Text style={styles.reconnectingText}>Reconnecting...</Text>
      )}
      
      {/* <TouchableOpacity style={styles.debugButton} onPress={showDebugInfo}>
        <Text style={styles.debugButtonText}>Debug Info</Text>
      </TouchableOpacity> */}
      
      {/* {connectionState === 'failed' && (
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={retryConnection}
          disabled={isReconnecting}
        >
          <Text style={styles.retryButtonText}>
            {isReconnecting ? 'Retrying...' : 'Retry Connection'}
          </Text>
        </TouchableOpacity>
      )} */}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* Connection Status */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          Room: {roomId} | ICE: {connectionState} | Users: {connectedUsers.length} | Connected: {isConnected ? 'Yes' : 'No'}
        </Text>
      </View>
      
      {/* Video Views */}
      <View style={styles.videoContainer}>
        {/* Remote Video (Main) */}
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
            zOrder={0}
          />
        ) : (
          renderWaitingContainer()
        )}

        {/* Local Video (Picture-in-Picture) */}
        {localStream && (
          <View style={styles.localVideoContainer}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              zOrder={1}
              mirror={true}
            />
          </View>
        )}
      </View>

      {/* Chat Overlay */}
      {showChat && (
        <View style={styles.chatOverlay}>
          {renderChatMessages()}
          <View style={styles.chatInputContainer}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Type a message..."
              placeholderTextColor="#999"
              returnKeyType="send"
              onSubmitEditing={sendChatMessage}
            />
            <TouchableOpacity onPress={sendChatMessage} style={styles.sendButton}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.controlButton, !isMicOn && styles.controlButtonOff]}
          onPress={toggleMicrophone}
        >
          <Text style={styles.controlButtonText}>
            {isMicOn ? '🎤' : '🔇'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, !isCameraOn && styles.controlButtonOff]}
          onPress={toggleCamera}
        >
          <Text style={styles.controlButtonText}>
            {isCameraOn ? '📹' : '📷'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={switchCamera}>
          <Text style={styles.controlButtonText}>🔄</Text>
        </TouchableOpacity>

        {/* <TouchableOpacity
          style={styles.controlButton}
          onPress={showDebugInfo}
        >
          <Text style={styles.controlButtonText}>📞</Text>
        </TouchableOpacity> */}

        <TouchableOpacity
          style={[styles.controlButton, showChat && styles.controlButtonActive]}
          onPress={() => setShowChat(!showChat)}
        >
          <Text style={styles.controlButtonText}>💬</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
          <Text style={styles.endCallButtonText}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  statusBar: {
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#000',
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 20,
  },
  waitingText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  debugText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 5,
  },
  errorText: {
    color: '#f44336',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  reconnectingText: {
    color: '#FF9800',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
  },
  debugButton: {
    marginTop: 20,
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  debugButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  localVideo: {
    flex: 1,
  },
  chatOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 100,
    bottom: 150,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 10,
    padding: 10,
  },
  chatContainer: {
    flex: 1,
    marginBottom: 10,
  },
  chatMessage: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
  },
  chatSender: {
    color: '#4CAF50',
    fontWeight: 'bold',
    fontSize: 12,
  },
  chatText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 2,
  },
  chatTime: {
    color: '#999',
    fontSize: 10,
    textAlign: 'right',
    marginTop: 2,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 15,
    color: '#fff',
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#4CAF50',
  },
  controlButtonOff: {
    backgroundColor: '#f44336',
  },
  controlButtonText: {
    fontSize: 24,
  },
  endCallButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallButtonText: {
    fontSize: 28,
    transform: [{ rotate: '135deg' }],
  },
});

export default VideoCallScreen;