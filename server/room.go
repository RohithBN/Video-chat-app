package server

import (
    "github.com/gorilla/websocket"
    "log"
    "sync"
    "math/rand"
    "time"
)

type Participant struct {
    Name string
    Host bool
    Conn *websocket.Conn
}

type RoomMap struct {
    Mutex sync.RWMutex
    Map   map[string][]Participant
}

func (r *RoomMap) Init() {
    r.Map = make(map[string][]Participant)
}

func (r *RoomMap) Get(roomID string) []Participant {
    r.Mutex.RLock()
    defer r.Mutex.RUnlock()
    return r.Map[roomID]
}

func (r *RoomMap) CreateRoom() string {
    r.Mutex.Lock()
    defer r.Mutex.Unlock()

    rand.Seed(time.Now().UnixNano())
    var letters = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")
    b := make([]rune, 8)
    for i := range b {
        b[i] = letters[rand.Intn(len(letters))]
    }
    roomID := string(b)
    r.Map[roomID] = []Participant{}
    return roomID
}

func (r *RoomMap) InsertIntoRoom(roomID string, host bool, conn *websocket.Conn,name string) {
    r.Mutex.Lock()
    defer r.Mutex.Unlock()

    p := Participant{name,host, conn}
    log.Printf("Inserting into Room: %s", roomID)
    r.Map[roomID] = append(r.Map[roomID], p)
}

func (r *RoomMap) RemoveParticipant(roomID string, conn *websocket.Conn) {
    r.Mutex.Lock()
    defer r.Mutex.Unlock()

    participants := r.Map[roomID]
    for i, p := range participants {
        if p.Conn == conn {
            // Remove participant
            r.Map[roomID] = append(participants[:i], participants[i+1:]...)
            break
        }
    }

    // If room is empty, delete it
    if len(r.Map[roomID]) == 0 {
        delete(r.Map, roomID)
        log.Printf("Deleted empty room: %s", roomID)
    }
}