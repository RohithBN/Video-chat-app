import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageCircle, Send, Video, FileUp } from "lucide-react";


const Room = () => {
    const userVideo = useRef();
    const userStream = useRef();
    const partnerVideo = useRef();
    const peerRef = useRef();
    const webSocketRef = useRef();
    const sendChannel = useRef();
    const receiveChannel = useRef();
    const fileChunks = useRef([]);
    const { roomID } = useParams();
    const fileName = useRef("");
    const fileType = useRef("");
    const sendMessageChannel=useRef();
    const receiveMessageChannel=useRef();

    const [isConnected, setIsConnected] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [sendProgress, setSendProgress] = useState(0);
    const [receiveProgress, setReceiveProgress] = useState(0);
    const [isReceivingFile, setIsReceivingFile] = useState(false);
    const [message,setMessage]=useState("");
    const [isSending, setIsSending] = useState(false);
    const [receivedMessage,setReceivedMessage]=useState("")
    const [messages, setMessages] = useState([]);

    const openCamera = async () => {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const cameras = allDevices.filter(
            (device) => device.kind === "videoinput"
        );
        
        if (cameras.length === 0) {
            throw new Error("No video input devices found");
        }

        const constraints = {
            audio: true,
            video: {
                deviceId: cameras[0].deviceId,
            },
        };

        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.error("Error accessing media devices:", err);
            throw err;
        }
    };

    useEffect(() => {
        let mounted = true;

        const initializeRoom = async () => {
            try {
                const stream = await openCamera();
                if (!mounted) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                userVideo.current.srcObject = stream;
                userStream.current = stream;

                webSocketRef.current = new WebSocket(
                    `ws://localhost:8000/join?roomID=${roomID}`
                );

                webSocketRef.current.addEventListener("open", () => {
                    webSocketRef.current.send(JSON.stringify({ join: true }));
                });

                webSocketRef.current.addEventListener("message", async (e) => {
                    const message = JSON.parse(e.data);

                    if (message.join) {
                        callUser();
                    }

                    if (message.offer) {
                        handleOffer(message.offer);
                    }

                    if (message.answer) {
                        console.log("Receiving Answer");
                        await peerRef.current?.setRemoteDescription(
                            new RTCSessionDescription(message.answer)
                        );
                    }

                    if (message.iceCandidate) {
                        console.log("Receiving ICE Candidate");
                        try {
                            await peerRef.current?.addIceCandidate(
                                new RTCIceCandidate(message.iceCandidate)
                            );
                        } catch (err) {
                            console.error("Error adding ICE candidate:", err);
                        }
                    }
                });
            } catch (err) {
                console.error("Error initializing room:", err);
            }
        };

        initializeRoom();

        return () => {
            mounted = false;
            
            if (userStream.current) {
                userStream.current.getTracks().forEach(track => track.stop());
            }

            if (webSocketRef.current) {
                webSocketRef.current.close();
            }

            if (peerRef.current) {
                peerRef.current.close();
            }

            if (userVideo.current) {
                userVideo.current.srcObject = null;
            }
            if (partnerVideo.current) {
                partnerVideo.current.srcObject = null;
            }
        };
    }, [roomID]);

    const createPeer = () => {
        console.log("Creating Peer Connection");
        const peer = new RTCPeerConnection({
            iceServers: [
                { 
                    urls: [
                        "stun:stun.l.google.com:19302",
                        "stun:stun1.l.google.com:19302"
                    ]
                }
            ]
        });

        peer.onicecandidate = handleIceCandidateEvent;
        peer.ontrack = handleTrackEvent;

        return peer;
    };

    const handleOffer = async (offer) => {
        console.log("Received Offer, Creating Answer");
        peerRef.current = createPeer();

        try {
            await peerRef.current.setRemoteDescription(
                new RTCSessionDescription(offer)
            );

            userStream.current.getTracks().forEach((track) => {
                peerRef.current.addTrack(track, userStream.current);
            });
            sendChannel.current = peerRef.current.createDataChannel("sendData");
            sendMessageChannel.current= peerRef.current.createDataChannel("sendMessage")
            setupDataChannel(sendChannel.current, false); // false → This is the sender
            setUpMessageChannel(sendChannel.current,false);
            // Create data channel for receiving
            peerRef.current.ondatachannel = (event) => {
                const channel = event.channel;
                if(channel.label==='sendDataChannel'){
                    receiveChannel.current=channel
                }
                else if(channel.label==='messageDataChannel'){
                    receiveMessageChannel.current=channel;
                }
                if (receiveChannel.current) {
                    setupDataChannel(receiveChannel.current, true);
                    setUpMessageChannel(receiveMessageChannel.current,true);
                }
                
            };

            const answer = await peerRef.current.createAnswer();
            await peerRef.current.setLocalDescription(answer);

            webSocketRef.current.send(
                JSON.stringify({ answer: peerRef.current.localDescription })
            );
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    };

    const callUser = async () => {
        console.log("Calling Other User");
        peerRef.current = createPeer();

        userStream.current.getTracks().forEach((track) => {
            peerRef.current.addTrack(track, userStream.current);
        });

        // Create data channel for sending file
        sendChannel.current = peerRef.current.createDataChannel("sendDataChannel");
        // create another data channel for sending messages
        sendMessageChannel.current=peerRef.current.createDataChannel("messageDataChannel")
        if(sendChannel.current) {
        setupDataChannel(sendChannel.current, false);
        }
        if(sendMessageChannel.current){
            setUpMessageChannel(sendMessageChannel.current,false);
        }
        peerRef.current.ondatachannel = (event) => {
            const channel = event.channel;
            if(channel.label==='sendData'){
                receiveChannel.current=channel
            }
            else if(channel.label==='sendMessage'){
                receiveMessageChannel.current=channel;
            }
            if (receiveChannel.current) {
                setupDataChannel(receiveChannel.current, true);
                setUpMessageChannel(receiveMessageChannel.current,true);
            }
            
        };

        try {
            const offer = await peerRef.current.createOffer();
            await peerRef.current.setLocalDescription(offer);

            webSocketRef.current.send(
                JSON.stringify({ offer: peerRef.current.localDescription })
            );
        } catch (err) {
            console.error("Error creating offer:", err);
        }
    };

    const setupDataChannel = (channel, isReceiver) => {
        channel.binaryType = 'arraybuffer';

        channel.onopen = () => {
            console.log(`${isReceiver ? 'Receive' : 'Send'} channel opened`);
            setIsConnected(true);
        };

        channel.onclose = () => {
            console.log(`${isReceiver ? 'Receive' : 'Send'} channel closed`);
            setIsConnected(false);
        };

        if (isReceiver) {
            channel.onmessage = handleReceiveFile;
        }
    };

    const setUpMessageChannel=(channel,isReceiver)=>{
        channel.onopen = () => {
            console.log(`${isReceiver ? 'Receive' : 'Send'} channel opened`);
            setIsConnected(true);
        };

        channel.onclose = () => {
            console.log(`${isReceiver ? 'Receive' : 'Send'} channel closed`);
            setIsConnected(false);
        };
        
        if(isReceiver){
            channel.onmessage=handleReceiveMessage;
        }
        
    }

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const sendFile = async () => {
        if (!selectedFile || !sendChannel.current) return;

        try {
            // Send file metadata first
            const metadata = JSON.stringify({
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size
            });
            sendChannel.current.send(JSON.stringify({ type: 'metadata', data: metadata }));

            // Read and send file in chunks
            const buffer = await selectedFile.arrayBuffer();
            const chunkSize = 16 * 1024; // 16KB chunks
            let offset = 0;
            let total = buffer.byteLength;

            while (offset < total) {
                const chunk = buffer.slice(offset, offset + chunkSize);
                sendChannel.current.send(chunk);
                offset += chunk.byteLength;
                setSendProgress((offset / total) * 100);
            }

            // Send end message
            sendChannel.current.send(JSON.stringify({ type: 'end' }));
            setSelectedFile(null);
            setSendProgress(0);
        } catch (err) {
            console.error('Error sending file:', err);
        }
    };

    const sendMessage = () => {
        if (!message.trim() || !sendMessageChannel.current || isSending) {
            return;
        }

        try {
            setIsSending(true);
            sendMessageChannel.current.send(message);
            setMessages(prev => [...prev, { text: message, sender: "You" }]);
        } catch (error) {
            setError("Failed to send message: " + error.message);
        } finally {
            setIsSending(false);
            setMessage("");
        }
    };

    const handleReceiveFile = (event) => {
        try {
            if (typeof event.data === "string") {
                const message = JSON.parse(event.data);
    
                if (message.type === "metadata") {
                    // New file transfer starting
                    const metadata = JSON.parse(message.data);
                    console.log("Receiving file:", metadata);
                    
                    // Store the filename and type for later use
                    fileName.current = metadata.name;
                    fileType.current = metadata.type; // MIME type
    
                    fileChunks.current = [];
                    setIsReceivingFile(true);
                } else if (message.type === "end") {
                    // File transfer complete
                    const blob = new Blob(fileChunks.current, { type: fileType.current }); // Correct MIME type
                    const file = new File([blob], fileName.current, { type: fileType.current });
    
                    const url = URL.createObjectURL(file);
                    
                    // Create download link
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = fileName.current; // Ensure correct name & extension
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a); // Cleanup
    
                    // Cleanup
                    URL.revokeObjectURL(url);
                    fileChunks.current = [];
                    setIsReceivingFile(false);
                    setReceiveProgress(0);
                }
            } else {
                // Receiving actual file chunks
                fileChunks.current.push(event.data);
                setReceiveProgress((prev) => prev + event.data.byteLength);
            }
        } catch (error) {
            console.error("Error processing received data:", error);
        }
    };

    const handleReceiveMessage = (event) => {
        try {
            const receivedMessage = event.data;
            setMessages(prev => [...prev, { text: receivedMessage, sender: "Partner" }]);
        } catch (error) {
            setError("Failed to receive message: " + error.message);
        }
    };
    

    const handleIceCandidateEvent = (e) => {
        if (e.candidate) {
            console.log("Sending ICE candidate");
            webSocketRef.current.send(
                JSON.stringify({ iceCandidate: e.candidate })
            );
        }
    };

    const handleTrackEvent = (e) => {
        console.log("Received Tracks");
        partnerVideo.current.srcObject = e.streams[0];
    };

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-6">

            <div className="grid md:grid-cols-2 gap-4">
                <div className="relative">
                    <video 
                        className="w-full h-64 object-cover rounded-lg bg-gray-800"
                        autoPlay 
                        ref={userVideo} 
                        muted
                        controls={true}
                    />
                    <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded flex items-center">
                        <Video className="w-4 h-4 mr-2" />
                        <span>You</span>
                    </div>
                </div>
                <div className="relative">
                    <video 
                        className="w-full h-64 object-cover rounded-lg bg-gray-800"
                        autoPlay 
                        ref={partnerVideo}
                        controls={true}
                    />
                    <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded flex items-center">
                        <Video className="w-4 h-4 mr-2" />
                        <span>Partner</span>
                    </div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <FileUp className="w-5 h-5 mr-2" />
                        File Sharing
                    </h3>
                    
                    <div className="space-y-4">
                        <input
                            type="file"
                            onChange={(e) => setSelectedFile(e.target.files[0])}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100"
                            disabled={!isConnected}
                        />

                        {selectedFile && (
                            <button
                                onClick={sendFile}
                                disabled={!isConnected || !selectedFile}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 
                                         disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                            >
                                <Send className="w-4 h-4 mr-2" />
                                Send {selectedFile.name}
                            </button>
                        )}

                        {sendProgress > 0 && (
                            <div className="space-y-2">
                                <div className="text-sm text-gray-600">Sending...</div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div 
                                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                        style={{ width: `${sendProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {isReceivingFile && (
                            <div className="space-y-2">
                                <div className="text-sm text-gray-600">Receiving file...</div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div 
                                        className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                                        style={{ width: `${receiveProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <MessageCircle className="w-5 h-5 mr-2" />
                        Messages
                    </h3>
                    
                    <div className="h-48 overflow-y-auto mb-4 p-2 bg-gray-50 rounded">
                        {messages.map((msg, index) => (
                            <div 
                                key={index} 
                                className={`mb-2 p-2 rounded ${
                                    msg.sender === "You" 
                                        ? "bg-blue-100 ml-auto" 
                                        : "bg-gray-100"
                                } max-w-[80%] ${
                                    msg.sender === "You" 
                                        ? "ml-auto" 
                                        : "mr-auto"
                                }`}
                            >
                                <div className="text-xs text-gray-600">{msg.sender}</div>
                                <div>{msg.text}</div>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <input 
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                            placeholder="Type a message..."
                            className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button 
                            onClick={sendMessage} 
                            disabled={isSending || !message.trim()}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 
                                     disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Room;