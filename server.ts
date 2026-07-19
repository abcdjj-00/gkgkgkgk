import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface TimeRange {
  start: string;
  end: string;
}

interface UserData {
  pinHash: string;
  ranges: Record<string, TimeRange[]>;
  selectedDates?: string[];
}

interface RoomData {
  code: string;
  dates: string[];
  createdAt: number;
  createdBy: string;
  users: Record<string, UserData>;
}

interface Database {
  rooms: Record<string, RoomData>;
}

const DB_FILE = path.join(process.cwd(), "db.json");

// Helper to load database
function loadDb(): Database {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error reading database file, resetting:", e);
  }
  return { rooms: {} };
}

// Helper to save database
function saveDb(db: Database) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing database file:", e);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API 1: Create room
  app.post("/api/rooms", (req, res) => {
    const { nickname, pinHash, dates } = req.body;
    if (!nickname || !pinHash || !Array.isArray(dates)) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const db = loadDb();
    
    // Generate unique 6-character code
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    let attempts = 0;
    while (attempts < 10) {
      code = "";
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!db.rooms[code]) break;
      attempts++;
    }

    const newRoom: RoomData = {
      code,
      dates: dates.sort(),
      createdAt: Date.now(),
      createdBy: nickname,
      users: {
        [nickname]: {
          pinHash,
          ranges: {},
          selectedDates: []
        }
      }
    };

    db.rooms[code] = newRoom;
    saveDb(db);

    res.json({
      success: true,
      code,
      config: {
        dates: newRoom.dates,
        createdBy: newRoom.createdBy,
        createdAt: newRoom.createdAt
      }
    });
  });

  // API 2: Join room
  app.post("/api/rooms/:code/join", (req, res) => {
    const { code } = req.params;
    const { nickname, pinHash } = req.body;

    if (!nickname || !pinHash) {
      return res.status(400).json({ error: "Nickname and PIN hash are required" });
    }

    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const existingUser = room.users[nickname];
    if (existingUser) {
      if (existingUser.pinHash !== pinHash) {
        return res.status(401).json({ error: "Incorrect PIN" });
      }
    } else {
      // Register new user under this room
      room.users[nickname] = {
        pinHash,
        ranges: {},
        selectedDates: []
      };
      saveDb(db);
    }

    res.json({
      success: true,
      nickname,
      myRanges: room.users[nickname].ranges,
      selectedDates: room.users[nickname].selectedDates || [],
      config: {
        dates: room.dates,
        createdBy: room.createdBy,
        createdAt: room.createdAt
      }
    });
  });

  // API 3: Update user ranges
  app.post("/api/rooms/:code/user/:nickname/ranges", (req, res) => {
    const { code, nickname } = req.params;
    const { pinHash, ranges, selectedDates } = req.body;

    if (!pinHash || !ranges) {
      return res.status(400).json({ error: "PIN hash and ranges are required" });
    }

    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const user = room.users[nickname];
    if (!user) {
      return res.status(404).json({ error: "User not found in this room" });
    }

    if (user.pinHash !== pinHash) {
      return res.status(401).json({ error: "Incorrect PIN" });
    }

    // Save ranges and selectedDates if passed
    user.ranges = ranges;
    if (selectedDates) {
      user.selectedDates = selectedDates;
    }
    saveDb(db);

    res.json({ success: true });
  });

  // API 4: Get all responses for a room
  app.get("/api/rooms/:code/responses", (req, res) => {
    const { code } = req.params;
    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Extract only ranges for participants (do not leak pinHashes)
    const responses: Record<string, Record<string, TimeRange[]>> = {};
    const userSelectedDates: Record<string, string[]> = {};
    Object.keys(room.users).forEach((nick) => {
      const user = room.users[nick];
      const activeDates = user.selectedDates || room.dates;
      userSelectedDates[nick] = activeDates;
      const userRanges: Record<string, TimeRange[]> = {};
      Object.keys(user.ranges).forEach((d) => {
        if (activeDates.includes(d)) {
          userRanges[d] = user.ranges[d];
        }
      });
      responses[nick] = userRanges;
    });

    res.json({
      success: true,
      responses,
      userSelectedDates,
      config: {
        dates: room.dates,
        createdBy: room.createdBy,
        createdAt: room.createdAt
      }
    });
  });

  // API 5: Find all rooms by nickname and PIN hash
  app.post("/api/find-rooms", (req, res) => {
    const { nickname, pinHash } = req.body;
    if (!nickname || !pinHash) {
      return res.status(400).json({ error: "Nickname and PIN hash are required" });
    }

    const db = loadDb();
    const matchedRooms: { code: string; config: any }[] = [];

    Object.keys(db.rooms).forEach((code) => {
      const room = db.rooms[code];
      const user = room.users[nickname];
      if (user && user.pinHash === pinHash) {
        matchedRooms.push({
          code,
          config: {
            dates: room.dates,
            createdAt: room.createdAt,
            createdBy: room.createdBy
          }
        });
      }
    });

    res.json({
      success: true,
      rooms: matchedRooms
    });
  });

  // API 6: Update room dates
  app.post("/api/rooms/:code/dates", (req, res) => {
    const { code } = req.params;
    const { nickname, pinHash, dates } = req.body;

    if (!nickname || !pinHash || !Array.isArray(dates)) {
      return res.status(400).json({ error: "Nickname, PIN hash, and dates are required" });
    }

    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const user = room.users[nickname];
    if (!user) {
      return res.status(404).json({ error: "User not found in this room" });
    }

    if (user.pinHash !== pinHash) {
      return res.status(401).json({ error: "Incorrect PIN" });
    }

    // Save sorted dates
    room.dates = dates.sort();
    saveDb(db);

    res.json({
      success: true,
      config: {
        dates: room.dates,
        createdBy: room.createdBy,
        createdAt: room.createdAt
      }
    });
  });

  // Vite dev or production static serving middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
