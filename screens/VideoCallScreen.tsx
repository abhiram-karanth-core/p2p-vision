// screens/VideoCallScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Platform,
  PanResponder,
  Animated,
  TextInput,
  ScrollView,
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

  // Draggable Chat Logic
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value
        });
      },
      onPanResponderMove: Animated.event(
        [
          null,
          { dx: pan.x, dy: pan.y }
        ],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      }
    })
  ).current;

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
        // Alert.alert('User Left', 'The other user has left the call');
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

  const cleanup = (): void => {
    webRTCService.current?.disconnect();
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
    setIsWaitingForRemote(true);
    setConnectionError(null);
  };

  const renderChatMessages = () => (
    <ScrollView style={styles.chatContainer} contentContainerStyle={{ paddingBottom: 10 }}>
      {chatMessages.map((msg, index) => (
        <View key={index} style={styles.chatMessage}>
          <Text style={styles.chatSender}>{msg.sender}</Text>
          <Text style={styles.chatText}>{msg.message}</Text>
        </View>
      ))}
    </ScrollView>
  );

  const renderWaitingContainer = () => (
    <View style={styles.waitingContainer}>
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarText}>{userId.charAt(0).toUpperCase()}</Text>
      </View>

      <Text style={styles.waitingTitle}>
        {isWaitingForRemote ? 'Waiting for others...' : 'Connecting...'}
      </Text>

      <Text style={styles.waitingSubtitle}>
        Room ID: {roomId}
      </Text>

      <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 20 }} />

      {connectionError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{connectionError}</Text>
        </View>
      )}

      {isReconnecting && (
        <Text style={styles.reconnectingText}>Reconnecting...</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.container}>

        {/* Video Layer */}
        <View style={styles.videoLayer}>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.remoteVideo}
              objectFit="cover"
              zOrder={0}
            />
          ) : (
            <View style={styles.remoteVideoPlaceholder}>
              {renderWaitingContainer()}
            </View>
          )}
        </View>

        {/* Connection Status Pill */}
        <View style={styles.topBar}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#4CAF50' : '#FFC107' }]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Connected' : 'Waiting'} • {formatTime(new Date())}
            </Text>
          </View>
        </View>

        {/* Local Video - Picture in Picture */}
        {localStream && (
          <View style={styles.localVideoWrapper}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              zOrder={1}
              mirror={true}
            />
          </View>
        )}

        {/* Chat Overlay */}
        {showChat && (
          <Animated.View
            style={[
              styles.chatOverlay,
              { transform: pan.getTranslateTransform() }
            ]}
          >
            {/* Draggable Header */}
            <View style={styles.chatHeader} {...panResponder.panHandlers}>
              <View style={styles.dragHandle} />
              <View style={styles.headerContent}>
                <Text style={styles.chatTitle}>Chat</Text>
                <TouchableOpacity onPress={() => setShowChat(false)}>
                  <Text style={styles.closeChatText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            {renderChatMessages()}
            <View style={styles.chatInputWrapper}>
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
          </Animated.View>
        )}

        {/* Floating Controls Bar */}
        <View style={styles.controlsWrapper}>
          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={[styles.controlButton, !isMicOn && styles.controlButtonOff]}
              onPress={toggleMicrophone}
            >
              <Text style={styles.controlButtonText}>{isMicOn ? '🎤' : '🔇'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, !isCameraOn && styles.controlButtonOff]}
              onPress={toggleCamera}
            >
              <Text style={styles.controlButtonText}>{isCameraOn ? '📹' : '📷'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
              <Text style={styles.endCallButtonText}>📞</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={switchCamera}>
              <Text style={styles.controlButtonText}>🔄</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, showChat && styles.controlButtonActive]}
              onPress={() => setShowChat(!showChat)}
            >
              <Text style={styles.controlButtonText}>💬</Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
};

// Helper to format time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  remoteVideoPlaceholder: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Waiting State
  waitingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#444',
  },
  avatarText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  waitingTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  waitingSubtitle: {
    color: '#888',
    fontSize: 16,
  },
  errorContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
  },
  reconnectingText: {
    color: '#FFC107',
    marginTop: 10,
  },

  // Top Status Bar
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },

  // Local Video PiP
  localVideoWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 70,
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: '#333',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 20,
  },
  localVideo: {
    flex: 1,
  },

  // Chat Overlay
  chatOverlay: {
    position: 'absolute',
    bottom: 120, // above controls
    left: 20,
    right: 20,
    height: 300,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 30,
  },
  chatHeader: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeChatText: {
    color: '#aaa',
    fontSize: 18,
    padding: 5,
  },
  chatContainer: {
    flex: 1,
  },
  chatMessage: {
    marginBottom: 12,
  },
  chatSender: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 2,
  },
  chatText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  chatInputWrapper: {
    flexDirection: 'row',
    marginTop: 10,
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
    paddingHorizontal: 16,
    color: '#fff',
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },




  // Controls Bar
  controlsWrapper: {
    position: 'absolute',
    bottom: 30, // Lower it a bit
    left: 0,
    right: 0,
    paddingHorizontal: 20, // Ensure safe margins
    alignItems: 'center',
    zIndex: 40,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around', // Distribute evenly
    width: '100%', // Use full available width minus padding
    maxWidth: 400, // Constraint on tablets
    backgroundColor: '#1C1C1E', // Solid Dark Pill
    paddingVertical: 12,
    borderRadius: 35,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  controlButton: {
    width: 48, // Reduced from 64 to fit screen
    height: 48,
    borderRadius: 24, // Perfect Circle
    backgroundColor: '#3A3A3C', // Lighter Grey for contrast against pill
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonOff: {
    backgroundColor: '#fff',
  },
  controlButtonActive: {
    backgroundColor: '#34C759',
  },
  controlButtonText: {
    fontSize: 20, // Adjusted for smaller button
  },
  endCallButton: {
    backgroundColor: '#FF3B30',
    width: 56, // Slightly larger than others
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  endCallButtonText: {
    fontSize: 28,
    color: '#fff',
    transform: [{ rotate: '135deg' }],
  },
});

export default VideoCallScreen;