import React, { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CreateRoom = () => {
  const [link, setLink] = useState("");

  const create = async (e) => {
    e.preventDefault();
    const resp = await fetch("http://localhost:8000/create");
    const { room_id } = await resp.json();
    window.location.href = `/room/${room_id}`;
  };

  const handleJoin = () => {
    if (link) {
      window.location.href = link;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-gray-800 p-8 rounded-xl shadow-2xl max-w-md w-full space-y-8">
        <h1 className="text-3xl font-bold text-center text-white mb-8">
          Video Meeting
        </h1>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            onClick={create}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
          >
            Create Room
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full sm:w-auto bg-gray-700 hover:bg-gray-600 text-white border-gray-600 py-4 px-8 rounded-lg transition-all duration-300"
              >
                Join Room
              </Button>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-md bg-gray-800 border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-white">Join Meeting</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Enter the meeting link below to join an existing room
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex items-center space-x-2 mt-4">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="link" className="sr-only">
                    Link
                  </Label>
                  <Input
                    id="link"
                    defaultValue="https://enter_meet_link.com"
                    onChange={(e) => setLink(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                </div>
                <Button 
                  type="submit" 
                  size="sm" 
                  className="px-3 bg-gray-700 hover:bg-gray-600"
                >
                  <span className="sr-only">Copy</span>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              <DialogFooter className="sm:justify-start mt-6">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleJoin}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Join Meeting
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default CreateRoom;