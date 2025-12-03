const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ---------- Upload-Ordner ----------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '');
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

// ---------- DB ----------
const db = new sqlite3.Database(path.join(__dirname, 'game.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER,
      title_de TEXT,
      description_de TEXT,
      title_en TEXT,
      description_en TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      mission_id INTEGER,
      filename TEXT,
      mimetype TEXT,
      status TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Chat-Nachrichten (Team <-> GM)
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      from_gm INTEGER, -- 0 = Team, 1 = GM
      text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Broadcasts an alle Teams
  db.run(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Quittierung der Broadcasts (welches Team hat mit OK bestätigt?)
  db.run(`
    CREATE TABLE IF NOT EXISTS broadcast_receipts (
      team_id INTEGER,
      broadcast_id INTEGER,
      PRIMARY KEY (team_id, broadcast_id)
    )
  `);

  // Globaler Timer-Status (eine Runde)
  db.run(`
    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      start_time TEXT,
      duration_minutes INTEGER
    )
  `);

  // Missionen nur einfügen, wenn leer
  db.get(`SELECT COUNT(*) AS cnt FROM missions`, (err, row) => {
    if (err) {
      console.error('Fehler beim Zählen der Missions', err);
      return;
    }
    if (row.cnt === 0) {
      const missions = [
        [
          1,
          'BRUNNEN',
          'Aus einem öffentlichen Brunnen Wasser trinken.',
          'FOUNTAIN',
          'Drink water from a public fountain.'
        ],
        [
          2,
          'DINGE',
          'Vier verschiedene Gegenstände auf ein Bild bringen, die mit eurem Teambuchstaben beginnen. Im Chat die 4 Gegenstände benennen.',
          'ITEMS',
          'Include four items in one photo that all start with the first letter of your team name. Name the four items in the chat.'
        ],
        [
          3,
          'KLEIDERTAUSCH',
          'Zwei Teammitglieder tauschen für das Foto ein Kleidungsstück (z.B. Jacke) und machen gemeinsam ein Bild.',
          'CLOTHES SWAP',
          'Two team members swap one piece of clothing (e.g. jacket) and take a photo together.'
        ],
        [
          4,
          'FLUSS',
          'Einen Fuss in die Limmat stecken.',
          'RIVER',
          'Put one foot into the Limmat river.'
        ],
        [
          5,
          'FUSSGÄNGER',
          'Ein TM über den Fussgänger Streifen tragen.',
          'PEDESTRIAN',
          'Carry one team member across a pedestrian crossing.'
        ],
        [
          6,
          'GLEICHGEWICHT',
          'Während einer gesamten Liftfahrt bis zum Stillstand auf nur einem Fuss stehen, ohne die Wände zu berühren.',
          'BALANCE',
          'During an entire elevator ride (until it stops), stand on one foot without touching the walls.'
        ],
        [
          7,
          'GRAFFITI',
          'Ein Graffiti / Tag finden. Alle TM müssen dies der Reihe nach laut vorlesen, am Schluss alle zusammen gleichzeitig „Respect!“ sagen.',
          'GRAFFITI',
          'Find a graffiti or tag. Each team member reads it out loud in turn, then at the end everyone says “Respect!” together.'
        ],
        [
          8,
          'HOROSKOP',
          'Aus einer Gratiszeitung das Horoskop eines TM vorlesen. Während des Vorlesens pantomimisch zeigen, wie alles tatsächlich perfekt zutrifft.',
          'HOROSCOPE',
          'From a free newspaper, read the horoscope of one team member. While it is being read, act out how everything fits perfectly.'
        ],
        [
          9,
          'KUNST',
          'Ein Bild, das irgendwo aufgehängt ist, selbst auf einem A4-Blatt nachzeichnen, sodass die Grundzüge klar erkennbar sind. Beide Bilder nebeneinander zeigen.',
          'ART',
          'Choose a picture hanging somewhere and redraw it yourself on an A4 sheet so that the main features are clearly recognizable. Show both pictures side by side.'
        ],
        [
          10,
          'LÖWE',
          'Ein Bild eines Löwen in einem Buch oder einer Werbung finden und fotografieren.',
          'LION',
          'Find a picture of a lion in a book or advertisement and take a photo of it.'
        ],
        [
          11,
          'FULL TURN',
          'Eine 360° Video mit allen TM, aber ohne andere Personen im Video.',
          'FULL TURN',
          'Record a 360° video with all team members but without any other people in the video.'
        ],
        [
          12,
          'NANA',
          'Eine frei erfundene Geschichte der schwebenden blauen Figur in der Bahnhofhalle auf Englisch mit ernstem Gesicht erzählen. Dabei die Wörter „however“ und „a duck“ erwähnen. Die Figur muss im Hintergrund sein.',
          'NANA',
          'Invent a story about the floating blue figure in the main station hall and tell it in English with a serious face. Use the word “however” and mention “a duck”. The figure must be visible in the background.'
        ],
        [
          13,
          'PATRIOT',
          'Unter einer Schweizer Fahne zu zweit eine Strophe der Nationalhymne singen. Die Fahne muss zusehen sein.',
          'PATRIOT',
          'Under a Swiss flag, two team members sing one verse of the national anthem. The flag must be visible.'
        ],
        [
          14,
          'PRIM-TRAM',
          'Ein Selfie mit dem ganzen Team schiessen mit einem Tram im Hintergrund, dessen (klar ersichtliche) Nummer eine Primzahl ist.',
          'PRIME TRAM',
          'Take a selfie with the whole team in front of a tram whose clearly visible number is a prime number.'
        ],
        [
          15,
          'SPEED',
          'Ein TM läuft an einer Haltestelle in einen Bus oder in ein Tram und sofort durch eine andere Türe wieder raus, bevor es abfährt.',
          'SPEED',
          'At a stop, one team member runs into a bus or tram and immediately exits through another door before it departs.'
        ],
        [
          16,
          'SBB',
          'An einem SBB-Automaten eine Zugreise für 1 Person über CHF 300.- finden.',
          'SBB',
          'At a SBB ticket machine, find a train journey for 1 person costing more than CHF 300.–.'
        ],
        [
          17,
          'SCHÄRE STEI PAPIER',
          'Eine Runde Schere, Stein, Papier gegen eine fremde Person gewinnen.',
          'ROCK PAPER SCISSORS',
          'Win a round of rock-paper-scissors against a stranger.'
        ],
        [
          18,
          'STATUE',
          'Ein Selfie aller TM mit einer Statue im Hintergrund schiessen, wobei alle TM die Pose und den Gesichtsausdruck der Statue nachahmen.',
          'STATUE',
          'Take a selfie with all team members in front of a statue, imitating the pose and facial expression of the statue.'
        ],
        [
          19,
          'UGLY PIC',
          'Beim Landesmuseum ein Bild mit möglichst hässlichem Hintergrund machen. Mit beiden Händen das V-Zeichen machen.',
          'UGLY PIC',
          'Near the Landesmuseum, take a picture with the ugliest background possible. Make the V-sign with both hands.'
        ],
        [
          20,
          'VIERSPRACHIG',
          'Ein Plakat fotografieren, auf dem Wörter auf mindestens vier verschiedenen Sprachen zu lesen sind. Diese im Bild markieren.',
          'FOUR LANGUAGES',
          'Take a photo of a poster that has words in at least four different languages. Mark these words in the picture.'
        ],
        [
          21,
          'EXTRA CHALLENGE',
          'Jedes Team soll das teuerste Gericht einer Speisekarte finden. Ist dieses teurer als jenes der anderen Teams, gewinnt dieses Team die Extra Challenge.',
          'EXTRA CHALLENGE',
          'Each team has to find the most expensive dish on a menu. If it is more expensive than the other teams’ choice, that team wins the Extra Challenge.'
        ]
      ];

      const stmt = db.prepare(`
        INSERT INTO missions (number, title_de, description_de, title_en, description_en)
        VALUES (?, ?, ?, ?, ?)
      `);
      missions.forEach(m => stmt.run(m[0], m[1], m[2], m[3], m[4]));
      stmt.finalize();
      console.log('Missionen in die DB eingefügt.');
    }
  });
});

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// ---------- TEAM-API ----------

// Team beitreten (Option A: gleicher Name = gleiches Team in dieser Runde)
app.post('/api/join', (req, res) => {
  const { teamName } = req.body;
  if (!teamName) return res.status(400).json({ error: 'Teamname fehlt' });

  db.run(
    `INSERT OR IGNORE INTO teams (name) VALUES (?)`,
    [teamName],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Anlegen des Teams' });
      }
      db.get(`SELECT id FROM teams WHERE name = ?`, [teamName], (err2, row) => {
        if (err2 || !row) {
          console.error(err2);
          return res.status(500).json({ error: 'Team konnte nicht geladen werden' });
        }
        res.json({ teamId: row.id });
      });
    }
  );
});

