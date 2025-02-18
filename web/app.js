let localStream;
let peerConnection;
let websocket;
let isMuted = false;
let isVideoOff = false;

// Initialize event listeners
document.getElementById("join-btn").addEventListener("click", handleJoin);
document.getElementById("mute-btn").addEventListener("click", toggleMute);
document.getElementById("video-btn").addEventListener("click", toggleVideo);

async function handleJoin() {
    const name = document.getElementById("name").value;
    if (!name) {
        alert("Please enter your name");
        return;
    }

    try {
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // Show participant view
        document.getElementById("join-screen").style.display = "none";
        document.getElementById("participant-view").style.display = "block";

        // Setup local video
        const localVideo = document.createElement("video");
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.autoplay = true;
        localVideo.playsInline = true;
        document.getElementById("local-video").appendChild(localVideo);

        // Initialize WebRTC
        await initializeWebRTC(name);

    } catch (error) {
        console.error("Error joining:", error);
        alert("Could not access camera/microphone. Please check permissions.");
    }
}

async function initializeWebRTC(name) {
    // Create peer connection
    const configuration = {
        iceServers: [{
            urls: "stun:stun.l.google.com:19302"
        }]
    };

    peerConnection = new RTCPeerConnection(configuration);

    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming tracks
    peerConnection.ontrack = handleTrack;

    // Connect to signaling server
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    websocket = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
    
    websocket.onopen = () => {
        console.log("Connected to signaling server");
        sendSignalingMessage({
            type: "join",
            name: name
        });
    };

    websocket.onmessage = handleSignalingMessage;
    websocket.onerror = (error) => console.error("WebSocket error:", error);
    websocket.onclose = () => console.log("WebSocket connection closed");

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignalingMessage({
                type: "candidate",
                candidate: event.candidate
            });
        }
    };

    // Create and send offer
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignalingMessage({
            type: "offer",
            offer: offer
        });
    } catch (error) {
        console.error("Error creating offer:", error);
    }
}

function handleTrack(event) {
    console.log("Received remote track");
    const remoteVideo = document.createElement("video");
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    document.getElementById("remote-video").appendChild(remoteVideo);

    // Remove video when track ends
    event.streams[0].onremovetrack = () => {
        remoteVideo.remove();
    };
}

async function handleSignalingMessage(event) {
    const message = JSON.parse(event.data);

    try {
        switch (message.type) {
            case "offer":
                await handleOffer(message.offer);
                break;
            case "answer":
                await handleAnswer(message.answer);
                break;
            case "candidate":
                await handleCandidate(message.candidate);
                break;
            default:
                console.log("Unknown message type:", message.type);
        }
    } catch (error) {
        console.error("Error handling message:", error);
    }
}

async function handleOffer(offer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendSignalingMessage({
        type: "answer",
        answer: answer
    });
}

async function handleAnswer(answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleCandidate(candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

function sendSignalingMessage(message) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
    } else {
        console.error("WebSocket is not connected");
    }
}

function toggleMute() {
    if (!localStream) return;
    
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
    });
    
    isMuted = !isMuted;
    document.getElementById("mute-btn").innerText = isMuted ? "Unmute" : "Mute";
}

function toggleVideo() {
    if (!localStream) return;
    
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
    });
    
    isVideoOff = !isVideoOff;
    document.getElementById("video-btn").innerText = isVideoOff ? "Turn on Video" : "Turn off Video";
}