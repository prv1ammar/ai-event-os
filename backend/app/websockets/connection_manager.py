"""
app/websockets/connection_manager.py
─────────────────────────────────────
In-memory WebSocket connection registry.
Supports broadcasting to all connections or to event-specific rooms.
"""

from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # All active connections
        self.active_connections: List[WebSocket] = []
        # Room-based connections: {room_id: [WebSocket, ...]}
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str | None = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        if room:
            self.rooms.setdefault(room, []).append(websocket)

    def disconnect(self, websocket: WebSocket, room: str | None = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if room and room in self.rooms:
            self.rooms[room] = [ws for ws in self.rooms[room] if ws != websocket]

    async def broadcast(self, message: dict):
        """Send to all connected clients."""
        for connection in self.active_connections:
            await connection.send_json(message)

    async def broadcast_to_room(self, room: str, message: dict):
        """Send to all clients subscribed to a specific room."""
        for connection in self.rooms.get(room, []):
            await connection.send_json(message)

    async def send_personal(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)


# Singleton instance
manager = ConnectionManager()
