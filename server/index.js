import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import supabase from './supabase.js'; // make sure supabase.js exists

const app = express();
const wss = new WebSocketServer({ port: 8080 });

// Enable CORS for frontend
app.use(cors({
  origin: 'https://vvhm0318-3000.inc1.devtunnels.ms/', // change to your frontend URL in production
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
    console.log('Creating room with data:', req.body);
    const data = req.body;
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
    res.status(400).json({ error: error.message });
    console.error('Error creating room:', error);
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

/** Generate JWT Token */
app.post('/rooms/:id/tokens', async (req, res) => {
  try {
    const data = TokenSchema.parse(req.body);

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

    const token = jwt.sign(
      { roomId: req.params.id, role: data.role, identity: sanitizedName },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '15m' }
    );

    res.json({ token });
  } catch (error) {
    res.status(400).json({ error: 'Invalid token data' });
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

  if (error) return res.status(400).json({ error: error.message });
  res.json(room);
});

/** WebSocket Server */
wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    // Optional: broadcast to other clients
  });
});

/** Start Express server */
app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});
