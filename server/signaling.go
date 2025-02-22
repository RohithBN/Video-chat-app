package server

import (
    "encoding/json"
    "log"
    "net/http"
    "github.com/gorilla/websocket"
)

var AllRooms RoomMap

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true
    },
}

type broadcastMsg struct {
    Message map[string]interface{}
    RoomID  string
    Client  *websocket.Conn
}

var broadcast = make(chan broadcastMsg)

// Broadcaster handles broadcasting messages to all clients in a room
func Broadcaster() {
    for {
        msg := <-broadcast
        participants := AllRooms.Get(msg.RoomID)
        if participants == nil {
            continue
        }
        
        for _, client := range participants {
            if client.Conn != msg.Client {
                err := client.Conn.WriteJSON(msg.Message)
                if err != nil {
                    log.Printf("Error broadcasting to client: %v", err)
                    // Remove the client from the room
                    AllRooms.RemoveParticipant(msg.RoomID, client.Conn)
                    client.Conn.Close()
                }
            }
        }
    }
}

func CreateRoomRequestHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
    roomID := AllRooms.CreateRoom()
    
    type resp struct {
        RoomID string `json:"room_id"`
    }
    
    log.Printf("Created room: %s", roomID)
    json.NewEncoder(w).Encode(resp{RoomID: roomID})
}

func JoinRoomRequestHandler(w http.ResponseWriter, r *http.Request) {
    roomID, ok := r.URL.Query()["roomID"]
	if !ok{
		log.Println("roomID missing in URL Parameters")
        http.Error(w, "Missing roomID", http.StatusBadRequest)
        return
	}
	name,ok:=r.URL.Query()["username"]
    if !ok {
        log.Println("username missing in URL Parameters")
        http.Error(w, "Missing roomID", http.StatusBadRequest)
        return
    }

    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("Web Socket Upgrade Error: %v", err)
        return
    }

    // Set close handler
    ws.SetCloseHandler(func(code int, text string) error {
        AllRooms.RemoveParticipant(roomID[0], ws)
        return nil
    })

    // Add participant to room
    AllRooms.InsertIntoRoom(roomID[0], false, ws,name[0])

    // Broadcast join message
    broadcast <- broadcastMsg{
        Message: map[string]interface{}{"join": true},
        RoomID:  roomID[0],
        Client:  ws,
    }

    // Handle incoming messages
    for {
        var msg broadcastMsg
        err := ws.ReadJSON(&msg.Message)
        if err != nil {
            log.Printf("Read Error: %v", err)
            AllRooms.RemoveParticipant(roomID[0], ws)
            ws.Close()
            break
        }
        
        msg.Client = ws
        msg.RoomID = roomID[0]
        broadcast <- msg
    }
}
