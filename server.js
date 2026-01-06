const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Konfigurasi Database dari Environment Variable
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Konfigurasi CORS (PENTING: Izinkan semua origin atau spesifik domain)
app.use(cors({
    origin: '*', // Izinkan semua origin (paling aman untuk mengatasi masalah CORS saat ini)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Limit besar untuk menerima upload Base64 dari HTML
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Folder 'uploads' bisa diakses browser
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Pastikan folder uploads ada
if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

// --- 1. API LOGIN GURU ---
app.post('/login-guru', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Query disesuaikan dengan struktur tabel users di screenshot pgAdmin
        const result = await pool.query('SELECT * FROM public.users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(401).json({ error: 'Login gagal: Username atau Password salah' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- 2. API LOGIN SISWA ---
app.post('/login-siswa', async (req, res) => {
    const { nomor_induk } = req.body;
    try {
        const result = await pool.query('SELECT * FROM public.siswa WHERE nomor_induk = $1', [nomor_induk]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(401).json({ error: 'Siswa tidak ditemukan' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- 3. API UPLOAD FOTO (Menerima Base64) ---
app.post('/upload', (req, res) => {
    const { fileName, fileData } = req.body; 
    
    if (!fileData) return res.status(400).json({ error: 'Tidak ada data file' });

    // Bersihkan nama file dan buat unik
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.]/g, '_');
    const uniqueName = Date.now() + '_' + cleanFileName;
    const uploadPath = path.join(__dirname, 'uploads', uniqueName);
    
    // Convert Base64 ke File Buffer
    try {
        const buffer = Buffer.from(fileData, 'base64');
        fs.writeFile(uploadPath, buffer, (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Gagal menyimpan file ke disk' });
            }
            // Return URL file yang bisa diakses browser
            const fileUrl = `/uploads/${uniqueName}`; 
            res.json({ status: 'success', url: fileUrl });
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Format data salah' });
    }
});

// --- 4. API SISWA (CRUD) ---
app.get('/siswa', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM public.siswa ORDER BY nama ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/siswa', async (req, res) => {
    const data = req.body;
    // Insert Siswa Baru
    const query = `INSERT INTO public.siswa (nama, nomor_induk, jenis_kelamin, agama, foto, kelas) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
    const values = [data.nama, data.nomor_induk, data.jenis_kelamin, data.agama, data.foto, data.kelas];
    
    try {
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/siswa/:id', async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const query = `UPDATE public.siswa SET nama=$1, nomor_induk=$2, jenis_kelamin=$3, agama=$4, foto=$5 WHERE id=$6 RETURNING *`;
    const values = [data.nama, data.nomor_induk, data.jenis_kelamin, data.agama, data.foto, id];
    try {
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/siswa/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM public.siswa WHERE id=$1', [id]);
        res.json({ status: 'deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 5. API LAPORAN ---
app.get('/laporan', async (req, res) => {
    const { kelas } = req.query; // Bisa filter by kelas (?kelas=4A)
    try {
        let query = 'SELECT * FROM public.laporan';
        let params = [];
        if(kelas) {
            query += ' WHERE kelas = $1';
            params.push(kelas);
        }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/laporan', async (req, res) => {
    const data = req.body;
    // Trik sederhana untuk insert dinamis
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
    
    const query = `INSERT INTO public.laporan (${fields.join(',')}) VALUES (${placeholders}) RETURNING *`;
    
    try {
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/laporan', async (req, res) => {
    const { id, kelas } = req.query;
    try {
        if(id) await pool.query('DELETE FROM public.laporan WHERE id=$1', [id]);
        else if(kelas) await pool.query('DELETE FROM public.laporan WHERE kelas=$1', [kelas]); // Reset per kelas
        res.json({ status: 'deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/laporan/:id', async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    // Update dinamis (hanya field yang dikirim)
    const updates = Object.keys(data).map((key, i) => `${key}=$${i+2}`).join(', ');
    const values = [id, ...Object.values(data)];
    
    const query = `UPDATE public.laporan SET ${updates} WHERE id=$1 RETURNING *`;
    try {
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 6. API PENGATURAN & USER ---
app.get('/pengaturan', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM public.pengaturan WHERE key = 'global'");
        if(result.rows.length > 0) res.json({ data: result.rows[0].data });
        else res.json({ data: {} });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/pengaturan', async (req, res) => {
    const { data } = req.body;
    try {
        const query = `
            INSERT INTO public.pengaturan (key, data) VALUES ('global', $1)
            ON CONFLICT (key) DO UPDATE SET data = $1`;
        await pool.query(query, [data]);
        res.json({ status: 'success' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { nama, username, password, kelas, foto } = req.body;
    try {
        await pool.query('UPDATE public.users SET nama=$1, username=$2, password=$3, kelas=$4, foto=$5 WHERE id=$6', 
            [nama, username, password, kelas, foto, id]);
        res.json({ status: 'updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => {
  console.log(`API Server 7KAIH berjalan di port ${port}`);
});