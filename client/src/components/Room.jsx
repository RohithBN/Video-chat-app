import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Mic, MicOff, Video, VideoOff, MessageCircle, Share, Users, FileUp, X, Send } from "lucide-react";


const Room = () => {
    const userVideo = useRef(); //references your video
    const userStream = useRef(); // references your stream
    const partnerVideo = useRef(); // references partner's video
    const peerRef = useRef(); // references the peer connection
    const webSocketRef = useRef(); // references the WebSocket connection
    const sendChannel = useRef(); // references the data channel for sending files
    const receiveChannel = useRef(); // references the data channel for receiving files
    const fileChunks = useRef([]); // references the chunks of the file being sent
    const { roomID } = useParams();
    const [searchParams] = useSearchParams();
    const username = searchParams.get("username");
    const fileName = useRef("");
    const fileType = useRef("");
    const sendMessageChannel=useRef(); // references the data channel for sending messages
    const receiveMessageChannel=useRef(); // references the data channel for receiving messages
    const[partnerUsername,setPartnerUsername]=useState("")

    const [selectedFile, setSelectedFile] = useState(null);
    const [message,setMessage]=useState("");
    const [isSending, setIsSending] = useState(false);
    const [messages, setMessages] = useState([]);
    const [isConnected,setIsConnected]=useState(false);

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [activePanel, setActivePanel] = useState(null); 
    const [sharingVideo, setSharingVideo] = useState(false);

    const toggleMute = () => {
        setIsMuted(!isMuted)
        userStream.current.getAudioTracks()[0].enabled = isMuted;
    };
    const toggleVideo = () => {
        setIsVideoOff(!isVideoOff);
        userStream.current.getVideoTracks()[0].enabled = isVideoOff;
    };


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
                //this displays your own video from camera
                userVideo.current.srcObject = stream;
                // now the video is stored as stream in userStream
                userStream.current = stream;

                //websocket connection
                webSocketRef.current = new WebSocket(
                    `ws://localhost:8000/join?roomID=${roomID}&username=${username}`
                );

                webSocketRef.current.addEventListener("open", () => {
                    // once you join the room , send message to the server
                    webSocketRef.current.send(JSON.stringify({ join: true,partnerName:username }));
                    
                });

                webSocketRef.current.addEventListener("message", async (e) => {
                    //the server receives message and broadcasts to all the connected peers apart from yourself
                    // when you receive a message from the server
                    const message = JSON.parse(e.data);

                    if (message.join) {
                        // if a peer joins , then call the user
                        callUser();
                    }

                    if (message.partnerName && message.partnerName !== username) {
                        setPartnerUsername(message.partnerName);
                        
                        // Only send back if this is the first time receiving partner's name
                        if (!partnerUsername) {
                            webSocketRef.current.send(JSON.stringify({ partnerName: username }));
                        }
                    }

                    if (message.offer) {
                        //handle the offer received from server
                        handleOffer(message.offer);
                    }

                    if (message.answer) {
                        console.log("Receiving Answer");
                        // set the answer as remote description
                        await peerRef.current?.setRemoteDescription(
                            new RTCSessionDescription(message.answer)
                        );
                    }

                    if (message.iceCandidate) {
                        console.log("Receiving ICE Candidate");
                        try {
                            // add the ice candidate to the peer connection
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
        //create a new peer connection
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
        // add the ice candidate to the peer connection
        peer.onicecandidate = handleIceCandidateEvent;
        // when a track is received, call the handleTrackEvent to handle tracks
        peer.ontrack = handleTrackEvent;

        return peer;
    };

    const handleOffer = async (offer) => {
        console.log("Received Offer, Creating Answer");
        // when the partner receives offer , create a new peer connection
        peerRef.current = createPeer();

        try {
            // set the remote description as the offer
            await peerRef.current.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            // partner adds his tracks to the peer connection
            userStream.current.getTracks().forEach((track) => {
                peerRef.current.addTrack(track, userStream.current);
            });
            // partner creates a data channel to send files and messages
            sendChannel.current = peerRef.current.createDataChannel("sendData");
            sendMessageChannel.current= peerRef.current.createDataChannel("sendMessage")
            // setup the data channel for sending files and messages
            setupDataChannel(sendChannel.current, false); // false → This is the sender
            setUpMessageChannel(sendChannel.current,false);
            // handling for when the partner receives the data
            peerRef.current.ondatachannel = (event) => {
                const channel = event.channel;
                if(channel.label==='sendDataChannel'){
                    // if the channel is for sending files. 
                    //NOTE: the label is set to 'sendDataChannel' in the sender side while sending file , so the sender data channel should match the partner (receivers) data chanenl label
                    receiveChannel.current=channel
                }
                else if(channel.label==='messageDataChannel'){
                    receiveMessageChannel.current=channel;
                }
                if (receiveChannel.current) {
                    //set up data Channel to receive files and messGES
                    setupDataChannel(receiveChannel.current, true);
                    setUpMessageChannel(receiveMessageChannel.current,true);
                }
                
            };

            //create an answer for the offer and set it as your local description
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
        // the peer ref references to the new peer connection made
        peerRef.current = createPeer();
        if(!sharingVideo){
            //if user is not sharing video , add the user stream to the peer connection
        userStream.current.getTracks().forEach((track) => {
            peerRef.current.addTrack(track, userStream.current);
        });
    }
        // Create data channel for sending file
        sendChannel.current = peerRef.current.createDataChannel("sendDataChannel");
        // create another data channel for sending messages
        sendMessageChannel.current=peerRef.current.createDataChannel("messageDataChannel")

        if(sendChannel.current) {
            // setup the data channel for sending files
        setupDataChannel(sendChannel.current, false);
        }
        if(sendMessageChannel.current){
            // setup the data channel for sending messages
            setUpMessageChannel(sendMessageChannel.current,false);
        }
        peerRef.current.ondatachannel = (event) => {
            // when the partner sends data , this checks the label and determines if its file ot message
            const channel = event.channel;
            if(channel.label==='sendData'){
                receiveChannel.current=channel
            }
            else if(channel.label==='sendMessage'){
                receiveMessageChannel.current=channel;
            }
            if (channel) {
                setupDataChannel(receiveChannel.current, true);
                setUpMessageChannel(receiveMessageChannel.current,true);
            }
            
        };

        try {
            //create an offer to send to the partner
            const offer = await peerRef.current.createOffer();
            //set the offer as your local description
            await peerRef.current.setLocalDescription(offer);
            //send the offer to the servere
            webSocketRef.current.send(
                JSON.stringify({ offer: peerRef.current.localDescription })
            );
        } catch (err) {
            console.error("Error creating offer:", err);
        }
    };

    const setupDataChannel = (channel, isReceiver) => {
        //make the channle type arrayBuffer fot file trnasfer
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
            //if the channel is receiver , then handle the received file
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
            // if the channel is receiver , then handle the received message
            channel.onmessage=handleReceiveMessage;
        }
        
    }

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
        // on receiving the tracks from the partner , set the partner video stream
        partnerVideo.current.srcObject = e.streams[0];
    };

    const toggleShareVideo = async () => {
        try {
          if (!sharingVideo) {
            // Start screen sharing
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: false
            });
      
            // Store original stream before replacing
            if (!userVideo.current.originalStream) {
              userVideo.current.originalStream = userVideo.current.srcObject;
            }
      
            // Set the screen stream as the current stream
            userVideo.current.srcObject = screenStream;  // Changed to use screenStream directly
      
            // Handle when user stops sharing via browser controls
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
              setSharingVideo(false);
              
              // Switch back to camera
              if (userVideo.current?.originalStream) {
                userVideo.current.srcObject = userVideo.current.originalStream;
                
                // Replace track in peer connection
                if (peerRef.current) {
                  const senders = peerRef.current.getSenders();
                  const sender = senders.find(s => s.track?.kind === 'video');
                  if (sender) {
                    const videoTrack = userVideo.current.originalStream.getVideoTracks()[0];
                    sender.replaceTrack(videoTrack);
                  }
                }
              }
            });
      
            // Replace video track in peer connection
            if (peerRef.current) {
              const senders = peerRef.current.getSenders();
              const sender = senders.find(s => s.track?.kind === 'video');
              if (sender) {
                await sender.replaceTrack(screenStream.getVideoTracks()[0]);
              }
            }
      
            setSharingVideo(true);
          } else {
            // Stop screen sharing
            const currentStream = userVideo.current.srcObject;
            const screenTrack = currentStream.getVideoTracks()[0];
            screenTrack.stop();
      
            // Switch back to camera stream
            if (userVideo.current.originalStream) {
              userVideo.current.srcObject = userVideo.current.originalStream;
              
              // Replace track in peer connection
              if (peerRef.current) {
                const senders = peerRef.current.getSenders();
                const sender = senders.find(s => s.track?.kind === 'video');
                if (sender) {
                  const videoTrack = userVideo.current.originalStream.getVideoTracks()[0];
                  await sender.replaceTrack(videoTrack);
                }
              }
            }
      
            setSharingVideo(false);
          }
        } catch (error) {
          console.error('Error toggling screen share:', error);
          setSharingVideo(false);
        }
      };
      
        return (
          <div className="h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col">
            {/* Main content area */}
            <div className="flex-1 flex relative">
              {/* Video grid */}
              <div className="flex-1 p-6">
                <div className={`grid gap-6 h-full ${isFullScreen ? '' : 'grid-cols-2'}`}>
                  {/* Main video */}
                  <div className={`relative bg-gray-800 rounded-xl overflow-hidden shadow-2xl ${isFullScreen ? 'col-span-2' : ''}`}>
                    <video
                      ref={userVideo}
                      className="w-full h-full object-cover"
                      autoPlay
                      playsInline
                    />
                    <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium">
                      {username}
                    </div>
                  </div>
                  
                  {/* Partner video */}
                  <div className={`relative bg-gray-800 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${
                    isFullScreen ? 'absolute top-6 right-6 w-64 h-48 hover:scale-105' : ''
                  }`}>
                    <video
                      ref={partnerVideo}
                      className="w-full h-full object-cover"
                      autoPlay
                      playsInline
                    />
                    <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium">
                      {partnerUsername}
                    </div>
                  </div>
                </div>
              </div>
      
              {/* Side panel */}
              {activePanel && (
                <div className="w-96 bg-gray-800 border-l border-gray-700 shadow-xl transition-all duration-300">
                  <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-white text-lg font-semibold">
                      {activePanel === 'chat' && 'Chat'}
                      {activePanel === 'participants' && 'Participants'}
                      {activePanel === 'files' && 'Files'}
                    </h3>
                    <button 
                      onClick={() => setActivePanel(null)}
                      className="text-gray-400 hover:text-white transition-colors duration-200 p-2 hover:bg-gray-700 rounded-lg"
                    >
                      <X size={20} />
                    </button>
                  </div>
      
                  {activePanel === 'chat' && (
                    <div className="flex flex-col h-[calc(100%-64px)]">
                      <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {messages.map((msg, index) => (
                          <div
                            key={index}
                            className={`max-w-[85%] ${msg.sender === 'You' ? 'ml-auto' : ''}`}
                          >
                            <div className="text-sm text-gray-400 mb-1 font-medium">
                              {msg.sender}
                            </div>
                            <div className={`rounded-2xl p-4 shadow-md ${
                              msg.sender === 'You'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-white'
                            }`}>
                              {msg.text}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 border-t border-gray-700 bg-gray-800">
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 bg-gray-700 text-white rounded-xl px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow duration-200"
                          />
                          <button
                            className="p-3 text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors duration-200 shadow-lg hover:shadow-xl"
                            onClick={sendMessage}
                          >
                            <Send size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
      
                  {activePanel === 'participants' && (
                    <div className="p-6 space-y-6">
                      <div className="flex items-center space-x-4 p-4 bg-gray-700 rounded-xl">
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">{username[0].toUpperCase()}</div>
                        <span className="text-white font-medium">{username} (You)</span>
                      </div>
                      <div className="flex items-center space-x-4 p-4 bg-gray-700 rounded-xl">
                        <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-semibold">{partnerUsername[0].toUpperCase()}</div>
                        <span className="text-white font-medium">{partnerUsername}</span>
                      </div>
                    </div>
                  )}
      
                  {activePanel === 'files' && (
                    <div className="p-6 space-y-6">
                      <input
                        type="file"
                        onChange={(e) => setSelectedFile(e.target.files[0])}
                        className="block w-full text-sm text-gray-400
                          file:mr-4 file:py-3 file:px-6
                          file:rounded-xl file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-600 file:text-white
                          hover:file:bg-blue-700
                          transition-colors duration-200"
                      />
                      {selectedFile && (
                        <div className="bg-gray-700 p-4 rounded-xl shadow-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">{selectedFile.name}</span>
                            <button 
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                              onClick={sendFile}
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
      
            {/* Control bar */}
            <div className="h-20 bg-gray-800 border-t border-gray-700 flex items-center justify-center space-x-6">
              {[
                { icon: isMuted ? MicOff : Mic, onClick: toggleMute, active: isMuted },
                { icon: isVideoOff ? VideoOff : Video, onClick: toggleVideo, active: isVideoOff },
                { icon: MessageCircle, onClick: () => setActivePanel(activePanel === 'chat' ? null : 'chat'), active: activePanel === 'chat' },
                { icon: Users, onClick: () => setActivePanel(activePanel === 'participants' ? null : 'participants'), active: activePanel === 'participants' },
                { icon: FileUp, onClick: () => setActivePanel(activePanel === 'files' ? null : 'files'), active: activePanel === 'files' },
                { icon: Share, onClick: toggleShareVideo, active: false }
              ].map((control, index) => (
                <button
                  key={index}
                  onClick={control.onClick}
                  className={`p-4 rounded-xl transition-all duration-200 transform hover:scale-110 ${
                    control.active 
                      ? 'bg-red-500 text-white shadow-lg' 
                      : 'bg-gray-700 text-white hover:bg-gray-600 hover:shadow-lg'
                  }`}
                >
                  <control.icon size={24} />
                </button>
              ))}
            </div>
          </div>
        );
      };
      
      export default Room;