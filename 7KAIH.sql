-- 1. BERSIHKAN TABEL LAMA (JIKA ADA) AGAR TIDAK ERROR SAAT DI-RUN ULANG
DROP TABLE IF EXISTS public.laporan;
DROP TABLE IF EXISTS public.siswa;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.pengaturan;

-- 2. BUAT TABEL USERS (Untuk Guru & Admin)
-- Catatan: Kita menggunakan tabel custom 'users' agar sesuai dengan logika login aplikasi lama Anda 
-- (username & password biasa), bukan Supabase Auth (Email).
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    username text NOT NULL UNIQUE,
    password text NOT NULL, -- Disimpan plain text sesuai request (Warning: Tidak disarankan untuk Production)
    nama text NOT NULL,
    role text NOT NULL CHECK (role IN ('Guru', 'Admin', 'Kepsek')),
    kelas text, -- Bisa NULL jika Admin/Kepsek
    foto text,
    nip text    -- Opsional, untuk data tambahan
);

-- 3. BUAT TABEL SISWA
CREATE TABLE public.siswa (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    nomor_induk text NOT NULL UNIQUE, -- Digunakan untuk Login Siswa
    nama text NOT NULL,
    kelas text NOT NULL,
    agama text,
    foto text
);

-- 4. BUAT TABEL LAPORAN
CREATE TABLE public.laporan (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    tanggal_kegiatan date NOT NULL,
    
    -- Identitas Pelapor
    siswa_nomor_induk text REFERENCES public.siswa(nomor_induk) ON UPDATE CASCADE,
    nama_siswa text, -- Disimpan juga sebagai snapshot
    kelas text,

    -- Ibadah (Menyimpan teks opsi yang dipilih, misal: 'Subuh', 'Berdoa')
    ibadah1 text,
    ibadah2 text,
    ibadah3 text,
    ibadah4 text,
    ibadah5 text,
    ibadah6 text,
    ibadah7 text,

    -- Waktu
    bangun_pagi time,
    tidur_cepat time,

    -- Kegiatan
    rincian_olahraga text,
    kegiatan_masyarakat text,
    tempat_belajar text,
    materi_belajar text,

    -- Makanan (Boolean / Checkbox)
    makanan_karbo boolean DEFAULT false,
    makanan_sayur boolean DEFAULT false,
    makanan_susu boolean DEFAULT false,
    makanan_lauk boolean DEFAULT false,
    makanan_air boolean DEFAULT false
);

-- 5. BUAT TABEL PENGATURAN (JSONB)
-- Menggunakan JSONB agar struktur pengaturan yang kompleks (seperti di Admin.html)
-- bisa masuk tanpa perlu membuat puluhan tabel kecil.
CREATE TABLE public.pengaturan (
    key text PRIMARY KEY,
    data jsonb
);

-- ==========================================
-- SEEDING DATA (DATA DEFAULT)
-- ==========================================

-- A. Masukkan User GURU (Sesuai Permintaan)
INSERT INTO public.users (username, password, nama, role, kelas, foto)
VALUES 
('Guru', 'Guru1234', 'Guru Utama', 'Guru', '6A', 'https://placehold.co/400x400/png?text=Pak+Guru');

-- B. Masukkan User ADMIN (Opsional, untuk jaga-jaga)
INSERT INTO public.users (username, password, nama, role, kelas)
VALUES 
('Admin', 'Admin123', 'Administrator', 'Admin', NULL);

-- C. Masukkan Data Dummy SISWA (Agar Guru bisa melihat data)
INSERT INTO public.siswa (nomor_induk, nama, kelas, agama, foto)
VALUES 
('12345', 'Budi Santoso', '6A', 'Islam', 'https://placehold.co/400x400/png?text=Budi'),
('67890', 'Siti Aminah', '6A', 'Islam', 'https://placehold.co/400x400/png?text=Siti');

-- D. Masukkan Data Dummy LAPORAN (Agar grafik di dashboard Guru langsung muncul)
INSERT INTO public.laporan (
    tanggal_kegiatan, siswa_nomor_induk, nama_siswa, kelas, 
    bangun_pagi, tidur_cepat, 
    makanan_karbo, makanan_sayur, makanan_air,
    ibadah1, ibadah2
)
VALUES 
(CURRENT_DATE, '12345', 'Budi Santoso', '6A', '04:30', '20:30', true, true, true, 'Subuh', 'Zuhur'),
(CURRENT_DATE, '67890', 'Siti Aminah', '6A', '05:00', '21:00', true, false, true, 'Subuh', 'Berhalangan');

-- E. Masukkan Default PENGATURAN (PENTING: Agar aplikasi tidak error saat load settings)
-- Ini mengambil struktur JSON dari Admin.html Anda
INSERT INTO public.pengaturan (key, data)
VALUES 
('global', '{
  "infoSekolah": {
    "namaSekolah": "SDN Contoh Hebat",
    "namaKepsek": "Bapak Kepala Sekolah, M.Pd",
    "nipKepsek": "198001012000121001",
    "namaTempat": "Jakarta",
    "logo": "https://placehold.co/100x100.png"
  },
  "predikat": { 
    "taatText": "Anak Hebat", 
    "taatValue": 85, 
    "terbiasaText": "Terbiasa", 
    "terbiasaValue": 60,
    "kurangText": "Perlu Bimbingan"
  },
  "waktu": { 
    "bangunPagi": "05:00", 
    "tidurCepat": "21:00" 
  },
  "ibadahSettings": [true, true, true, true, true, false, false],
  "ibadahOptions": {
     "ibadah1": ["Subuh", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah2": ["Zuhur", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah3": ["Asar", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah4": ["Magrib", "Berdoa", "Sembahyang", "Berhalangan"],
     "ibadah5": ["Isya", "Berdoa", "Sembahyang", "Berhalangan"]
  }
}');

-- 6. SETUP POLICY (ROW LEVEL SECURITY)
-- Agar bisa diakses dari Web Client tanpa token Auth Supabase yang rumit (Public Access)
-- Catatan: Dalam production, sebaiknya ini diperketat.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laporan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengaturan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read/write for all" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all" ON public.siswa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all" ON public.laporan FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all" ON public.pengaturan FOR ALL USING (true) WITH CHECK (true);