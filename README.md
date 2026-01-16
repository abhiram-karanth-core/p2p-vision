# P2P Vision

A peer-to-peer video communication application built with React Native, leveraging WebRTC technology for real-time video and audio streaming.

## 🌟 Features

- **Peer-to-Peer Video Calls**: Direct video communication between users without intermediary servers
- **WebRTC Integration**: Real-time communication using WebRTC protocol
- **Cross-Platform**: Runs on both iOS and Android devices
- **Signaling Server**: Custom signaling server for establishing peer connections
- **Modern React Native**: Built with the latest React Native architecture

### 1. Clone the Repository

```bash
git clone https://github.com/abhiram-karanth-core/p2p-vision.git
cd p2p-vision
```
### 2. Install Dependencies

```bash
# Using npm
npm install

# OR using Yarn
yarn install
```
### 3. Run the Application

```bash
# Using npm
npx react-native run-android
```
### Signaling Server

The application includes a custom signaling server (`deployed_signaling_server.js`) for coordinating peer connections. You may need to:

1. Deploy the signaling server to a hosting service (e.g., Heroku, AWS, DigitalOcean, Render)
2. Update the signaling server URL in your application configuration
3. Ensure WebSocket connections are properly 


## 📱 Features & Functionality

### WebRTC Implementation

- **Peer Connection**: Establishes direct connections between users
- **Media Streams**: Handles video and audio streaming
- **ICE Candidates**: Manages network traversal for peer discovery
- **Session Description Protocol (SDP)**: Negotiates connection parameters

### Signaling

- **WebSocket Communication**: Real-time signaling between peers
- **Offer/Answer Exchange**: SDP offer and answer mechanism
- **ICE Candidate Exchange**: Network candidate sharing

<p align="center">
  <img src="flow.svg" alt="Message Flow" width="800"/>
</p>
