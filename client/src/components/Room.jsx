import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

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

    const [isConnected, setIsConnected] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [sendProgress, setSendProgress] = useState(0);
    const [receiveProgress, setReceiveProgress] = useState(0);
    const [isReceivingFile, setIsReceivingFile] = useState(false);

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
            setupDataChannel(sendChannel.current, false); // false → This is the sender
            // Create data channel for receiving
            peerRef.current.ondatachannel = (event) => {
                receiveChannel.current = event.channel;
                if (receiveChannel.current) {
                    setupDataChannel(receiveChannel.current, true);
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

        // Create data channel for sending
        sendChannel.current = peerRef.current.createDataChannel("sendDataChannel");
        if(sendChannel.current) {
        setupDataChannel(sendChannel.current, false);
        }
        peerRef.current.ondatachannel = (event) => {
            receiveChannel.current = event.channel;
            if (receiveChannel.current) {
                setupDataChannel(receiveChannel.current, true);
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
            channel.onmessage = handleReceiveMessage;
        }
    };

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

    const handleReceiveMessage = (event) => {
        try {
            if (typeof event.data === 'string') {
                const message = JSON.parse(event.data);
                
                if (message.type === 'metadata') {
                    // New file transfer starting
                    const metadata = JSON.parse(message.data);
                    console.log('Receiving file:', metadata);
                    fileChunks.current = [];
                    setIsReceivingFile(true);
                } else if (message.type === 'end') {
                    // File transfer complete
                    const blob = new Blob(fileChunks.current);
                    const file = new File([blob], 'received-file', { type: blob.type });

                    const url = URL.createObjectURL(file);
                    
                    // Create download link
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'received-file';
                    a.click();
                    
                    // Cleanup
                    URL.revokeObjectURL(url);
                    fileChunks.current = [];
                    setIsReceivingFile(false);
                    setReceiveProgress(0);
                }
            } else {
                // Received a chunk of file data
                fileChunks.current.push(event.data);
                const totalSize = fileChunks.current.reduce((acc, chunk) => acc + chunk.byteLength, 0);
                setReceiveProgress(totalSize);
            }
        } catch (err) {
            console.error('Error handling received message:', err);
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
        <div className="max-w-4xl mx-auto p-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="relative">
                    <video 
                        className="w-full rounded-lg bg-gray-800" 
                        autoPlay 
                        ref={userVideo} 
                        muted
                        controls={true}
                    />
                    <span className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded">
                        You
                    </span>
                </div>
                <div className="relative">
                    <video 
                        className="w-full rounded-lg bg-gray-800" 
                        autoPlay 
                        ref={partnerVideo}
                        controls={true}
                    />
                    <span className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-2 py-1 rounded">
                        Partner
                    </span>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-lg font-semibold mb-4">File Sharing</h3>
                
                <div className="space-y-4">
                    {/* File Selection */}
                    <div>
                        <input
                            type="file"
                            onChange={handleFileSelect}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100"
                            disabled={!isConnected}
                        />
                    </div>

                    {/* Send Button */}
                    {selectedFile && (
                        <div>
                            <button
                                onClick={sendFile}
                                disabled={!isConnected || !selectedFile}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Send {selectedFile.name}
                            </button>
                        </div>
                    )}

                    {/* Progress Bars */}
                    {sendProgress > 0 && (
                        <div className="space-y-2">
                            <div className="text-sm text-gray-600">Sending...</div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div 
                                    className="bg-blue-600 h-2.5 rounded-full"
                                    style={{ width: `${sendProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {isReceivingFile && (
                        <div className="space-y-2">
                            <div className="text-sm text-gray-600">Receiving file...</div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div 
                                    className="bg-green-600 h-2.5 rounded-full"
                                    style={{ width: `${receiveProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Room;