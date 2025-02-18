package main

import (
    "log"
    "net/http"
    "github.com/RohithBN/server"
)

func main() {
    server.AllRooms.Init()
    
    // Start broadcaster once
    go server.Broadcaster()
    
    http.HandleFunc("/create", server.CreateRoomRequestHandler)
    http.HandleFunc("/join", server.JoinRoomRequestHandler)
    
    log.Println("Starting Server on Port 8000")
    err := http.ListenAndServe(":8000", nil)
    if err != nil {
        log.Fatal(err)
    }
}