// Missionen laden
app.get('/api/missions', (req, res) => {
  db.all(
    `SELECT id, number, title_de, description_de, title_en, description_en
     FROM missions
     ORDER BY number ASC`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Laden der Missions' });
      }
      res.json(rows);
    }
  );
});

// Einsendung hochladen
app.post('/api/submissions', upload.single('media'), (req, res) => {
  const { teamId, missionId } = req.body;
  if (!teamId || !missionId) return res.status(400).json({ error: 'teamId oder missionId fehlt' });
  if (!req.file) return res.status(400).json({ error: 'Datei fehlt' });

  db.run(
    `INSERT INTO submissions (team_id, mission_id, filename, mimetype, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [teamId, missionId, req.file.filename, req.file.mimetype],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Speichern der Einsendung' });
      }
      res.json({ ok: true, submissionId: this.lastID });
    }
  );
});

// --- TEAM-CHAT ---
app.post('/api/team/messages', (req, res) => {
  const { teamId, text } = req.body;
  if (!teamId || !text) return res.status(400).json({ error: 'teamId oder text fehlt' });

  db.run(
    `INSERT INTO messages (team_id, from_gm, text) VALUES (?, 0, ?)`,
    [teamId, text],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Speichern der Nachricht' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.get('/api/team/messages', (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'teamId fehlt' });

  db.all(
    `SELECT id, from_gm, text, created_at
     FROM messages
     WHERE team_id = ?
     ORDER BY id ASC
     LIMIT 200`,
    [teamId],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Laden der Nachrichten' });
      }
      res.json(rows);
    }
  );
});

// --- TEAM-BROADCASTS ---
app.get('/api/team/broadcasts', (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'teamId fehlt' });

  const sql = `
    SELECT b.id, b.text, b.created_at
    FROM broadcasts b
    LEFT JOIN broadcast_receipts r
      ON r.broadcast_id = b.id AND r.team_id = ?
    WHERE r.broadcast_id IS NULL
    ORDER BY b.created_at ASC
  `;
  db.all(sql, [teamId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB-Fehler beim Laden der Broadcasts' });
    }
    res.json(rows);
  });
});

app.post('/api/team/broadcasts/ack', (req, res) => {
  const { teamId, broadcastId } = req.body;
  if (!teamId || !broadcastId) return res.status(400).json({ error: 'teamId oder broadcastId fehlt' });

  db.run(
    `INSERT OR IGNORE INTO broadcast_receipts (team_id, broadcast_id) VALUES (?, ?)`,
    [teamId, broadcastId],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Bestätigen des Broadcasts' });
      }
      res.json({ ok: true });
    }
  );
});

// --- TIMER für Teams ---
app.get('/api/timer', (req, res) => {
  db.get(`SELECT start_time, duration_minutes FROM game_state WHERE id = 1`, (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB-Fehler beim Laden des Timers' });
    }
    if (!row || !row.start_time) {
      return res.json({ running: false, remainingSeconds: 0 });
    }
    const start = new Date(row.start_time);
    const now = new Date();
    const elapsedMs = now - start;
    const totalMs = row.duration_minutes * 60 * 1000;
    const remainingMs = totalMs - elapsedMs;

    if (remainingMs <= 0) {
      return res.json({ running: false, remainingSeconds: 0 });
    }
    res.json({
      running: true,
      remainingSeconds: Math.floor(remainingMs / 1000)
    });
  });
});

// --- TEAM: Mission-Status (letzte Einsendung pro Mission) ---
app.get('/api/team/mission-status', (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'teamId fehlt' });

  const sql = `
    SELECT s.mission_id AS missionId, s.status
    FROM submissions s
    WHERE s.team_id = ?
      AND s.id IN (
        SELECT MAX(id)
        FROM submissions
        WHERE team_id = ?
        GROUP BY mission_id
      )
  `;

  db.all(sql, [teamId, teamId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB-Fehler beim Laden des Mission-Status' });
    }
    res.json(rows);
  });
});

// ---------- GM-AUTH ----------
const GM_PASSWORD = 'AR1898';
const GM_TOKEN = 'simple-static-token';

function gmAuth(req, res, next) {
  const token = req.headers['x-gm-token'];
  if (token !== GM_TOKEN) {
    return res.status(401).json({ error: 'GM unauthorized' });
  }
  next();
}

app.post('/api/gm/login', (req, res) => {
  const { password } = req.body;
  if (password === GM_PASSWORD) {
    return res.json({ token: GM_TOKEN });
  }
  return res.status(401).json({ error: 'Falsches Passwort' });
});

// --- GM: Teams-Liste ---
app.get('/api/gm/teams', gmAuth, (req, res) => {
  db.all(`SELECT id, name FROM teams ORDER BY name ASC`, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB-Fehler beim Laden der Teams' });
    }
    res.json(rows);
  });
});

// --- GM: Scores / Rangliste ---
app.get('/api/gm/scores', gmAuth, (req, res) => {
  const sql = `
    SELECT t.id AS teamId, t.name AS teamName,
           COALESCE(SUM(CASE WHEN s.status = 'approved' THEN 1 ELSE 0 END), 0) AS points
    FROM teams t
    LEFT JOIN submissions s ON s.team_id = t.id
    GROUP BY t.id, t.name
    ORDER BY points DESC, t.name ASC
  `;
  db.all(sql, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB-Fehler beim Laden der Scores' });
    }
    res.json(rows);
  });
});

// --- GM: Submissions-Liste ---
app.get('/api/gm/submissions', gmAuth, (req, res) => {
  const sql = `
    SELECT s.id,
           s.filename,
           s.mimetype,
           s.status,
           s.comment,
           datetime(s.created_at, 'localtime') AS created_at,
           t.id AS teamId,
           t.name AS teamName,
           m.number AS missionNumber,
           m.title_de AS missionTitleDe,
           m.title_en AS missionTitleEn
    FROM submissions s
    JOIN teams t ON t.id = s.team_id
    JOIN missions m ON m.id = s.mission_id
    ORDER BY s.created_at DESC
  `;
  db.all(sql, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB-Fehler beim Laden der Einsendungen' });
    }
    res.json(rows);
  });
});

// --- GM: Submission bewerten ---
app.post('/api/gm/submissions/:id/review', gmAuth, (req, res) => {
  const { id } = req.params;
  const { status, comment } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status' });
  }

  db.run(
    `UPDATE submissions SET status = ?, comment = ? WHERE id = ?`,
    [status, comment || null, id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Aktualisieren der Einsendung' });
      }
      res.json({ ok: true });
    }
  );
});

// --- GM: Chat lesen + schreiben ---
app.get('/api/gm/messages', gmAuth, (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'teamId fehlt' });

  db.all(
    `SELECT id, from_gm, text, created_at
     FROM messages
     WHERE team_id = ?
     ORDER BY id ASC
     LIMIT 200`,
    [teamId],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Laden der Nachrichten' });
      }
      res.json(rows);
    }
  );
});

app.post('/api/gm/messages', gmAuth, (req, res) => {
  const { teamId, text } = req.body;
  if (!teamId || !text) return res.status(400).json({ error: 'teamId oder text fehlt' });

  db.run(
    `INSERT INTO messages (team_id, from_gm, text) VALUES (?, 1, ?)`,
    [teamId, text],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Speichern der GM-Nachricht' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// --- GM: Chat für EIN Team löschen ---
app.post('/api/gm/chat/reset-team', gmAuth, (req, res) => {
  const { teamId } = req.body;
  if (!teamId) return res.status(400).json({ error: 'teamId fehlt' });

  db.run(
    `DELETE FROM messages WHERE team_id = ?`,
    [teamId],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Löschen des Team-Chats' });
      }
      res.json({ ok: true });
    }
  );
});

// --- GM: Broadcast senden ---
app.post('/api/gm/broadcast', gmAuth, (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text fehlt' });

  db.run(
    `INSERT INTO broadcasts (text) VALUES (?)`,
    [text],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Speichern des Broadcasts' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// --- GM: Timer starten (75 Minuten) ---
app.post('/api/gm/timer/start', gmAuth, (req, res) => {
  const durationMinutes = 75;
  const startTime = new Date().toISOString();

  db.run(
    `
    INSERT INTO game_state (id, start_time, duration_minutes)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE
    SET start_time = excluded.start_time,
        duration_minutes = excluded.duration_minutes
    `,
    [startTime, durationMinutes],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'DB-Fehler beim Starten des Timers' });
      }
      res.json({ ok: true });
    }
  );
});

// --- GM: Timer stoppen (= zurücksetzen) ---
app.post('/api/gm/timer/stop', gmAuth, (req, res) => {
  db.run(`DELETE FROM game_state WHERE id = 1`, [], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB-Fehler beim Stoppen des Timers' });
    }
    res.json({ ok: true });
  });
});

// --- GM: RUNDEN-RESET (alles für diese Runde löschen) ---
app.post('/api/gm/reset', gmAuth, (req, res) => {
  // 1. Upload-Dateien löschen
  fs.readdir(uploadDir, (err, files) => {
    if (!err && files) {
      files.forEach(f => {
        try {
          fs.unlinkSync(path.join(uploadDir, f));
        } catch (e) {
          console.error('Fehler beim Löschen von', f, e);
        }
      });
    }

    // 2. Datenbank-Tabellen leeren (Runden-Daten)
    db.serialize(() => {
      db.run(`DELETE FROM submissions`);
      db.run(`DELETE FROM messages`);
      db.run(`DELETE FROM broadcasts`);
      db.run(`DELETE FROM broadcast_receipts`);
      db.run(`DELETE FROM game_state`);
      db.run(`DELETE FROM teams`, [], function (err2) {
        if (err2) {
          console.error(err2);
          return res.status(500).json({ error: 'DB-Fehler beim Runden-Reset' });
        }
        // Missions bleiben erhalten
        res.json({ ok: true });
      });
    });
  });
});

// ---------- Server ----------
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
