# WebRTC Video Chat Application

A real-time video chat application built with React and WebRTC, featuring peer-to-peer video calls, chat messaging, file sharing, and screen sharing capabilities.

## Features

- 🎥 Real-time video and audio communication
- 💬 Text chat messaging
- 📁 File sharing between peers
- 🖥️ Screen sharing functionality
- 👥 Multiple participant support
- 🔇 Audio mute/unmute
- 📷 Video on/off controls
- 🎨 Modern UI with Tailwind CSS

## Technology Stack

- **Frontend**:
  - React
  - WebRTC
  - Tailwind CSS
  - Lucide React (for icons)

- **Backend**:
  - Go
  - Gorilla WebSocket
  - Standard Go HTTP package

## Prerequisites

Before running the application, make sure you have the following installed:
- Node.js (v14 or higher)
- Go (v1.16 or higher)
- npm or yarn package manager

## Installation

### Backend Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install Go dependencies:
```bash
go mod download
```

3. Run the server:
```bash
go run main.go
```

The server will start on port 8000.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm start
# or
yarn start
```

## Application Structure

### Frontend Components

- `Room.js`: Main component handling video chat functionality
  - WebRTC peer connection management
  - Media stream handling
  - UI controls and layout

### Backend Services

- `main.go`: Server entry point and route handlers
- `server/room.go`: Room management and participant tracking
- `server/websocket.go`: WebSocket connection handling and broadcasting

## Features in Detail

### Video Chat
- Peer-to-peer connection using WebRTC
- Camera and microphone access
- Video grid layout with support for multiple participants
- Toggle controls for audio and video

### Chat Messaging
- Real-time text messaging between participants
- Message history display
- Sender/receiver identification

### File Sharing
- Support for sending and receiving files
- Progress tracking
- Automatic file download on receiver's end

### Screen Sharing
- Toggle between camera and screen share
- Automatic handling of screen share end event
- Support for multiple display options

## Security Considerations

- STUN server configuration for NAT traversal
- Secure WebSocket connections
- Random room ID generation
- Participant management and cleanup

## Known Limitations

- Currently supports two participants per room
- Requires HTTPS for production deployment
- Browser compatibility depends on WebRTC support

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- WebRTC.org for the underlying technology
- Tailwind CSS for the styling framework
- Lucide for the icon set
