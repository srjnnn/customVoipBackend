import express from 'express';
import cors from 'cors';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import supabase from './supabase.js'; // make sure supabase.js exports a Supabase client
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

dotenv.config();

const app = express();

// CORS
app.use(cors({
  origin: 'http://localhost:3000/', // change to your frontend URL in production
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true
}));

app.use(express.json());

/** Zod Schemas */
const RoomSchema = z.object({
  name: z.string().min(1).max(100),
  capacity: z.number().min(1).max(11).default(11),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string(),
  recurring: z.boolean().default(false),
});

const TokenSchema = z.object({
  role: z.enum(['host', 'cohost', 'participant']),
  displayName: z.string().min(1).max(50),
});

/** Create a Room */
app.post('/rooms', async (req, res) => {
  try {
    const data = RoomSchema.parse(req.body);

    const { data: room, error } = await supabase
      .from('rooms')
      .insert([{
        id: nanoid(10),
        name: data.name,
        capacity: data.capacity ?? null,
        start_at: new Date(data.startAt).toISOString(),
        end_at: new Date(data.endAt).toISOString(),
        timezone: data.timezone,
        recurring: data.recurring ?? null,
        state: 'scheduled'
      }])
      .select()
      .single();

    if (error) throw error;

    res.json(room);
  } catch (error) {
    res.status(400).json({ error: error.message || String(error) });
  }
});

/** Get Room by ID */
app.get('/rooms/:id', async (req, res) => {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

/** Generate LiveKit Token for Room */
app.post('/rooms/:id/tokens', async (req, res) => {
  try {
    const data = TokenSchema.parse(req.body);

    // Check if room exists and is open
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !room || room.state === 'closed') {
      return res.status(400).json({ error: 'Room not available' });
    }

    const sanitizedName = sanitizeHtml(data.displayName, {
      allowedTags: [],
      allowedAttributes: {},
    });

    // LiveKit token generation
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: sanitizedName }
    );

    at.addGrant({ roomJoin: true, room: req.params.id });
    const livekitToken = at.toJwt();

    res.json({ token: livekitToken, url: process.env.LIVEKIT_URL });
  } catch (error) {
    res.status(400).json({ error: error.message || String(error) });
  }
});

/** Close Room */
app.post('/rooms/:id/close', async (req, res) => {
  const { data: room, error } = await supabase
    .from('rooms')
    .update({ state: 'closed' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message || String(error) });
  res.json(room);
});

/** Optional WebSocket Server */
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    // Optional: broadcast to other clients
  });
});

/** Start Express server */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
