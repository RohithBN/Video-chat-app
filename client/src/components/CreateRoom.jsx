import React from "react";
import { useNavigate } from "react-router-dom";

const CreateRoom = () => {
  const navigate = useNavigate();

  const create = async (e) => {
    e.preventDefault();

    const resp = await fetch("http://localhost:8000/create");
    const { room_id } = await resp.json();

    navigate(`/room/${room_id}`);
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-900">
      <button
        onClick={create}
        className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition duration-300"
      >
        Create Room
      </button>
    </div>
  );
};

export default CreateRoom;
